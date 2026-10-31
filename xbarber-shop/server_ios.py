#!/usr/bin/env python3
"""Local SQLite web server for running XBARBER SHOP from a-Shell on iPad."""

import http.server
import hmac
import ipaddress
import json
import mimetypes
import os
import secrets
import shutil
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("XBARBER_PORT", os.environ.get("PORT", "3000")))
HOST = os.environ.get("XBARBER_HOST", "127.0.0.1")
DATA_DIR = Path(os.environ.get("XBARBER_DATA_DIR", ROOT / "ipad-data")).expanduser().resolve()
DB_PATH = DATA_DIR / "xbarber.db"
BACKUP_DIR = DATA_DIR / "backups"
SESSION_TTL_SECONDS = 12 * 60 * 60
MAX_BODY_BYTES = 5 * 1024 * 1024
LOGIN_WINDOW_SECONDS = 5 * 60
LOGIN_MAX_ATTEMPTS = 8
DEMO_USERNAME = "admin"
DEMO_PASSWORD = "admin123"

sessions = {}
login_attempts = {}
database_lock = threading.RLock()
auth_lock = threading.RLock()

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def connect_database():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB_PATH), timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def initialize_database():
    with database_lock:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        connection = connect_database()
        try:
            connection.executescript((ROOT / "database" / "schema.sql").read_text(encoding="utf-8"))
            customer_columns = {row["name"] for row in connection.execute("PRAGMA table_info(customers)")}
            if "is_active" not in customer_columns:
                connection.execute(
                    "ALTER TABLE customers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
                )

            order_columns = {row["name"] for row in connection.execute("PRAGMA table_info(orders)")}
            if "barber_id" not in order_columns:
                connection.execute(
                    "ALTER TABLE orders ADD COLUMN barber_id INTEGER REFERENCES barbers(id)"
                )
            product_columns = {row["name"] for row in connection.execute("PRAGMA table_info(products)")}
            if "category_id" not in product_columns:
                connection.execute(
                    "ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)"
                )
            product_columns = {row["name"] for row in connection.execute("PRAGMA table_info(products)")}
            if "image_data" not in product_columns:
                connection.execute("ALTER TABLE products ADD COLUMN image_data TEXT")
            customer_columns = {row["name"] for row in connection.execute("PRAGMA table_info(customers)")}
            if "image_data" not in customer_columns:
                connection.execute("ALTER TABLE customers ADD COLUMN image_data TEXT")
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)"
            )
            connection.execute(
                "UPDATE settings SET currency = 'IQD' WHERE currency IS NULL OR currency <> 'IQD'"
            )

            for name, table in (
                ("clear-service-catalog-v1", "services"),
                ("clear-product-catalog-v1", "products"),
            ):
                existing = connection.execute(
                    "SELECT name FROM app_migrations WHERE name = ?", (name,)
                ).fetchone()
                if existing is None:
                    connection.execute(f"DELETE FROM {table}")
                    connection.execute("INSERT INTO app_migrations (name) VALUES (?)", (name,))
            connection.commit()
        finally:
            connection.close()


def is_private_address(value):
    try:
        address = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


def normalized_params(values):
    if not isinstance(values, list):
        return []
    result = []
    for value in values:
        if value is None or isinstance(value, (str, int, float)):
            result.append(value)
        elif isinstance(value, bool):
            result.append(int(value))
        else:
            raise RequestError(400, "Invalid query parameter.")
    return result


def check_query(query):
    if not isinstance(query, str) or not query.strip():
        raise RequestError(400, "A SQL query is required.")
    if len(query) > 20000 or "\x00" in query:
        raise RequestError(400, "Invalid query.")
    return query


def contained_path(value, parent):
    target = Path(value).expanduser()
    if not target.is_absolute():
        target = parent / target
    target = target.resolve()
    try:
        target.relative_to(parent.resolve())
    except ValueError as error:
        raise RequestError(400, "Choose a file inside the iPad backups folder.") from error
    return target


def backup_destination(raw_path):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    value = str(raw_path or "").strip()
    if not value:
        value = f"xbarber-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    target = contained_path(value, BACKUP_DIR)
    if target == DB_PATH.resolve():
        raise RequestError(400, "Choose a different backup file name.")
    if target.suffix.lower() not in (".db", ".sqlite", ".sqlite3"):
        target = target.with_name(target.name + ".db")
    return target


