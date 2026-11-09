'use strict';

/*
 * XBARBER SHOP server.
 *
 * On the shop's VPS it serves, from one database:
 *   /              the booking website (site/)
 *   /cashier       the cashier app (src/), for the owner and every barber
 *   /api/public/*  the website's booking API (no sign-in)
 *   /api/*         the cashier's API (sign-in required)
 * On a shop PC it can also run on the local Wi-Fi only (the default). See docs/VPS-SETUP.md.
 *
 * Settings (environment variables):
 *   XBARBER_PORT / PORT     port (default 3000)
 *   XBARBER_HOST            address to listen on (default 0.0.0.0; use 127.0.0.1 behind nginx)
 *   XBARBER_DATA_DIR        folder for the database and backups
 *   XBARBER_PUBLIC=1        accept connections from the internet (not only the local network)
 *   XBARBER_TRUST_PROXY=1   behind nginx: read the visitor's address and https from its headers
 *   XBARBER_SECURE_COOKIE=1 sign-in cookie only over https
 *   XBARBER_TZ              the shop's time zone (default Asia/Baghdad)
 *   XBARBER_WHATSAPP_DEBUG=1 show the WhatsApp library's messages in the log
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const Slots = require('./src/js/slots.js');
const WhatsApp = require('./whatsapp.js');

const ROOT = __dirname;
const PORT = Number(process.env.XBARBER_PORT || process.env.PORT || 3000);
const HOST = process.env.XBARBER_HOST || '0.0.0.0';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'admin123';
// The default history password (Xx2727Xx); the owner can change it in Settings. Same as src/js/app.js.
const DEFAULT_HISTORY_PASSWORD_HASH = 'sha256i$2000$e5c1d0a94b7f3c2a6d18f0b9$a3be0402ed692e89e332b4cbc0f6e386678ea349fb58a7c0881bb1b69dca4965';
const PUBLIC_MODE = process.env.XBARBER_PUBLIC === '1';
const TRUST_PROXY = process.env.XBARBER_TRUST_PROXY === '1';
const SECURE_COOKIE = process.env.XBARBER_SECURE_COOKIE === '1';
const SHOP_TZ = process.env.XBARBER_TZ || 'Asia/Baghdad';
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const BOOKING_WINDOW_MS = 60 * 60 * 1000;
const BOOKING_MAX_PER_WINDOW = 10;
const BOOKINGS_PER_PHONE = 2;
const PASSWORD_CHECK_MAX = 10;

const DATA_DIR = process.env.XBARBER_DATA_DIR
  ? path.resolve(process.env.XBARBER_DATA_DIR)
  : path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'xbarber-shop');
const DB_PATH = path.join(DATA_DIR, 'xbarber.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

let db = null;
let opening = null;
let operationQueue = Promise.resolve();

const sessions = new Map();
const loginAttempts = new Map();

function serialize(task) {
  const next = operationQueue.then(task, task);
  operationQueue = next.catch(() => {});
  return next;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function openConnection() {
  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(DB_PATH, error => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
}

function dbAll(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

function dbGet(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
  });
}

function dbRun(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, function (error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbExec(connection, sql) {
  return new Promise((resolve, reject) => {
    connection.exec(sql, error => error ? reject(error) : resolve());
  });
}

async function openDatabase() {
  if (db) return db;
  if (opening) return opening;

  opening = (async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const connection = await openConnection();

    try {
      await dbRun(connection, 'PRAGMA busy_timeout = 5000');
      const schema = fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8');
      await dbExec(connection, schema);

      const customerColumns = await dbAll(connection, 'PRAGMA table_info(customers)');
      if (!customerColumns.some(column => column.name === 'is_active')) {
        await dbRun(connection, 'ALTER TABLE customers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1');
      }

      const orderColumns = await dbAll(connection, 'PRAGMA table_info(orders)');
      if (!orderColumns.some(column => column.name === 'barber_id')) {
        await dbRun(connection, 'ALTER TABLE orders ADD COLUMN barber_id INTEGER REFERENCES barbers(id)');
      }

      const productColumns = await dbAll(connection, 'PRAGMA table_info(products)');
      if (!productColumns.some(column => column.name === 'category_id')) {
        await dbRun(connection, 'ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)');
      }
      const updatedProductColumns = await dbAll(connection, 'PRAGMA table_info(products)');
      if (!updatedProductColumns.some(column => column.name === 'image_data')) {
        await dbRun(connection, 'ALTER TABLE products ADD COLUMN image_data TEXT');
      }
      const customerImageColumns = await dbAll(connection, 'PRAGMA table_info(customers)');
      if (!customerImageColumns.some(column => column.name === 'image_data')) {
        await dbRun(connection, 'ALTER TABLE customers ADD COLUMN image_data TEXT');
      }
      await dbRun(connection, 'CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)');
      await dbRun(connection, "UPDATE settings SET currency = 'IQD' WHERE currency IS NULL OR currency <> 'IQD'");

      const migrations = [
        { name: 'clear-service-catalog-v1', table: 'services' },
        { name: 'clear-product-catalog-v1', table: 'products' }
      ];

      for (const migration of migrations) {
        const existing = await dbGet(connection, 'SELECT name FROM app_migrations WHERE name = ?', [migration.name]);
        if (existing) continue;
        await dbRun(connection, `DELETE FROM ${migration.table}`);
        await dbRun(connection, 'INSERT INTO app_migrations (name) VALUES (?)', [migration.name]);
      }

      // Shops that kept the old default closed at 10 PM; the shop is open until midnight.
      if (!await dbGet(connection, "SELECT name FROM app_migrations WHERE name = 'hours-midnight-v1'")) {
        await dbRun(connection, "UPDATE app_options SET value = '00:00', updated_at = CURRENT_TIMESTAMP WHERE key = 'booking.close' AND value = '22:00'");
        await dbRun(connection, "INSERT OR IGNORE INTO app_migrations (name) VALUES ('hours-midnight-v1')");
      }

      db = connection;
      return db;
    } catch (error) {
      connection.close();
      throw error;
    } finally {
      opening = null;
    }
  })();

  return opening;
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    const connection = db;
    db = null;
    connection.close(error => error ? reject(error) : resolve());
  });
}

function copyDatabase(connection, destination) {
  return new Promise((resolve, reject) => {
    const backup = connection.backup(destination, initializeError => {
      if (initializeError) return reject(initializeError);

      const step = () => {
        backup.step(-1, (stepError, done) => {
          if (stepError) {
            backup.finish(() => reject(stepError));
            return;
          }
          if (!done) return step();
          backup.finish(finishError => finishError ? reject(finishError) : resolve());
        });
      };

      step();
    });
  });
}

function normalizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(value => {
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    throw httpError(400, 'Invalid query parameter.');
  });
}

function assertQuery(query) {
  if (typeof query !== 'string' || !query.trim()) throw httpError(400, 'A SQL query is required.');
  if (query.length > 20000) throw httpError(400, 'Query is too long.');
  if (query.includes('\u0000')) throw httpError(400, 'Invalid query.');
  return query;
}

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(httpError(400, 'Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(body);
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (error) {
      cookies[name] = value;
    }
  });
  return cookies;
}

function isPrivateAddress(address) {
  if (!address) return false;
  const value = address.replace(/^::ffff:/i, '');
  if (value === '::1' || value.startsWith('127.') || value === 'localhost') return true;
  if (value.startsWith('10.') || value.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(value)) return true;
  if (value.startsWith('169.254.')) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value)) return true;
  if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
  return false;
}

function currentSession(req) {
  const token = parseCookies(req.headers.cookie).xbarber_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, session };
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Same steps as src/js/auth.js: sha256i$<iterations>$<salt>$<hex>
function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'sha256i') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000 || !parts[2]) return false;
  let hash = sha256Hex(`${parts[2]}:${password}`);
  for (let i = 1; i < iterations; i += 1) hash = sha256Hex(hash + parts[2]);
  return safeEqual(hash, parts[3]);
}

function hashPassword(password, iterations = 2000) {
  const salt = crypto.randomBytes(12).toString('hex');
  let hash = sha256Hex(`${salt}:${password}`);
  for (let i = 1; i < iterations; i += 1) hash = sha256Hex(hash + salt);
  return `sha256i$${iterations}$${salt}$${hash}`;
}

// The owner signs in as "admin". Until the password is changed in Settings it is admin123.
async function verifyAdmin(password) {
  const row = await serialize(async () => dbGet(await openDatabase(), "SELECT password_hash FROM admins WHERE username = 'admin'"));
  const stored = String(row?.password_hash || '');
  return stored.startsWith('sha256i$') ? verifyPassword(password, stored) : safeEqual(password, DEMO_PASSWORD);
}

async function findBarberAccount(username) {
  if (!username) return null;
  return serialize(async () => {
    const connection = await openDatabase();
    return dbGet(
      connection,
      `SELECT a.username, a.password_hash, a.barber_id, b.name
       FROM barber_accounts a JOIN barbers b ON b.id = a.barber_id
       WHERE a.username = ? COLLATE NOCASE AND a.is_active = 1 AND b.is_active = 1`,
      [username]
    );
  });
}

function requireAdmin(session) {
  if (session.session.role !== 'admin') throw httpError(403, 'Only the admin can do this.');
}

// Barbers change their own clients. Sign-ins, photos, product sales, the catalog and shop settings
// are for the owner only.
const OWNER_ONLY_TABLES = /\b(admins|barber_accounts|barber_photos|product_sales|product_sale_items|expenses|settings|barbers|services|categories)\b/i;
// The only two ways the cashier writes app_options (see setOption in src/js/app.js).
const OPTION_WRITES = new Set([
  'INSERT OR REPLACE INTO app_options (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
  'DELETE FROM app_options WHERE key = ?'
]);

// Finishing a client (marking it paid) is for the owner only.
function finishesClient(query, params) {
  if (!/\borders\b/i.test(query)) return false;
  if (/\bstatus\s*=\s*'completed'/i.test(query)) return true;
  return /\bstatus\b/i.test(query) && params.some(value => String(value).toLowerCase() === 'completed');
}

function assertWriteAllowed(session, query, params = []) {
  if (session.session.role === 'admin') return;
  if (OWNER_ONLY_TABLES.test(query)) throw httpError(403, 'Only the owner can do this.');
  if (finishesClient(query, params)) throw httpError(403, 'Only the owner can finish a client.');
  if (/\bapp_options\b/i.test(query)) {
    // A barber may only set their own time between clients, added and deleted slots, days off and Open / Closed.
    const shape = query.replace(/\s+/g, ' ').trim();
    const match = /^(?:slot\.barber\.(\d+)|extra\.(\d+)\.\d{4}-\d{2}-\d{2}|off\.(\d+)\.\d{4}-\d{2}-\d{2}|online\.(\d+)|skip\.(\d+)\.\d{4}-\d{2}-\d{2}|days\.barber\.(\d+))$/.exec(String(params[0] ?? ''));
    const barberId = match ? Number(match.slice(1).find(Boolean)) : null;
    if (!OPTION_WRITES.has(shape) || barberId == null || barberId !== Number(session.session.barberId)) {
      throw httpError(403, 'Only the owner can do this.');
    }
  }
}

function assertReadAllowed(session, query) {
  if (session.session.role === 'admin') return;
  // Barbers do not see sign-ins, the history password or the shop's expenses.
  if (/\b(admins|barber_accounts|expenses)\b/i.test(query) || /history_password/i.test(query)) {
    throw httpError(403, 'Only the owner can do this.');
  }
}

function clientAddress(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function secureRequest(req) {
  return SECURE_COOKIE || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

function loginBlocked(address) {
  const entry = loginAttempts.get(address);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    loginAttempts.delete(address);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(address) {
  const now = Date.now();
  const entry = loginAttempts.get(address);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(address, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (error) {
    return false;
  }
}

function timestamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function expandHome(value) {
  return value.replace(/^~(?=$|[\\/])/, os.homedir());
}

function resolveBackupDestination(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    return path.join(BACKUP_DIR, `xbarber-backup-${timestamp()}.db`);
  }
  const target = path.isAbsolute(expandHome(value))
    ? path.normalize(expandHome(value))
    : path.join(BACKUP_DIR, expandHome(value));
  return path.extname(target) ? target : `${target}.db`;
}

function resolveRestoreSource(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) throw httpError(400, 'A backup file path is required.');
  const expanded = expandHome(value);
  let target = path.isAbsolute(expanded) ? path.normalize(expanded) : path.join(BACKUP_DIR, expanded);
  if (!fs.existsSync(target) && !path.extname(target) && fs.existsSync(`${target}.db`)) {
    target = `${target}.db`;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    throw httpError(404, 'Backup file not found.');
  }
  const extension = path.extname(target).toLowerCase();
  if (!['.db', '.sqlite', '.sqlite3'].includes(extension)) {
    throw httpError(400, 'Choose a .db, .sqlite, or .sqlite3 backup file.');
  }
  const header = Buffer.alloc(16);
  const descriptor = fs.openSync(target, 'r');
  try {
    fs.readSync(descriptor, header, 0, 16, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (header.toString('utf8') !== 'SQLite format 3\u0000') {
    throw httpError(400, 'That file is not a valid SQLite database.');
  }
  return target;
}

async function handleLogin(req, res) {
  const address = clientAddress(req);
  if (loginBlocked(address)) {
    return sendJson(res, 429, { error: 'Too many login attempts. Please wait a few minutes.' });
  }

  const body = await readJson(req);
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  let user = null;
  if (safeEqual(username.toLowerCase(), DEMO_USERNAME)) {
    if (await verifyAdmin(password)) user = { role: 'admin', username: DEMO_USERNAME };
  } else {
    const account = await findBarberAccount(username);
    if (account && verifyPassword(password, account.password_hash)) {
      user = { role: 'barber', username: account.username, barberId: Number(account.barber_id), name: account.name };
    }
  }

  if (!user) {
    recordLoginFailure(address);
    return sendJson(res, 401, { error: 'Invalid username or password.' });
  }

  loginAttempts.delete(address);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS, role: user.role, barberId: user.barberId || null });
  sendJson(res, 200, { ok: true, user }, {
    'Set-Cookie': `xbarber_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureRequest(req) ? '; Secure' : ''}`
  });
}

// Online the history password is checked here, so its hash never reaches a barber's phone.
async function handleCheckHistoryPassword(req, res, session) {
  const now = Date.now();
  if (!session.session.checks || session.session.checks.resetAt <= now) session.session.checks = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  session.session.checks.count += 1;
  if (session.session.checks.count > PASSWORD_CHECK_MAX) throw httpError(429, 'Too many tries. Please wait a few minutes.');
  const body = await readJson(req, 4096);
  const row = await serialize(async () => dbGet(await openDatabase(), "SELECT value FROM app_options WHERE key = 'history_password'"));
  const ok = verifyPassword(typeof body.password === 'string' ? body.password : '', row?.value || DEFAULT_HISTORY_PASSWORD_HASH);
  if (ok) session.session.checks = null;
  sendJson(res, 200, { ok });
}

// The owner changes their own sign-in password. Other devices signed in as the owner are signed out.
async function handleAdminPassword(req, res, session) {
  const body = await readJson(req, 4096);
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (next.length < 6 || next.length > 100) throw httpError(400, 'Use at least 6 characters.');
  if (!await verifyAdmin(current)) throw httpError(403, 'The current password is wrong.');
  const hash = hashPassword(next);
  await serialize(async () => {
    const connection = await openDatabase();
    const result = await dbRun(connection, "UPDATE admins SET password_hash = ? WHERE username = 'admin'", [hash]);
    if (!result.changes) await dbRun(connection, "INSERT INTO admins (username, password_hash) VALUES ('admin', ?)", [hash]);
  });
  sessions.forEach((value, token) => {
    if (value.role === 'admin' && token !== session.token) sessions.delete(token);
  });
  sendJson(res, 200, { ok: true });
}

async function handleClearHistory(req, res) {
  const body = await readJson(req);
  const today = body.today;
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw httpError(400, 'A valid current date is required to clear history.');
  }

  await serialize(async () => {
    const connection = await openDatabase();
    await dbRun(connection, 'BEGIN IMMEDIATE');
    try {
      await dbRun(
        connection,
        "DELETE FROM appointments WHERE date < ? OR (date = ? AND status IN ('completed', 'cancelled'))",
        [today, today]
      );
      await dbRun(connection, 'DELETE FROM payments');
      await dbRun(connection, 'DELETE FROM order_items');
      await dbRun(connection, 'DELETE FROM orders');
      await dbRun(connection, 'DELETE FROM product_sale_items');
      await dbRun(connection, 'DELETE FROM product_sales');
      await dbRun(connection, 'DELETE FROM expenses');
      await dbRun(connection, 'COMMIT');
    } catch (error) {
      try {
        await dbRun(connection, 'ROLLBACK');
      } catch (rollbackError) {
        console.error('Could not roll back history deletion:', rollbackError.message);
      }
      throw error;
    }
  });

  sendJson(res, 200, { ok: true });
}

async function handleBackup(req, res) {
  const body = await readJson(req);
  const destination = resolveBackupDestination(body.path);
  if (path.resolve(destination) === path.resolve(DB_PATH)) {
    throw httpError(400, 'Choose a different backup file name.');
  }

  await serialize(async () => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    const connection = await openDatabase();
    await copyDatabase(connection, destination);
  });

  sendJson(res, 200, { filePath: destination });
}

// Online: the owner downloads a backup file, and restores one by uploading it.
async function handleBackupDownload(req, res) {
  const temporary = path.join(DATA_DIR, `download-${crypto.randomBytes(6).toString('hex')}.db`);
  try {
    await serialize(async () => copyDatabase(await openDatabase(), temporary));
    const bytes = fs.readFileSync(temporary);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Length': bytes.length,
      'Content-Disposition': `attachment; filename="xbarber-backup-${timestamp()}.db"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(bytes);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, 'The file is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkDatabaseFile(file) {
  return new Promise((resolve, reject) => {
    const candidate = new sqlite3.Database(file, sqlite3.OPEN_READONLY, openError => {
      if (openError) return reject(httpError(400, 'That file is not a valid SQLite database.'));
      candidate.get('PRAGMA integrity_check', (error, row) => {
        candidate.close(() => {
          if (error || !row || row.integrity_check !== 'ok') reject(httpError(400, 'The backup failed its integrity check.'));
          else resolve();
        });
      });
    });
  });
}

async function handleRestoreUpload(req, res) {
  const bytes = await readBody(req, MAX_UPLOAD_BYTES);
  if (bytes.subarray(0, 16).toString('utf8') !== 'SQLite format 3\u0000') {
    throw httpError(400, 'Choose a valid XBARBER backup (.db) file.');
  }
  const upload = path.join(DATA_DIR, `upload-${crypto.randomBytes(6).toString('hex')}.db`);
  fs.writeFileSync(upload, bytes);
  try {
    await checkDatabaseFile(upload);
    await serialize(async () => {
      const current = await openDatabase();
      // Passwords already changed on this server stay, so a backup from the offline app
      // never brings back an old or default password on the internet.
      const ownerRow = await dbGet(current, "SELECT password_hash FROM admins WHERE username = 'admin'");
      const historyRow = await dbGet(current, "SELECT value FROM app_options WHERE key = 'history_password'");
      const keepOwner = String(ownerRow?.password_hash || '').startsWith('sha256i$') ? ownerRow.password_hash : null;
      const keepHistory = String(historyRow?.value || '').startsWith('sha256i$') ? historyRow.value : null;
      // Keep the current data next to it, just in case.
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      await copyDatabase(current, path.join(BACKUP_DIR, `before-restore-${timestamp()}.db`));
      await closeDatabase();
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = `${DB_PATH}${suffix}`;
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      }
      fs.copyFileSync(upload, DB_PATH);
      const restored = await openDatabase();
      if (keepOwner) {
        await dbRun(restored, "INSERT OR IGNORE INTO admins (username, password_hash) VALUES ('admin', ?)", [keepOwner]);
        await dbRun(restored, "UPDATE admins SET password_hash = ? WHERE username = 'admin'", [keepOwner]);
      }
      if (keepHistory) {
        await dbRun(restored,
          "INSERT OR REPLACE INTO app_options (key, value, updated_at) VALUES ('history_password', ?, CURRENT_TIMESTAMP)",
          [keepHistory]);
      }
    });
  } finally {
    fs.rmSync(upload, { force: true });
  }
  sendJson(res, 200, { ok: true });
}

async function handleRestore(req, res) {
  const body = await readJson(req);
  const source = resolveRestoreSource(body.path);

  await serialize(async () => {
    await closeDatabase();
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${DB_PATH}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    fs.copyFileSync(source, DB_PATH);
    await openDatabase();
  });

  sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, pathname) {
  if (!sameOrigin(req)) throw httpError(403, 'Request blocked.');
  if (pathname === '/api/login') return handleLogin(req, res);

  const session = currentSession(req);
  if (!session) throw httpError(401, 'Please log in again.');

  if (pathname === '/api/session') return sendJson(res, 200, { ok: true });

  if (pathname === '/api/db-query') {
    const body = await readJson(req);
    const query = assertQuery(body.query);
    if (!/^\s*(SELECT|WITH)\b/i.test(query)) {
      throw httpError(403, 'Only read queries are allowed here.');
    }
    assertReadAllowed(session, query);
    const rows = await serialize(async () => {
      const connection = await openDatabase();
      return dbAll(connection, query, normalizeParams(body.params));
    });
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/db-run') {
    const body = await readJson(req);
    const query = assertQuery(body.query);
    if (!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(query)) {
      throw httpError(403, 'Only data-changing queries are allowed here.');
    }
    assertWriteAllowed(session, query, Array.isArray(body.params) ? body.params : []);
    const result = await serialize(async () => {
      const connection = await openDatabase();
      return dbRun(connection, query, normalizeParams(body.params));
    });
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/db-transaction') {
    const body = await readJson(req);
    const statements = body.statements;
    if (!Array.isArray(statements) || !statements.length || statements.length > 100) {
      throw httpError(400, 'A transaction must contain between 1 and 100 statements.');
    }
    statements.forEach(statement => assertWriteAllowed(session, assertQuery(statement && statement.query),
      Array.isArray(statement.params) ? statement.params : []));

    const results = await serialize(async () => {
      const connection = await openDatabase();
      await dbRun(connection, 'BEGIN IMMEDIATE');
      try {
        const transactionResults = [];
        for (const statement of statements) {
          const query = assertQuery(statement && statement.query);
          if (!/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query)) {
            throw httpError(403, 'Transactions only accept data-changing queries.');
          }
          const rawParams = Array.isArray(statement.params) ? statement.params : [];
          const params = normalizeParams(rawParams.map(value => {
            if (!value || typeof value !== 'object' || !Number.isInteger(value.lastIDFrom)) return value;
            const previous = transactionResults[value.lastIDFrom];
            if (!previous || !Number.isInteger(previous.lastID)) {
              throw httpError(400, 'Invalid transaction result reference.');
            }
            return previous.lastID;
          }));
          transactionResults.push(await dbRun(connection, query, params));
        }
        await dbRun(connection, 'COMMIT');
        return transactionResults;
      } catch (error) {
        try {
          await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {
          console.error('Could not roll back database transaction:', rollbackError.message);
        }
        throw error;
      }
    });
    return sendJson(res, 200, results);
  }

  if (pathname === '/api/check-history-password') return handleCheckHistoryPassword(req, res, session);
  if (pathname === '/api/admin-password') {
    requireAdmin(session);
    return handleAdminPassword(req, res, session);
  }
  if (pathname === '/api/backup-download') {
    requireAdmin(session);
    return handleBackupDownload(req, res);
  }
  if (pathname === '/api/restore-upload') {
    requireAdmin(session);
    return handleRestoreUpload(req, res);
  }
  if (pathname === '/api/clear-history') {
    requireAdmin(session);
    return handleClearHistory(req, res);
  }
  if (pathname === '/api/backup-database') {
    requireAdmin(session);
    return handleBackup(req, res);
  }
  if (pathname === '/api/restore-database') {
    requireAdmin(session);
    return handleRestore(req, res);
  }
  if (pathname.startsWith('/api/whatsapp/')) {
    requireAdmin(session);
    return handleWhatsApp(req, res, pathname);
  }

  throw httpError(404, 'API route not found.');
}

/* ------------------------------------------------------------------ */
/* Booking website: public pages and API (no sign-in)                  */
/*                                                                     */
/*   GET  /api/public/info                 shop, hours, barbers        */
/*   GET  /api/public/availability?barber= free and taken times        */
/*   GET  /api/public/photo/<barber id>    barber photo                */
/*   POST /api/public/book                 name, phone, barber, time   */
/*                                                                     */
/* Free times come from src/js/slots.js, the same code the cashier     */
/* uses, so the website always shows the cashier's slots.              */
/* ------------------------------------------------------------------ */

