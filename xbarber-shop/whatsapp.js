'use strict';

/*
 * The shop's WhatsApp, linked like WhatsApp Web (Cashier → Settings → WhatsApp reminders).
 * The owner links it once, either by scanning a QR code inside WhatsApp, or by typing
 * the shop's number and entering the 8-letter code WhatsApp asks for (for when the
 * cashier is open on the shop's phone itself). After that the server can send
 * messages from that number (see the reminders in server.js).
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
// Linking by code: the shop's number, and whether the code was asked for yet.
let pairPhone = null;
let pairRequested = false;

const status = {
  // unavailable | off | connecting | qr | code | ready
  state: 'off',
  qr: null,
  code: null,
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

// Linked once WhatsApp accepted this device (QR code or code): the saved sign-in then has
// the account WhatsApp signed. (With a code, the number is saved before it is entered.)
function isLinked() {
  if (!authDir) return false;
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(authDir, 'creds.json'), 'utf8'));
    return Boolean(creds?.account);
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
  status.code = null;
  status.error = null;
  pairRequested = false;

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
      if (update.qr && pairPhone && !auth.creds?.account) {
        // Linking by code: ask WhatsApp for it once the connection is ready.
        if (!pairRequested) {
          pairRequested = true;
          current.requestPairingCode(pairPhone)
            .then(code => {
              if (socket !== current) return;
              const text = String(code || '').toUpperCase();
              status.code = text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4)}` : text;
              status.state = 'code';
            })
            .catch(error => {
              console.error('WhatsApp code:', error.message);
              status.error = error.message;
            });
        }
      } else if (update.qr) {
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
        status.code = null;
        status.error = null;
        pairPhone = null;
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
          pairPhone = null;
          Object.assign(status, { state: 'off', qr: null, code: null, phone: null, error: null });
          console.log('WhatsApp was unlinked.');
        } else if (code === reasons.restartRequired) {
          // Normal right after the QR code is scanned.
          retryDelay = 1000;
          scheduleRetry();
        } else if (!auth.creds?.account) {
          // The QR code or the code was not used in time. The owner can try again.
          clearAuth();
          pairPhone = null;
          Object.assign(status, { state: 'off', qr: null, code: null });
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

  // The owner pressed "Show QR code" (no number) or "Get code" (the shop's number, digits
  // with the country code).
  async link(phoneDigits = null) {
    if (socket || starting || isLinked()) return;
    clearAuth();
    pairPhone = phoneDigits || null;
    retryDelay = 3000;
    await connect();
  },

  // The owner pressed "Unlink": log out on WhatsApp too, then forget the link.
  async unlink() {
    clearTimeout(retryTimer);
    pairPhone = null;
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
    Object.assign(status, { state: baileys ? 'off' : status.state, qr: null, code: null, phone: null, error: null });
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
