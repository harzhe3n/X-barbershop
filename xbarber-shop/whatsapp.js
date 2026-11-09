'use strict';

/*
 * The shop's WhatsApp, linked like WhatsApp Web: the owner scans a QR code once
 * (Cashier → Settings → WhatsApp reminders) with the shop's phone. After that the
 * server can send messages from that number (see the reminders in server.js).
 *
 * The link is saved in <data folder>/whatsapp-auth, so it survives restarts.
 * Uses @whiskeysockets/baileys (no browser needed). Set XBARBER_WHATSAPP_DEBUG=1
 * to see its messages in the server log.
 */

const fs = require('fs');
const path = require('path');

const DEBUG = process.env.XBARBER_WHATSAPP_DEBUG === '1';
const MAX_RETRY_MS = 60 * 1000;

let authDir = null;
let baileys = null;
let QRCode = null;
let socket = null;
let starting = false;
let retryTimer = null;
let retryDelay = 3000;

const status = {
  // unavailable | off | connecting | qr | ready
  state: 'off',
  qr: null,
  phone: null,
  error: null
};

// Baileys wants a pino-style logger; this one is quiet unless XBARBER_WHATSAPP_DEBUG=1.
function makeLogger() {
  const write = level => (...args) => {
    if (DEBUG) console.log(`[whatsapp ${level}]`, ...args);
  };
  const logger = {
    level: DEBUG ? 'debug' : 'silent',
    trace: write('trace'),
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    fatal: write('fatal'),
    child: () => logger
  };
  return logger;
}

async function loadLibraries() {
  if (baileys) return true;
  try {
    baileys = await import('@whiskeysockets/baileys');
    QRCode = require('qrcode');
    return true;
  } catch (error) {
    console.error('WhatsApp is not available (run npm install):', error.message);
    status.state = 'unavailable';
    status.error = error.message;
    return false;
  }
}

// Linked once a QR code was scanned: the saved sign-in then names the shop's number.
function isLinked() {
  if (!authDir) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(authDir, 'creds.json'), 'utf8'));
    return Boolean(creds?.me?.id);
  } catch (error) {
    return false;
  }
}

function clearAuth() {
  if (authDir) fs.rmSync(authDir, { recursive: true, force: true });
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => connect().catch(error => console.error('WhatsApp:', error.message)), retryDelay);
  retryTimer.unref?.();
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
}

async function connect() {
  if (starting || socket) return;
  if (!await loadLibraries()) return;
  starting = true;
  clearTimeout(retryTimer);
  status.state = 'connecting';
  status.qr = null;
  status.error = null;

  try {
    fs.mkdirSync(authDir, { recursive: true });
    const { state: auth, saveCreds } = await baileys.useMultiFileAuthState(authDir);
    const options = {
      auth,
      logger: makeLogger(),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: baileys.Browsers.appropriate('Chrome')
    };
    try {
      // The newest WhatsApp Web version; without it Baileys uses the one it was built with.
      const latest = await baileys.fetchLatestBaileysVersion();
      if (latest?.version) options.version = latest.version;
    } catch (error) {
      if (DEBUG) console.log('[whatsapp] could not fetch the latest version:', error.message);
    }

    const makeSocket = baileys.makeWASocket || baileys.default;
    const current = makeSocket(options);
    socket = current;
    current.ev.on('creds.update', saveCreds);
    current.ev.on('connection.update', update => {
      if (socket !== current) return;
      if (update.qr) {
        status.state = 'qr';
        QRCode.toDataURL(update.qr, { margin: 1, width: 280 })
          .then(image => {
            if (socket === current && status.state === 'qr') status.qr = image;
          })
          .catch(error => console.error('WhatsApp QR:', error.message));
      }
      if (update.connection === 'open') {
        status.state = 'ready';
        status.qr = null;
        status.error = null;
        status.phone = String(current.user?.id || '').split(/[:@]/)[0] || null;
        retryDelay = 3000;
        console.log(`WhatsApp linked${status.phone ? ` (+${status.phone})` : ''}.`);
      }
      if (update.connection === 'close') {
        socket = null;
        const code = update.lastDisconnect?.error?.output?.statusCode;
        const reasons = baileys.DisconnectReason;
        if (code === reasons.loggedOut) {
          // Unlinked from the phone (Linked devices → Log out).
          clearAuth();
          Object.assign(status, { state: 'off', qr: null, phone: null, error: null });
          console.log('WhatsApp was unlinked.');
        } else if (code === reasons.restartRequired) {
          // Normal right after the QR code is scanned.
          retryDelay = 1000;
          scheduleRetry();
        } else if (!auth.creds?.me?.id) {
          // The QR code was not scanned in time. The owner can press Link again.
          clearAuth();
          Object.assign(status, { state: 'off', qr: null });
        } else {
          status.state = 'connecting';
          status.error = update.lastDisconnect?.error?.message || null;
          scheduleRetry();
        }
      }
    });
  } catch (error) {
    socket = null;
    status.state = isLinked() ? 'connecting' : 'off';
    status.error = error.message;
    console.error('WhatsApp could not connect:', error.message);
    if (isLinked()) scheduleRetry();
  } finally {
    starting = false;
  }
}

module.exports = {
  // Called once when the server starts. Reconnects if the shop's WhatsApp was linked before.
  init(dataDir) {
    authDir = path.join(dataDir, 'whatsapp-auth');
    if (isLinked()) connect().catch(error => console.error('WhatsApp:', error.message));
  },

  status() {
    return { ...status };
  },

  isReady() {
    return status.state === 'ready' && Boolean(socket);
  },

  // The owner pressed "Link WhatsApp": show a new QR code.
  async link() {
    if (socket || starting) return;
    retryDelay = 3000;
    await connect();
  },

  // The owner pressed "Unlink": log out on WhatsApp too, then forget the link.
  async unlink() {
    clearTimeout(retryTimer);
    const current = socket;
    socket = null;
    if (current) {
      try {
        await current.logout();
      } catch (error) {
        try { current.end(undefined); } catch (endError) { /* already closed */ }
      }
    }
    clearAuth();
    Object.assign(status, { state: baileys ? 'off' : status.state, qr: null, phone: null, error: null });
  },

  /*
   * Sends a text to a phone number written as digits with the country code (9647501234567).
   * Returns 'sent', or 'no-whatsapp' when that number has no WhatsApp. Throws when it could not send.
   */
  async sendText(digits, text) {
    if (!module.exports.isReady()) throw new Error('WhatsApp is not linked.');
    const [result] = await socket.onWhatsApp(digits);
    if (!result?.exists) return 'no-whatsapp';
    await socket.sendMessage(result.jid, { text });
    return 'sent';
  },

  close() {
    clearTimeout(retryTimer);
    if (socket) {
      try { socket.end(undefined); } catch (error) { /* already closed */ }
      socket = null;
    }
  }
};