// The shop's date and time, in the shop's time zone (the VPS clock may be UTC).
function shopNow() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
  } catch (error) {
    const now = new Date();
    return { date: `${now.getFullYear()}-${Slots.pad(now.getMonth() + 1)}-${Slots.pad(now.getDate())}`, minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

function daysBetween(from, to) {
  const toUtc = value => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

// Everything the website needs, read in one go.
async function siteSnapshot(connection, now) {
  const optionRows = await dbAll(connection,
    `SELECT key, value FROM app_options
     WHERE key LIKE 'booking.%' OR key LIKE 'slot.barber.%' OR key LIKE 'extra.%' OR key LIKE 'off.%' OR key LIKE 'online.%' OR key LIKE 'skip.%' OR key LIKE 'days.barber.%'
        OR key IN ('site.open', 'shop.instagram', 'shop.whatsapp')`);
  const options = {};
  optionRows.forEach(row => {
    if (String(row.key).startsWith('booking.')) options[String(row.key).slice('booking.'.length)] = row.value;
  });
  const hours = Slots.shopHours(options);
  // Each barber can take bookings for more or fewer days than the shop setting.
  const barberDaysAhead = Slots.parseBarberDays(optionRows);
  const lastDay = Slots.addDays(now.date, Math.max(hours.days, ...barberDaysAhead.values()));
  const barbers = await dbAll(connection, 'SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY id');
  const photos = await dbAll(connection, 'SELECT barber_id, updated_at FROM barber_photos WHERE image_data IS NOT NULL');
  const busyRows = await dbAll(connection,
    `SELECT barber_id, date, time FROM orders
     WHERE barber_id IS NOT NULL AND date BETWEEN ? AND ? AND time IS NOT NULL AND time <> ''
       AND COALESCE(status, 'completed') IN ('waiting', 'in-service', 'completed')`,
    [now.date, lastDay]);
  const shop = await dbGet(connection, 'SELECT shop_name, phone, address FROM settings ORDER BY id DESC LIMIT 1') || {};
  const busy = new Map();
  busyRows.forEach(row => {
    const key = `${row.barber_id}|${row.date}`;
    const list = busy.get(key) || [];
    list.push(Slots.toMinutes(row.time));
    busy.set(key, list);
  });
  const optionValue = key => optionRows.find(row => row.key === key)?.value;
  const siteRow = optionRows.find(row => row.key === 'site.open');
  return {
    now,
    hours,
    open: String(siteRow?.value ?? '1') !== '0',
    // A barber who closed themselves in the cashier takes no website bookings.
    barbers: barbers.map(barber => ({
      id: Number(barber.id),
      name: String(barber.name || ''),
      online: optionValue(`online.${Number(barber.id)}`) !== '0'
    })),
    photos: new Map(photos.map(row => [Number(row.barber_id), String(row.updated_at || '')])),
    barberSlots: Slots.parseBarberSlots(optionRows),
    extras: Slots.parseExtraSlots(optionRows),
    skips: Slots.parseSkippedSlots(optionRows),
    barberDaysAhead,
    offs: Slots.parseOffDays(optionRows),
    busy,
    shop: {
      name: shop.shop_name && !['XBARBER SHOP', 'XOSHAWI BARBER', 'XOSHAWI STUDIO'].includes(String(shop.shop_name).trim().toUpperCase()) ? String(shop.shop_name) : 'XOSHAWIS STUDIO',
      phone: shop.phone ? String(shop.phone) : null,
      address: shop.address ? String(shop.address) : null,
      instagram: instagramUrl(optionValue('shop.instagram')),
      // WhatsApp: its own number, or the shop phone when none was typed.
      whatsapp: whatsappUrl(optionValue('shop.whatsapp') || shop.phone)
    }
  };
}

// Instagram from the cashier: "@name", "name" or a link to the profile.
function instagramUrl(value) {
  const text = String(value || '').trim();
  const match = /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(text)
    || /^@?([A-Za-z0-9._]{1,30})$/.exec(text);
  return match ? `https://www.instagram.com/${match[1]}/` : null;
}

// A phone number as WhatsApp wants it: digits with the country code. "+964..." or "00964..."
// is used as it is; a number that starts with a single 0 (0750 123 4567), or a 10-digit
// number that starts with 7 (750 123 4567), is an Iraqi number.
function whatsappDigits(value) {
  const text = String(value || '').trim();
  let digits = text.replace(/\D+/g, '');
  if (!text.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
    else if (digits.length === 10 && digits.startsWith('7')) digits = `964${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// WhatsApp from the cashier (shown on the website): its own number, or the shop phone.
function whatsappUrl(value) {
  const digits = whatsappDigits(value);
  return digits ? `https://wa.me/${digits}` : null;
}

// One barber's days, from today up to the last day customers may book.
function barberDays(snapshot, barberId) {
  const { now, hours } = snapshot;
  const online = snapshot.barbers.find(barber => barber.id === barberId)?.online !== false;
  const step = Slots.barberStep(hours, snapshot.barberSlots, barberId);
  const ahead = Slots.barberDaysAhead(hours, snapshot.barberDaysAhead, barberId);
  const days = [];
  for (let index = 0; index <= ahead; index += 1) {
    const date = Slots.addDays(now.date, index);
    const day = Slots.barberDay({
      hours,
      step,
      extra: snapshot.extras.get(`${barberId}|${date}`) || [],
      skip: snapshot.skips.get(`${barberId}|${date}`) || [],
      off: !online || snapshot.offs.has(`${barberId}|${date}`),
      clientMinutes: snapshot.busy.get(`${barberId}|${date}`) || [],
      isToday: index === 0,
      nowMinutes: now.minutes,
      closedDay: hours.closed.includes(Slots.weekday(date))
    });
    days.push({ date, status: day.status, free: day.free.map(Slots.fromMinutes), taken: day.taken.map(Slots.fromMinutes) });
  }
  return days;
}

function photoUrl(snapshot, barberId) {
  const stamp = snapshot.photos.get(barberId);
  return stamp == null ? null : `/api/public/photo/${barberId}?v=${encodeURIComponent(stamp)}`;
}

async function handlePublicInfo(req, res) {
  const snapshot = await serialize(async () => siteSnapshot(await openDatabase(), shopNow()));
  const barbers = snapshot.barbers.map(barber => {
    const days = barberDays(snapshot, barber.id);
    const next = days.find(day => day.free.length);
    return {
      id: barber.id,
      name: barber.name,
      photo: photoUrl(snapshot, barber.id),
      online: barber.online,
      slot_minutes: Slots.barberStep(snapshot.hours, snapshot.barberSlots, barber.id),
      next: next ? { date: next.date, time: next.free[0] } : null,
      today: days[0].status
    };
  });
  sendJson(res, 200, {
    shop: snapshot.shop,
    open: snapshot.open,
    today: snapshot.now.date,
    hours: {
      open: snapshot.hours.open,
      close: snapshot.hours.close,
      closed_weekdays: snapshot.hours.closed,
      days_ahead: snapshot.hours.days
    },
    barbers
  });
}

async function handlePublicAvailability(req, res, url) {
  const barberId = Number(url.searchParams.get('barber'));
  if (!Number.isInteger(barberId) || barberId < 1) throw httpError(400, 'barber');
  const snapshot = await serialize(async () => siteSnapshot(await openDatabase(), shopNow()));
  const barber = snapshot.barbers.find(item => item.id === barberId);
  if (!barber) throw httpError(404, 'barber');
  sendJson(res, 200, {
    open: snapshot.open,
    today: snapshot.now.date,
    barber: { id: barber.id, name: barber.name, photo: photoUrl(snapshot, barber.id) },
    days: barberDays(snapshot, barber.id)
  });
}

async function handlePublicPhoto(req, res, pathname) {
  const barberId = Number(pathname.slice('/api/public/photo/'.length));
  if (!Number.isInteger(barberId) || barberId < 1) throw httpError(404, 'Not found');
  const row = await serialize(async () => dbGet(await openDatabase(),
    `SELECT p.image_data FROM barber_photos p JOIN barbers b ON b.id = p.barber_id
     WHERE p.barber_id = ? AND b.is_active = 1`, [barberId]));
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(String(row?.image_data || ''));
  if (!match) throw httpError(404, 'Not found');
  const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  res.writeHead(200, {
    'Content-Type': match[1].toLowerCase(),
    'Content-Length': bytes.length,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(req.method === 'HEAD' ? undefined : bytes);
}

const bookingAttempts = new Map();

function bookingBlocked(address) {
  const now = Date.now();
  const entry = bookingAttempts.get(address);
  if (!entry || entry.resetAt <= now) {
    bookingAttempts.set(address, { count: 1, resetAt: now + BOOKING_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > BOOKING_MAX_PER_WINDOW;
}

function cleanName(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
}

function phoneDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

// A booking from the website becomes a waiting client in the chosen barber's slot.
async function handlePublicBook(req, res) {
  if (!sameOrigin(req)) throw httpError(403, 'Request blocked.');
  if (bookingBlocked(clientAddress(req))) throw httpError(429, 'busy');
  const body = await readJson(req, 4096);
  const barberId = Number(body.barber_id);
  const date = String(body.date || '');
  const time = String(body.time || '').slice(0, 5);
  const name = cleanName(body.name).slice(0, 60);
  const phone = String(body.phone || '').replace(/[^\d+\s-]/g, '').trim().slice(0, 30);
  if (!Number.isInteger(barberId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw httpError(400, 'slot');
  if (name.length < 2) throw httpError(400, 'name');
  const digits = phoneDigits(phone);
  if (digits.length < 7 || digits.length > 15) throw httpError(400, 'phone');

  const booking = await serialize(async () => {
    const connection = await openDatabase();
    await dbRun(connection, 'BEGIN IMMEDIATE');
    try {
      const snapshot = await siteSnapshot(connection, shopNow());
      if (!snapshot.open) throw httpError(403, 'closed');
      const barber = snapshot.barbers.find(item => item.id === barberId);
      if (!barber) throw httpError(409, 'taken');
      const index = daysBetween(snapshot.now.date, date);
      if (index < 0) throw httpError(409, 'taken');
      const day = barberDays(snapshot, barberId)[index];
      if (!day || !day.free.includes(time)) throw httpError(409, 'taken');

      // At most two upcoming online bookings for one phone number.
      const upcoming = await dbAll(connection,
        `SELECT ob.phone FROM online_bookings ob JOIN orders o ON o.id = ob.order_id
         WHERE o.status = 'waiting' AND o.date >= ?`, [snapshot.now.date]);
      if (upcoming.filter(row => phoneDigits(row.phone) === digits).length >= BOOKINGS_PER_PHONE) throw httpError(429, 'limit');

      const customers = await dbAll(connection, 'SELECT id, name, phone FROM customers WHERE is_active = 1 AND phone IS NOT NULL');
      const known = customers.find(customer => phoneDigits(customer.phone) === digits);
      let customerId;
      if (known) {
        customerId = Number(known.id);
        if (!String(known.name || '').trim()) {
          await dbRun(connection, 'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, customerId]);
        }
      } else {
        customerId = (await dbRun(connection,
          'INSERT INTO customers (name, phone, total_visits, total_spent) VALUES (?, ?, 0, 0)', [name, phone])).lastID;
      }
      const order = await dbRun(connection,
        "INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, 0, 0, 'waiting', NULL, ?)",
        [customerId, date, time, barberId]);
      const bookingId = `web-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      await dbRun(connection,
        `INSERT INTO online_bookings (booking_id, order_id, barber_id, customer_name, phone, date, time, status, reported_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'received', 'received')`,
        [bookingId, order.lastID, barberId, name, phone, date, time]);
      await dbRun(connection, 'COMMIT');
      return { id: bookingId, barber: barber.name, date, time };
    } catch (error) {
      try {
        await dbRun(connection, 'ROLLBACK');
      } catch (rollbackError) {
        console.error('Could not roll back the booking:', rollbackError.message);
      }
      throw error;
    }
  });
  sendJson(res, 200, { ok: true, booking });
}

async function handlePublicApi(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/public/book') {
    if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
    return handlePublicBook(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Method not allowed.');
  if (pathname === '/api/public/info') return handlePublicInfo(req, res);
  if (pathname === '/api/public/availability') return handlePublicAvailability(req, res, url);
  if (pathname.startsWith('/api/public/photo/')) return handlePublicPhoto(req, res, pathname);
  throw httpError(404, 'API route not found.');
}

/* ------------------------------------------------------------------ */
/* WhatsApp reminders                                                  */
/*                                                                     */
/* Once the owner links the shop's WhatsApp (Settings), every client   */
/* still waiting, with a phone number, gets one message 20 minutes     */
/* before their time: website bookings and clients added in the        */
/* cashier alike. whatsapp_reminders keeps who was sent what, so       */
/* nobody gets it twice, even after a restart. A client moved to       */
/* another time gets a new reminder for the new time.                  */
/* ------------------------------------------------------------------ */

const REMINDER_TEXT = 'بەڕێز ٢٠ دەقە ماوە بۆ کاتی سەرتاشیت دڵنیابە لەوەی لە کاتی خۆی لەوێ دەبیت';
const REMINDER_BEFORE_MINUTES = 20;
// Sent while 15 to 20 minutes are left. A booking made later than that gets no reminder.
const REMINDER_LATEST_MINUTES = 15;
const REMINDER_CHECK_MS = 30 * 1000;
let reminderRunning = false;
let reminderCleanedAt = 0;

async function sendReminders() {
  if (reminderRunning || !WhatsApp.isReady()) return;
  reminderRunning = true;
  try {
    const now = shopNow();
    const tomorrow = Slots.addDays(now.date, 1);
    // Claim the clients first, then send without holding the database.
    const due = await serialize(async () => {
      const connection = await openDatabase();
      if (Date.now() - reminderCleanedAt > 60 * 60 * 1000) {
        reminderCleanedAt = Date.now();
        await dbRun(connection, "DELETE FROM whatsapp_reminders WHERE created_at < datetime('now', '-14 days')");
      }
      const rows = await dbAll(connection,
        `SELECT o.id, o.date, o.time, c.name,
                COALESCE(NULLIF(TRIM(ob.phone), ''), c.phone) AS phone
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN online_bookings ob ON ob.order_id = o.id
         WHERE o.status = 'waiting' AND o.date IN (?, ?) AND o.time IS NOT NULL AND o.time <> ''
           AND NOT EXISTS (SELECT 1 FROM whatsapp_reminders r
                           WHERE r.order_id = o.id AND r.date = o.date AND r.time = substr(o.time, 1, 5))`,
        [now.date, tomorrow]);
      const claimed = [];
      for (const row of rows) {
        const time = String(row.time).slice(0, 5);
        if (!/^\d{2}:\d{2}$/.test(time) || !String(row.phone || '').trim()) continue;
        const left = daysBetween(now.date, row.date) * 1440 + Slots.toMinutes(time) - now.minutes;
        if (left > REMINDER_BEFORE_MINUTES || left <= REMINDER_LATEST_MINUTES) continue;
        const digits = whatsappDigits(row.phone);
        await dbRun(connection,
          `INSERT OR IGNORE INTO whatsapp_reminders (order_id, date, time, name, phone, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.id, row.date, time, row.name || null, String(row.phone), digits ? 'sending' : 'bad-number']);
        if (digits) claimed.push({ id: Number(row.id), date: row.date, time, digits });
      }
      return claimed;
    });

    for (const item of due) {
      let result = null;
      try {
        result = await WhatsApp.sendText(item.digits, REMINDER_TEXT);
      } catch (error) {
        console.error(`WhatsApp reminder to +${item.digits} failed:`, error.message);
      }
      await serialize(async () => {
        const connection = await openDatabase();
        if (result) {
          await dbRun(connection,
            'UPDATE whatsapp_reminders SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE order_id = ? AND date = ? AND time = ?',
            [result, item.id, item.date, item.time]);
        } else {
          // Not sent: try again on the next check, while it is still 15-20 minutes before.
          await dbRun(connection,
            "DELETE FROM whatsapp_reminders WHERE order_id = ? AND date = ? AND time = ? AND status = 'sending'",
            [item.id, item.date, item.time]);
        }
      });
    }
  } catch (error) {
    console.error('WhatsApp reminders:', error.message);
  } finally {
    reminderRunning = false;
  }
}

// Owner only: link state, the QR code to scan, and the latest reminders.
async function handleWhatsApp(req, res, pathname) {
  await readJson(req, 4096);
  if (pathname === '/api/whatsapp/link') await WhatsApp.link();
  else if (pathname === '/api/whatsapp/unlink') await WhatsApp.unlink();
  else if (pathname !== '/api/whatsapp/status') throw httpError(404, 'API route not found.');
  const recent = await serialize(async () => dbAll(await openDatabase(),
    `SELECT name, phone, date, time, status, COALESCE(sent_at, created_at) AS at
     FROM whatsapp_reminders ORDER BY created_at DESC, rowid DESC LIMIT 15`));
  sendJson(res, 200, { ...WhatsApp.status(), message: REMINDER_TEXT, before: REMINDER_BEFORE_MINUTES, recent });
}

function serveAppMode(req, res) {
  if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
  sendJson(res, 200, { mode: 'server' });
}

// The website's pages may only load files from this server.
const SITE_POLICY = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; "
  + "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function serveStatic(req, res, pathname) {
  if (pathname === '/cashier' || pathname === '/cashier/') {
    res.writeHead(302, { Location: '/src/index.html', 'Cache-Control': 'no-store' });
    return res.end();
  }
  // The booking website is the home page.
  if (pathname === '/' || pathname === '/index.html') pathname = '/site/index.html';

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  const absolute = path.resolve(ROOT, decoded.replace(/^\/+/, ''));
  const allowedRoots = ['site', 'src', 'assets', 'database', 'vendor'].map(name => path.join(ROOT, name));
  const allowedRootFiles = ['manifest.json', 'sw.js', 'precache-manifest.json', 'app-mode.json'].map(name => path.join(ROOT, name));
  const allowed = allowedRoots.some(root => absolute === root || absolute.startsWith(`${root}${path.sep}`))
    || allowedRootFiles.includes(absolute);
  if (!allowed) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.stat(absolute, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const headers = {
      'Content-Type': MIME_TYPES[path.extname(absolute).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'SAMEORIGIN'
    };
    if (absolute.startsWith(path.join(ROOT, 'site') + path.sep)) headers['Content-Security-Policy'] = SITE_POLICY;

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(absolute);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  let pathname = '/';

  try {
    // Without XBARBER_PUBLIC=1 only the local network may connect. Behind nginx every request
    // comes from 127.0.0.1, so the website still reaches visitors through nginx.
    if (!PUBLIC_MODE && !isPrivateAddress(req.socket.remoteAddress)) {
      throw httpError(403, 'This server only accepts connections from the local network.');
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;

    if (pathname === '/app-mode.json') {
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
      serveAppMode(req, res);
    } else if (pathname.startsWith('/api/public/')) {
      await handlePublicApi(req, res, url);
    } else if (pathname.startsWith('/api/')) {
      if (req.method !== 'POST') throw httpError(405, 'Method not allowed.');
      await handleApi(req, res, pathname);
    } else {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, 'Method not allowed.');
      serveStatic(req, res, pathname);
    }
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error(`[${new Date().toISOString()}] ${req.method} ${pathname}:`, error);
    if (!res.headersSent) {
      if (pathname.startsWith('/api/')) {
        sendJson(res, statusCode, { error: statusCode >= 500 ? 'The server could not complete that request.' : error.message });
      } else {
        res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(statusCode >= 500 ? 'Server error' : error.message);
      }
    }
  } finally {
    if (pathname.startsWith('/api/')) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > 1500) console.warn(`Slow request ${req.method} ${pathname} (${elapsed} ms)`);
    }
  }
});

function lanAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  Object.values(interfaces).forEach(entries => {
    (entries || []).forEach(entry => {
      if (entry.family !== 'IPv4' || entry.internal) return;
      if (isPrivateAddress(entry.address) && !addresses.includes(entry.address)) {
        addresses.push(entry.address);
      }
    });
  });
  return addresses;
}

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other XBARBER server or run with XBARBER_PORT=3001.`);
  } else {
    console.error('Could not start the XBARBER web server:', error.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const addresses = lanAddresses();
  WhatsApp.init(DATA_DIR);
  setInterval(() => sendReminders(), REMINDER_CHECK_MS).unref();
  console.log('');
  console.log('XBARBER SHOP server');
  console.log(`Database:  ${DB_PATH}`);
  console.log(`Website:   http://localhost:${PORT}/`);
  console.log(`Cashier:   http://localhost:${PORT}/cashier`);
  console.log(`Time zone: ${SHOP_TZ}${PUBLIC_MODE ? ' · open to the internet' : ' · local network only'}`);
  console.log('Owner sign-in: admin (password admin123 until it is changed in Settings)');
  // Hints for running on the shop PC; on the VPS nginx sits in front (docs/VPS-SETUP.md).
  if (process.platform === 'win32') {
    if (addresses.length) {
      console.log('On iPad (same Wi-Fi):');
      addresses.forEach(address => console.log(`  http://${address}:${PORT}/cashier`));
    } else {
      console.log('No LAN address was found. Connect this PC to Wi-Fi and restart the server.');
    }
    console.log('iPad cannot connect? Allow Node.js on Private networks in Windows Firewall.');
    console.log('Keep this window open. Press Ctrl+C to stop.');
  }
  console.log('');
});

function shutdown() {
  WhatsApp.close();
  server.close(() => {
    closeDatabase().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
