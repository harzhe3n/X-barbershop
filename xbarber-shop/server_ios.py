#!/usr/bin/env python3
"""Local SQLite web server for running XBARBER SHOP from a-Shell on iPad."""

import http.server
import hashlib
import hmac
import re
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
# The default history password (Xx2727Xx); the owner can change it in Settings. Same as src/js/app.js.
DEFAULT_HISTORY_PASSWORD_HASH = (
    "sha256i$2000$e5c1d0a94b7f3c2a6d18f0b9$a3be0402ed692e89e332b4cbc0f6e386678ea349fb58a7c0881bb1b69dca4965"
)
PASSWORD_CHECK_MAX = 10
# Barbers change their own clients. Sign-ins, photos, product sales, the catalog and shop settings
# are for the owner only (same rules as server.js).
OWNER_ONLY_TABLES = re.compile(
    r"\b(admins|barber_accounts|barber_photos|product_sales|product_sale_items|settings|barbers|services|categories)\b",
    re.IGNORECASE,
)
OPTION_WRITES = {
    "INSERT OR REPLACE INTO app_options (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
    "DELETE FROM app_options WHERE key = ?",
}
OWN_OPTION_KEY = re.compile(r"^(?:slot\.barber\.(\d+)|extra\.(\d+)\.\d{4}-\d{2}-\d{2}|off\.(\d+)\.\d{4}-\d{2}-\d{2})$")

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
            # Shops that kept the old default closed at 10 PM; the shop is open until midnight.
            if connection.execute(
                "SELECT name FROM app_migrations WHERE name = 'hours-midnight-v1'"
            ).fetchone() is None:
                connection.execute(
                    "UPDATE app_options SET value = '00:00', updated_at = CURRENT_TIMESTAMP "
                    "WHERE key = 'booking.close' AND value = '22:00'"
                )
                connection.execute("INSERT OR IGNORE INTO app_migrations (name) VALUES ('hours-midnight-v1')")
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


def sha256_hex(text):
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()


def verify_password(password, stored):
    """Same steps as src/js/auth.js: sha256i$<iterations>$<salt>$<hex>."""
    parts = str(stored or "").split("$")
    if len(parts) != 4 or parts[0] != "sha256i" or not parts[2]:
        return False
    try:
        iterations = int(parts[1])
    except ValueError:
        return False
    if not 1 <= iterations <= 100000:
        return False
    value = sha256_hex(f"{parts[2]}:{password}")
    for _ in range(iterations - 1):
        value = sha256_hex(value + parts[2])
    return hmac.compare_digest(value, parts[3])


def hash_password(password, iterations=2000):
    salt = secrets.token_hex(12)
    value = sha256_hex(f"{salt}:{password}")
    for _ in range(iterations - 1):
        value = sha256_hex(value + salt)
    return f"sha256i${iterations}${salt}${value}"


def read_value(query, params=()):
    with database_lock:
        connection = connect_database()
        try:
            row = connection.execute(query, params).fetchone()
            return row[0] if row else None
        finally:
            connection.close()


def verify_admin(password):
    """The owner signs in as "admin". Until the password is changed in Settings it is admin123."""
    stored = str(read_value("SELECT password_hash FROM admins WHERE username = 'admin'") or "")
    if stored.startswith("sha256i$"):
        return verify_password(password, stored)
    return hmac.compare_digest(password, DEMO_PASSWORD)