def restore_source(raw_path):
    value = str(raw_path or "").strip()
    if not value:
        raise RequestError(400, "Enter a backup file name.")
    target = contained_path(value, BACKUP_DIR)
    if not target.exists() and not target.suffix:
        target = target.with_name(target.name + ".db")
    if not target.is_file():
        raise RequestError(404, "Backup file not found in the iPad backups folder.")
    if target.suffix.lower() not in (".db", ".sqlite", ".sqlite3"):
        raise RequestError(400, "Choose a .db, .sqlite, or .sqlite3 backup file.")
    with target.open("rb") as backup_file:
        if backup_file.read(16) != b"SQLite format 3\x00":
            raise RequestError(400, "That file is not a valid SQLite database.")
    return target


def session_for(handler):
    token = None
    for part in handler.headers.get("Cookie", "").split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name == "xbarber_session":
            token = value
            break
    if not token:
        return None
    with auth_lock:
        session = sessions.get(token)
        if session is None:
            return None
        if session <= time.time():
            del sessions[token]
            return None
        sessions[token] = time.time() + SESSION_TTL_SECONDS
        return token


class XBarberHandler(http.server.BaseHTTPRequestHandler):
    server_version = "XBarberLocal/1.0"

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise RequestError(400, "Invalid request body.") from error
        if size < 0:
            raise RequestError(400, "Invalid request body.")
        if size > MAX_BODY_BYTES:
            raise RequestError(413, "Request body is too large.")
        raw = self.rfile.read(size)
        if not raw:
            return {}
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RequestError(400, "Invalid JSON body.") from error
        if not isinstance(value, dict):
            raise RequestError(400, "Invalid JSON body.")
        return value

    def check_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return
        if urlsplit(origin).netloc != self.headers.get("Host", ""):
            raise RequestError(403, "Request blocked.")

    def do_GET(self):
        self.handle_request("GET")

    def do_HEAD(self):
        self.handle_request("HEAD")

    def do_POST(self):
        self.handle_request("POST")

    def handle_request(self, method):
        started = time.time()
        pathname = "/"
        try:
            if not is_private_address(self.client_address[0]):
                raise RequestError(403, "This server only accepts local connections.")
            parsed = urlsplit(self.path)
            pathname = parsed.path
            if pathname.startswith("/api/"):
                if method != "POST":
                    raise RequestError(405, "Method not allowed.")
                self.handle_api(pathname)
            else:
                if method not in ("GET", "HEAD"):
                    raise RequestError(405, "Method not allowed.")
                self.serve_static(pathname, method == "HEAD")
        except RequestError as error:
            if pathname.startswith("/api/"):
                self.send_json(error.status, {"error": str(error)})
            else:
                self.send_text(error.status, str(error))
        except Exception as error:
            print(f"{method} {pathname} failed: {error}")
            if pathname.startswith("/api/"):
                self.send_json(500, {"error": "The local server could not complete that request."})
            else:
                self.send_text(500, "Server error")
        finally:
            if pathname.startswith("/api/") and time.time() - started > 1.5:
                print(f"Slow request {method} {pathname}")

    def send_text(self, status, text):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, pathname):
        self.check_origin()
        if pathname == "/api/login":
            self.handle_login()
            return

        if session_for(self) is None:
            raise RequestError(401, "Please log in again.")
        if pathname == "/api/session":
            self.send_json(200, {"ok": True})
        elif pathname == "/api/db-query":
            self.handle_db_query()
        elif pathname == "/api/db-run":
            self.handle_db_run()
        elif pathname == "/api/clear-history":
            self.handle_clear_history()
        elif pathname == "/api/backup-database":
            self.handle_backup()
        elif pathname == "/api/restore-database":
            self.handle_restore()
        else:
            raise RequestError(404, "API route not found.")

    def handle_login(self):
        address = self.client_address[0]
        now = time.time()
        with auth_lock:
            attempts = login_attempts.get(address)
            if attempts and attempts[1] > now and attempts[0] >= LOGIN_MAX_ATTEMPTS:
                raise RequestError(429, "Too many login attempts. Please wait a few minutes.")
            if attempts and attempts[1] <= now:
                login_attempts.pop(address, None)

        body = self.read_json()
        username = body.get("username", "")
        password = body.get("password", "")
        if not isinstance(username, str) or not isinstance(password, str):
            username = password = ""
        valid = hmac.compare_digest(username.strip(), DEMO_USERNAME) and hmac.compare_digest(
            password, DEMO_PASSWORD
        )
        if not valid:
            with auth_lock:
                attempts = login_attempts.get(address)
                if not attempts or attempts[1] <= now:
                    login_attempts[address] = [1, now + LOGIN_WINDOW_SECONDS]
                else:
                    attempts[0] += 1
            raise RequestError(401, "Invalid username or password.")

        with auth_lock:
            login_attempts.pop(address, None)
            token = secrets.token_hex(32)
            sessions[token] = time.time() + SESSION_TTL_SECONDS
        self.send_json(
            200,
            {"ok": True},
            {
                "Set-Cookie": (
                    f"xbarber_session={token}; HttpOnly; Path=/; SameSite=Strict; "
                    f"Max-Age={SESSION_TTL_SECONDS}"
                )
            },
        )

    def handle_db_query(self):
        body = self.read_json()
        query = check_query(body.get("query"))
        if query.lstrip().split(None, 1)[0].upper() not in ("SELECT", "WITH"):
            raise RequestError(403, "Only read queries are allowed here.")
        with database_lock:
            connection = connect_database()
            try:
                rows = connection.execute(query, normalized_params(body.get("params"))).fetchall()
                self.send_json(200, [dict(row) for row in rows])
            finally:
                connection.close()

    def handle_db_run(self):
        body = self.read_json()
        query = check_query(body.get("query"))
        if query.lstrip().split(None, 1)[0].upper() not in ("INSERT", "UPDATE", "DELETE"):
            raise RequestError(403, "Only data-changing queries are allowed here.")
        with database_lock:
            connection = connect_database()
            try:
                cursor = connection.execute(query, normalized_params(body.get("params")))
                connection.commit()
                result = {"lastID": cursor.lastrowid, "changes": cursor.rowcount}
                self.send_json(200, result)
            finally:
                connection.close()

    def handle_clear_history(self):
        body = self.read_json()
        today = body.get("today")
        try:
            datetime.strptime(today, "%Y-%m-%d")
        except (TypeError, ValueError) as error:
            raise RequestError(400, "A valid current date is required to clear history.") from error
        with database_lock:
            connection = connect_database()
            try:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    "DELETE FROM appointments WHERE date < ? OR "
                    "(date = ? AND status IN ('completed', 'cancelled'))",
                    (today, today),
                )
                connection.execute("DELETE FROM payments")
                connection.execute("DELETE FROM order_items")
                connection.execute("DELETE FROM orders")
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()
        self.send_json(200, {"ok": True})

    def handle_backup(self):
        body = self.read_json()
        target = backup_destination(body.get("path"))
        with database_lock:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                target.unlink()
            source = connect_database()
            destination = sqlite3.connect(str(target))
            try:
                source.backup(destination)
            finally:
                destination.close()
                source.close()
        self.send_json(200, {"filePath": target.name})

    def handle_restore(self):
        body = self.read_json()
        source = restore_source(body.get("path"))
        with database_lock:
            for suffix in ("-wal", "-shm"):
                sidecar = Path(str(DB_PATH) + suffix)
                if sidecar.exists():
                    sidecar.unlink()
            shutil.copyfile(source, DB_PATH)
            initialize_database()
        self.send_json(200, {"ok": True})

    def serve_static(self, pathname, head_only):
        if pathname == "/":
            self.send_response(302)
            self.send_header("Location", "/src/index.html")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        try:
            decoded = unquote(pathname)
            target = (ROOT / decoded.lstrip("/")).resolve()
            allowed_directories = (ROOT / "src", ROOT / "assets", ROOT / "database", ROOT / "vendor")
            allowed_files = (
                ROOT / "manifest.json",
                ROOT / "sw.js",
                ROOT / "precache-manifest.json",
                ROOT / "app-mode.json",
            )
            if target not in allowed_files and not any(
                target == allowed or allowed in target.parents
                for allowed in allowed_directories
            ):
                raise RequestError(403, "Forbidden")
            if not target.is_file():
                raise RequestError(404, "Not found")
        except (OSError, ValueError) as error:
            raise RequestError(404, "Not found") from error

        body_length = target.stat().st_size
        self.send_response(200)
        self.send_header(
            "Content-Type",
            MIME_TYPES.get(target.suffix.lower(), mimetypes.guess_type(str(target))[0] or "application/octet-stream"),
        )
        self.send_header("Content-Length", str(body_length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.end_headers()
        if not head_only:
            with target.open("rb") as source:
                shutil.copyfileobj(source, self.wfile)


class LocalHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    initialize_database()
    try:
        server = LocalHTTPServer((HOST, PORT), XBarberHandler)
    except OSError as error:
        raise SystemExit(f"Could not start XBARBER SHOP server: {error}") from error
    print("")
    print("XBARBER SHOP - iPad local server")
    print(f"Database:  {DB_PATH}")
    print(f"Open Safari on this iPad: http://127.0.0.1:{PORT}")
    print("Login: admin / admin123")
    print("Keep a-Shell open while using the app. Press Ctrl+C to stop.")
    print("")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping XBARBER SHOP server...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
