'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const ROOT = __dirname;
const PORT = Number(process.env.XBARBER_PORT || process.env.PORT || 3000);
const HOST = process.env.XBARBER_HOST || '0.0.0.0';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'admin123';

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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

// Barbers sign in on shared devices; they must not create or change sign-in accounts.
function assertWriteAllowed(session, query) {
  if (session.session.role !== 'admin' && /\bbarber_accounts\b/i.test(query)) {
    throw httpError(403, 'Only the admin can change sign-in accounts.');
  }
}

function clientAddress(req) {
  return req.socket.remoteAddress || 'unknown';
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
    if (safeEqual(password, DEMO_PASSWORD)) user = { role: 'admin', username: DEMO_USERNAME };
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
    'Set-Cookie': `xbarber_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  });
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
    assertWriteAllowed(session, query);
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
    statements.forEach(statement => assertWriteAllowed(session, assertQuery(statement && statement.query)));

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

  throw httpError(404, 'API route not found.');
}

function serveAppMode(req, res) {
  if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
  sendJson(res, 200, { mode: 'server' });
}

function serveStatic(req, res, pathname) {
  if (pathname === '/') {
    res.writeHead(302, { Location: '/src/index.html', 'Cache-Control': 'no-store' });
    return res.end();
  }

  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  const absolute = path.resolve(ROOT, decoded.replace(/^\/+/, ''));
  const allowedRoots = ['src', 'assets', 'database', 'vendor'].map(name => path.join(ROOT, name));
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
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'SAMEORIGIN'
    };

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
    if (!isPrivateAddress(req.socket.remoteAddress)) {
      throw httpError(403, 'This server only accepts connections from the local network.');
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = url.pathname;

    if (pathname === '/app-mode.json') {
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed.');
      serveAppMode(req, res);
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
        sendJson(res, statusCode, { error: statusCode >= 500 ? 'The local server could not complete that request.' : error.message });
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
  console.log('');
  console.log('XBARBER SHOP - local web server');
  console.log(`Database:  ${DB_PATH}`);
  console.log(`On this PC: http://localhost:${PORT}`);
  if (addresses.length) {
    console.log('On iPad (same Wi-Fi):');
    addresses.forEach(address => console.log(`  http://${address}:${PORT}`));
  } else {
    console.log('No LAN address was found. Connect this PC to Wi-Fi and restart the server.');
  }
  console.log('Login: admin / admin123 (barber sign-ins are created on the Barbers page)');
  console.log('iPad cannot connect? Allow Node.js on Private networks in Windows Firewall.');
  console.log('Keep this window open. Press Ctrl+C to stop.');
  console.log('');
});

function shutdown() {
  server.close(() => {
    closeDatabase().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