def find_barber_account(username):
    if not username:
        return None
    with database_lock:
        connection = connect_database()
        try:
            row = connection.execute(
                "SELECT a.username, a.password_hash, a.barber_id, b.name "
                "FROM barber_accounts a JOIN barbers b ON b.id = a.barber_id "
                "WHERE a.username = ? COLLATE NOCASE AND a.is_active = 1 AND b.is_active = 1",
                (username,),
            ).fetchone()
            return dict(row) if row else None
        finally:
            connection.close()


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
        if session["expires"] <= time.time():
            del sessions[token]
            return None
        session["expires"] = time.time() + SESSION_TTL_SECONDS
        return session


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

        session = session_for(self)
        if session is None:
            raise RequestError(401, "Please log in again.")
        self.session = session
        if pathname in ("/api/clear-history", "/api/backup-database", "/api/restore-database", "/api/admin-password") and session["role"] != "admin":
            raise RequestError(403, "Only the owner can do this.")
        if pathname == "/api/session":
            self.send_json(200, {"ok": True})
        elif pathname == "/api/check-history-password":
            self.handle_check_history_password()
        elif pathname == "/api/admin-password":
            self.handle_admin_password()
        elif pathname == "/api/db-query":
            self.handle_db_query()
        elif pathname == "/api/db-run":
            self.handle_db_run()
        elif pathname == "/api/db-transaction":
            self.handle_db_transaction()
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
        username = username.strip()
        user = None
        if hmac.compare_digest(username.lower(), DEMO_USERNAME):
            if verify_admin(password):
                user = {"role": "admin", "username": DEMO_USERNAME}
        else:
            account = find_barber_account(username)
            if account and verify_password(password, account["password_hash"]):
                user = {
                    "role": "barber",
                    "username": account["username"],
                    "barberId": int(account["barber_id"]),
                    "name": account["name"],
                }
        if user is None:
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
            sessions[token] = {
                "expires": time.time() + SESSION_TTL_SECONDS,
                "role": user["role"],
                "barber_id": user.get("barberId"),
            }
        self.send_json(
            200,
            {"ok": True, "user": user},
            {
                "Set-Cookie": (
                    f"xbarber_session={token}; HttpOnly; Path=/; SameSite=Strict; "
                    f"Max-Age={SESSION_TTL_SECONDS}"
                )
            },
        )

    def check_write_allowed(self, query, params=None):
        session = getattr(self, "session", None) or {}
        if session.get("role") == "admin":
            return
        if OWNER_ONLY_TABLES.search(query):
            raise RequestError(403, "Only the owner can do this.")
        if re.search(r"\bapp_options\b", query, re.IGNORECASE):
            # A barber may only set their own time between clients, added slots and days off.
            shape = " ".join(query.split())
            key = str((params or [None])[0] if params else "")
            match = OWN_OPTION_KEY.match(key)
            barber_id = int(next(group for group in match.groups() if group)) if match else None
            if shape not in OPTION_WRITES or barber_id is None or barber_id != session.get("barber_id"):
                raise RequestError(403, "Only the owner can do this.")

    def check_read_allowed(self, query):
        session = getattr(self, "session", None) or {}
        if session.get("role") == "admin":
            return
        if re.search(r"\b(admins|barber_accounts)\b", query, re.IGNORECASE) or re.search(r"history_password", query, re.IGNORECASE):
            raise RequestError(403, "Only the owner can do this.")

    def handle_check_history_password(self):
        """The history password is checked here, so its hash never reaches a barber's device."""
        now = time.time()
        checks = self.session.get("checks")
        if not checks or checks[1] <= now:
            checks = self.session["checks"] = [0, now + LOGIN_WINDOW_SECONDS]
        checks[0] += 1
        if checks[0] > PASSWORD_CHECK_MAX:
            raise RequestError(429, "Too many tries. Please wait a few minutes.")
        body = self.read_json()
        password = body.get("password") if isinstance(body.get("password"), str) else ""
        stored = read_value("SELECT value FROM app_options WHERE key = 'history_password'") or DEFAULT_HISTORY_PASSWORD_HASH
        ok = verify_password(password, stored)
        if ok:
            self.session["checks"] = None
        self.send_json(200, {"ok": ok})

    def handle_admin_password(self):
        """The owner changes their own sign-in password (the username stays admin)."""
        body = self.read_json()
        current = body.get("current") if isinstance(body.get("current"), str) else ""
        new = body.get("next") if isinstance(body.get("next"), str) else ""
        if not 6 <= len(new) <= 100:
            raise RequestError(400, "Use at least 6 characters.")
        if not verify_admin(current):
            raise RequestError(403, "The current password is wrong.")
        hashed = hash_password(new)
        with database_lock:
            connection = connect_database()
            try:
                cursor = connection.execute("UPDATE admins SET password_hash = ? WHERE username = 'admin'", (hashed,))
                if cursor.rowcount == 0:
                    connection.execute("INSERT INTO admins (username, password_hash) VALUES ('admin', ?)", (hashed,))
                connection.commit()
            finally:
                connection.close()
        with auth_lock:
            for token in [token for token, value in sessions.items() if value.get("role") == "admin" and value is not self.session]:
                sessions.pop(token, None)
        self.send_json(200, {"ok": True})

    def handle_db_query(self):
        body = self.read_json()
        query = check_query(body.get("query"))
        if query.lstrip().split(None, 1)[0].upper() not in ("SELECT", "WITH"):
            raise RequestError(403, "Only read queries are allowed here.")
        self.check_read_allowed(query)
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
        self.check_write_allowed(query, body.get("params") if isinstance(body.get("params"), list) else [])
        with database_lock:
            connection = connect_database()
            try:
                cursor = connection.execute(query, normalized_params(body.get("params")))
                connection.commit()
                result = {"lastID": cursor.lastrowid, "changes": cursor.rowcount}
                self.send_json(200, result)
            finally:
                connection.close()

    def handle_db_transaction(self):
        body = self.read_json()
        statements = body.get("statements")
        if not isinstance(statements, list) or not 1 <= len(statements) <= 100:
            raise RequestError(400, "A transaction must contain between 1 and 100 statements.")
        with database_lock:
            connection = connect_database()
            try:
                connection.execute("BEGIN IMMEDIATE")
                results = []
                for statement in statements:
                    if not isinstance(statement, dict):
                        raise RequestError(400, "Invalid transaction statement.")
                    query = check_query(statement.get("query"))
                    if query.lstrip().split(None, 1)[0].upper() not in ("INSERT", "UPDATE", "DELETE", "REPLACE"):
                        raise RequestError(403, "Transactions only accept data-changing queries.")
                    raw_params = statement.get("params")
                    self.check_write_allowed(query, raw_params if isinstance(raw_params, list) else [])
                    params = []
                    for value in raw_params if isinstance(raw_params, list) else []:
                        reference = value.get("lastIDFrom") if isinstance(value, dict) else None
                        if isinstance(reference, int) and not isinstance(reference, bool):
                            if reference < 0 or reference >= len(results) or results[reference]["lastID"] is None:
                                raise RequestError(400, "Invalid transaction result reference.")
                            params.append(results[reference]["lastID"])
                        else:
                            params.append(value)
                    cursor = connection.execute(query, normalized_params(params))
                    results.append({"lastID": cursor.lastrowid, "changes": cursor.rowcount})
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()
        self.send_json(200, results)

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
                connection.execute("DELETE FROM product_sale_items")
                connection.execute("DELETE FROM product_sales")
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
    print("Owner sign-in: admin (password admin123 until it is changed in Settings)")
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
