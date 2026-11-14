'use strict';

/*
 * The shop's WhatsApp, linked like WhatsApp Web (Cashier → Settings → WhatsApp reminders).
 * The owner links it once, either by scanning a QR code inside WhatsApp, or by typing
 * the shop's number and entering the 8-letter code WhatsApp asks for (for when the
 * cashier is open on the shop's phone itself). After that the server sends messages
 * from that number (see the reminders in server.js).
 *
 * Linked once, it stays linked. The sign-in is saved in <data folder>/whatsapp-auth, and
 * the server connects again by itself after restarts, updates and internet problems, for
 * as long as it takes. Only the owner's "Unlink", or WhatsApp logging the number out
 * (Linked devices → Log out on the phone, or WhatsApp's own checks), ends the link.
 * <data folder>/whatsapp-link.json remembers that reminders are wanted, so when WhatsApp
 * ends the link the cashier tells the owner straight away to link it again.
 *
 * Every disconnect is written to the server log with its reason
 * (journalctl -u xbarber | grep -i whatsapp). Set XBARBER_WHATSAPP_DEBUG=1 to see everything.
 * Uses @whiskeysockets/baileys (no browser needed).
 */

const fs = require('fs');
const path = require('path');

const DEBUG = process.env.XBARBER_WHATSAPP_DEBUG === '1';
// Only for tests: a module to use instead of @whiskeysockets/baileys.
const LIBRARY = process.env.XBARBER_WHATSAPP_LIBRARY || '@whiskeysockets/baileys';
const FIRST_RETRY_MS = 3000;
const MAX_RETRY_MS = 60 * 1000;
// A connection that has not opened after this long is started again.
const STUCK_MS = 3 * 60 * 1000;
// Down for longer than this while reminders are wanted: the cashier warns the owner.
const ALERT_AFTER_MS = 3 * 60 * 1000;
// Asking for the newest WhatsApp version may not take longer than this.
const VERSION_TIMEOUT_MS = 10 * 1000;
// One message may not take longer than this (the library gives up on a request after 60 seconds).
const SEND_TIMEOUT_MS = 90 * 1000;
// WhatsApp sometimes says "logged out" by mistake right after a reconnect; it is believed
// when it says so a second time.
const LOGOUT_CHECKS = 2;
const LOGOUT_CHECK_MS = 10 * 1000;
// Messages kept so WhatsApp can ask for one again when a client's phone could not open it
// (otherwise the client sees "Waiting for this message").
const SENT_KEEP = 300;
// WhatsApp refuses the connection when the WhatsApp version is too old.
const OUTDATED_CODE = 405;

let dataDir = null;
let authDir = null;
let baileys = null;
let QRCode = null;
let socket = null;
let starting = false;
let retryTimer = null;
let retryDelay = FIRST_RETRY_MS;
let connectingSince = 0;
let logoutCount = 0;
let useWebVersion = false;
// Linking by code: the shop's number, and whether the code was asked for yet.
let pairPhone = null;
let pairRequested = false;
// Saving the sign-in: writes still running (waited for before the server stops), and a number
// that changes when the sign-in is thrown away, so a late write of an old one is dropped.
const pendingWrites = new Set();
let authGeneration = 0;
let tempCounter = 0;
// Sent messages by id, for WhatsApp's "send it again" requests.
const sentMessages = new Map();
let sentLoaded = false;
let sentSaveTimer = null;

const status = {
  // unavailable | off | connecting | qr | code | ready
  state: 'off',
  qr: null,
  code: null,
  phone: null,
  error: null,
  // When the connection went down while linked, and when a message last went out (ISO times).
  downSince: null,
  lastSentAt: null
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
    baileys = await import(LIBRARY);
    QRCode = require('qrcode');
    return true;
  } catch (error) {
    console.error('WhatsApp is not available (run npm install):', error.message);
    status.state = 'unavailable';
    status.error = error.message;
    return false;
  }
}

function withTimeout(promise, ms, what) {
  let timer = null;
  const limit = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took too long`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/* ---------------- Saving files safely ---------------- */

// Written to a temporary file first and then put in place, so a restart in the middle of a
// write never leaves half a file behind.
async function writeFileAtomic(file, text) {
  tempCounter += 1;
  const temp = `${file}.${process.pid}.${tempCounter}.tmp`;
  await fs.promises.writeFile(temp, text);
  try {
    await fs.promises.rename(temp, file);
  } catch (error) {
    // Windows can refuse to replace a file that another program has open.
    await fs.promises.writeFile(file, text);
    await fs.promises.rm(temp, { force: true });
  }
}

function writeFileAtomicSync(file, text) {
  tempCounter += 1;
  const temp = `${file}.${process.pid}.${tempCounter}.tmp`;
  fs.writeFileSync(temp, text);
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    fs.writeFileSync(file, text);
    fs.rmSync(temp, { force: true });
  }
}

function track(promise) {
  pendingWrites.add(promise);
  promise.finally(() => pendingWrites.delete(promise));
  return promise;
}

async function flushWrites(ms = 5000) {
  if (!pendingWrites.size) return;
  await withTimeout(Promise.allSettled([...pendingWrites]), ms, 'Saving WhatsApp files').catch(error => {
    console.error('WhatsApp:', error.message);
  });
}

// Temporary files left by a server that stopped in the middle of a write.
function removeTempFiles() {
  for (const folder of [authDir, dataDir]) {
    try {
      fs.readdirSync(folder)
        .filter(name => name.endsWith('.tmp') && (folder === authDir || name.startsWith('whatsapp-')))
        .forEach(name => fs.rmSync(path.join(folder, name), { force: true }));
    } catch (error) {
      // No folder yet.
    }
  }
}

/*
 * The sign-in, kept in files like the library's own useMultiFileAuthState (the same file
 * names, so a link made before keeps working), but every file is written safely, and the
 * sign-in itself (creds.json) also has a copy, creds.backup.json, used if creds.json
 * cannot be read.
 */
async function useSafeAuthState(folder) {
  const { BufferJSON, initAuthCreds, proto } = baileys;
  await fs.promises.mkdir(folder, { recursive: true });
  const generation = authGeneration;
  const queues = new Map();
  const fileFor = name => path.join(folder, String(name).replace(/\//g, '__').replace(/:/g, '-'));

  // Writes to the same file wait for each other.
  function queue(name, task) {
    if (generation !== authGeneration) return Promise.resolve();
    const file = fileFor(name);
    const run = (queues.get(file) || Promise.resolve()).then(() => {
      if (generation !== authGeneration) return undefined;
      return task(file);
    });
    const settled = track(run.catch(error => console.error(`WhatsApp: could not save ${name}:`, error.message)));
    queues.set(file, settled);
    settled.finally(() => {
      if (queues.get(file) === settled) queues.delete(file);
    });
    return settled;
  }

  const write = (name, value) => queue(name, file => writeFileAtomic(file, JSON.stringify(value, BufferJSON.replacer)));
  const remove = name => queue(name, file => fs.promises.rm(file, { force: true }));

  async function read(name) {
    const file = fileFor(name);
    await queues.get(file);
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'), BufferJSON.reviver);
    } catch (error) {
      return null;
    }
  }

  let creds = await read('creds.json');
  if (!creds) {
    creds = await read('creds.backup.json');
    if (creds) console.log('WhatsApp: the saved sign-in could not be read; its backup copy is used.');
  }
  creds = creds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(ids.map(async id => {
            let value = await read(`${type}-${id}.json`);
            if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
            data[id] = value;
          }));
          return data;
        },
        set: async data => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const name = `${category}-${id}.json`;
              tasks.push(value ? write(name, value) : remove(name));
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: async () => {
      await write('creds.json', creds);
      if (creds.account) await write('creds.backup.json', creds);
    }
  };
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return null;
  }
}

// Linked once WhatsApp accepted this device (QR code or code): the saved sign-in then has
// the account WhatsApp signed. (With a code, the number is saved before it is entered.)
function isLinked() {
  if (!authDir) return false;
  return Boolean(readJsonFile(path.join(authDir, 'creds.json'))?.account
    || readJsonFile(path.join(authDir, 'creds.backup.json'))?.account);
}

// Throws the sign-in away (after the writes still running).
async function clearAuth() {
  await flushWrites();
  authGeneration += 1;
  if (authDir) fs.rmSync(authDir, { recursive: true, force: true });
}

/* ---------------- Whether reminders are wanted ---------------- */

// whatsapp-link.json: { wanted, phone, linkedAt, lostAt, lostReason }. Written when WhatsApp
// connects, marked lost when WhatsApp ends the link, removed when the owner unlinks.
function linkFile() {
  return path.join(dataDir, 'whatsapp-link.json');
}

function readLink() {
  return dataDir ? readJsonFile(linkFile()) : null;
}

function writeLink(value) {
  try {
    writeFileAtomicSync(linkFile(), JSON.stringify(value));
  } catch (error) {
    console.error('WhatsApp: could not save the link state:', error.message);
  }
}

function markLost(reason) {
  const link = readLink();
  if (link?.wanted && !link.lostAt) writeLink({ ...link, lostAt: new Date().toISOString(), lostReason: reason });
}

// What the cashier should warn the owner about, or null when all is well.
function currentProblem() {
  const link = readLink();
  if (!link?.wanted || status.state === 'ready') return null;
  if (status.state === 'unavailable') return 'unavailable';
  if (link.lostAt || status.state === 'off') return 'logged-out';
  const since = Date.parse(status.downSince || '');
  return Number.isFinite(since) && Date.now() - since > ALERT_AFTER_MS ? 'disconnected' : null;
}

function markDown() {
  if (!status.downSince) status.downSince = new Date().toISOString();
}

/* ---------------- Sent messages ---------------- */

function sentFile() {
  return path.join(dataDir, 'whatsapp-sent.json');
}

function loadSent() {
  if (sentLoaded) return;
  sentLoaded = true;
  try {
    const list = JSON.parse(fs.readFileSync(sentFile(), 'utf8'), baileys.BufferJSON.reviver);
    if (Array.isArray(list)) list.slice(-SENT_KEEP).forEach(([id, message]) => sentMessages.set(id, message));
  } catch (error) {
    // Nothing sent yet.
  }
}

function saveSentNow() {
  const text = JSON.stringify([...sentMessages], baileys.BufferJSON.replacer);
  track(writeFileAtomic(sentFile(), text).catch(error => console.error('WhatsApp: could not save sent messages:', error.message)));
}

function rememberSent(message) {
  const id = message?.key?.id;
  if (!id || !message.message) return;
  sentMessages.set(id, message.message);
  while (sentMessages.size > SENT_KEEP) sentMessages.delete(sentMessages.keys().next().value);
  clearTimeout(sentSaveTimer);
  sentSaveTimer = setTimeout(() => {
    sentSaveTimer = null;
    saveSentNow();
  }, 1000);
  sentSaveTimer.unref?.();
}

/* ---------------- Connection ---------------- */

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = retryDelay;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect().catch(error => console.error('WhatsApp:', error.message));
  }, delay);
  retryTimer.unref?.();
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  return delay;
}

// The newest WhatsApp version, so WhatsApp does not refuse an old one. If it did refuse
// (code 405), the version WhatsApp Web itself uses is asked for instead.
async function pickVersion() {
  const fetchVersion = useWebVersion ? baileys.fetchLatestWaWebVersion : baileys.fetchLatestBaileysVersion;
  if (typeof fetchVersion !== 'function') return null;
  try {
    const latest = await withTimeout(fetchVersion({ timeout: VERSION_TIMEOUT_MS }), VERSION_TIMEOUT_MS + 2000, 'Checking the WhatsApp version');
    return latest?.version || null;
  } catch (error) {
    if (DEBUG) console.log('[whatsapp] could not check the version:', error.message);
    return null;
  }
}

async function connect() {
  if (starting || socket || !authDir) return;
  if (!await loadLibraries()) return;
  starting = true;
  clearTimeout(retryTimer);
  retryTimer = null;
  status.state = 'connecting';
  status.qr = null;
  status.code = null;
  connectingSince = Date.now();
  pairRequested = false;
  loadSent();

  try {
    const { state: auth, saveCreds } = await useSafeAuthState(authDir);
    const options = {
      auth,
      logger: makeLogger(),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      browser: baileys.Browsers.appropriate('Chrome'),
      // A client's phone that could not open a message asks for it again.
      getMessage: async key => {
        const stored = sentMessages.get(key?.id);
        return stored ? baileys.proto.Message.fromObject(stored) : undefined;
      }
    };
    const version = await pickVersion();
    if (version) options.version = version;

    const makeSocket = baileys.makeWASocket || baileys.default;
    const current = makeSocket(options);
    socket = current;
    current.ev.on('creds.update', saveCreds);
    current.ev.on('connection.update', update => onUpdate(current, auth, update));
  } catch (error) {
    socket = null;
    status.error = error.message;
    console.error('WhatsApp could not connect:', error.message);
    if (isLinked()) {
      status.state = 'connecting';
      markDown();
      scheduleRetry();
    } else {
      status.state = 'off';
    }
  } finally {
    starting = false;
  }
}

function onUpdate(current, auth, update) {
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
    Object.assign(status, { state: 'ready', qr: null, code: null, error: null, downSince: null });
    pairPhone = null;
    retryDelay = FIRST_RETRY_MS;
    logoutCount = 0;
    status.phone = String(current.user?.id || '').split(/[:@]/)[0] || null;
    const link = readLink();
    writeLink({
      wanted: true,
      phone: status.phone,
      linkedAt: link?.wanted && !link.lostAt && link.linkedAt ? link.linkedAt : new Date().toISOString(),
      lostAt: null,
      lostReason: null
    });
    console.log(`WhatsApp connected${status.phone ? ` (+${status.phone})` : ''}.`);
  }
  if (update.connection === 'close') onClose(auth, update);
}

function onClose(auth, update) {
  socket = null;
  const error = update.lastDisconnect?.error;
  const code = error?.output?.statusCode;
  const reason = `${code || 'no code'}: ${error?.message || 'closed'}`;
  const reasons = baileys.DisconnectReason;

  if (code === reasons.restartRequired) {
    // Normal right after linking: WhatsApp asks for a new connection.
    retryDelay = 1000;
    scheduleRetry();
    return;
  }
  if (!auth.creds?.account) {
    // Linking was not finished: the QR code or the code was not used in time. The owner can try again.
    console.log(`WhatsApp linking stopped (${reason}).`);
    pairPhone = null;
    Object.assign(status, { state: 'off', qr: null, code: null });
    clearAuth().catch(clearError => console.error('WhatsApp:', clearError.message));
    return;
  }
  if (code === reasons.loggedOut) {
    logoutCount += 1;
    if (logoutCount < LOGOUT_CHECKS) {
      console.log(`WhatsApp says the shop's number was logged out (${reason}). Checking again in ${LOGOUT_CHECK_MS / 1000} seconds.`);
      markDown();
      status.state = 'connecting';
      retryDelay = LOGOUT_CHECK_MS;
      scheduleRetry();
      return;
    }
    // Logged out on the phone (Linked devices → Log out) or by WhatsApp: the sign-in no longer
    // works. The cashier asks the owner to link again.
    console.log('WhatsApp logged the shop\'s number out. Link it again in the cashier: Settings → WhatsApp reminders.');
    logoutCount = 0;
    pairPhone = null;
    markLost('logged-out');
    Object.assign(status, { state: 'off', qr: null, code: null, phone: null, error: null });
    clearAuth().catch(clearError => console.error('WhatsApp:', clearError.message));
    return;
  }

  // Anything else (the internet, WhatsApp busy, a WhatsApp update): connect again, waiting a
  // little longer each time, up to a minute. It never gives up.
  if (code === OUTDATED_CODE && !useWebVersion) {
    useWebVersion = true;
    retryDelay = FIRST_RETRY_MS;
  }
  if (code === reasons.connectionReplaced) {
    console.log('WhatsApp: another program is using this link (is the server running twice?).');
    retryDelay = Math.max(retryDelay, 30 * 1000);
  }
  markDown();
  status.state = 'connecting';
  status.error = error?.message || null;
  const delay = scheduleRetry();
  console.log(`WhatsApp disconnected (${reason}). Connecting again in ${Math.round(delay / 1000)} s.`);
}

module.exports = {
  // Called once when the server starts. Connects again if the shop's WhatsApp was linked before.
  init(folder) {
    dataDir = folder;
    authDir = path.join(folder, 'whatsapp-auth');
    removeTempFiles();
    if (isLinked()) {
      markDown();
      connect().catch(error => console.error('WhatsApp:', error.message));
    } else if (readLink()?.wanted) {
      // Reminders were on, but the sign-in is gone: the owner has to link again.
      markLost('missing');
      console.log('WhatsApp is not linked any more. Link it again in the cashier: Settings → WhatsApp reminders.');
    }
  },

  // Called every 30 seconds by the server: connects if nothing else is doing it, and starts a
  // connection that has hung again.
  ensureConnected() {
    if (!authDir || starting || retryTimer) return;
    if (socket) {
      if (status.state === 'connecting' && Date.now() - connectingSince > STUCK_MS) {
        console.log('WhatsApp: the connection did not open in 3 minutes; starting it again.');
        const stuck = socket;
        socket = null;
        try {
          stuck.end(new Error('The connection did not open'));
        } catch (error) {
          // Already closed.
        }
        markDown();
        scheduleRetry();
      }
      return;
    }
    if (isLinked()) connect().catch(error => console.error('WhatsApp:', error.message));
  },

  status() {
    const link = readLink();
    return {
      ...status,
      wanted: Boolean(link?.wanted),
      lostAt: link?.lostAt || null,
      lostReason: link?.lostReason || null,
      problem: currentProblem()
    };
  },

  isReady() {
    return status.state === 'ready' && Boolean(socket);
  },

  // The owner pressed "Show QR code" (no number) or "Get code" (the shop's number, digits
  // with the country code).
  async link(phoneDigits = null) {
    if (socket || starting || isLinked()) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    await clearAuth();
    pairPhone = phoneDigits || null;
    retryDelay = FIRST_RETRY_MS;
    logoutCount = 0;
    await connect();
  },

  // The owner stopped linking (Cancel). Reminders stay wanted, so a lost link is still shown.
  async cancel() {
    if (isLinked()) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    pairPhone = null;
    const current = socket;
    socket = null;
    if (current) {
      try { current.end(undefined); } catch (error) { /* already closed */ }
    }
    await clearAuth();
    Object.assign(status, { state: baileys ? 'off' : status.state, qr: null, code: null, error: null });
  },

  // The owner pressed "Unlink": log out on WhatsApp too, then forget the link. No reminders wanted.
  async unlink() {
    clearTimeout(retryTimer);
    retryTimer = null;
    pairPhone = null;
    const current = socket;
    socket = null;
    if (current) {
      try {
        await withTimeout(current.logout(), 15000, 'Logging out');
      } catch (error) {
        try { current.end(undefined); } catch (endError) { /* already closed */ }
      }
    }
    await clearAuth();
    if (dataDir) fs.rmSync(linkFile(), { force: true });
    Object.assign(status, { state: baileys ? 'off' : status.state, qr: null, code: null, phone: null, error: null, downSince: null });
  },

  /*
   * Sends a text to a phone number written as digits with the country code (9647501234567).
   * Returns 'sent', or 'no-whatsapp' when that number has no WhatsApp. Throws when it could
   * not send (it is tried again on the next check).
   */
  async sendText(digits, text) {
    if (!module.exports.isReady()) throw new Error('WhatsApp is not linked.');
    const current = socket;
    return withTimeout((async () => {
      // Look the number up first. When the lookup fails or finds nothing, the message is sent
      // anyway: sending to a number that has no WhatsApp fails, so nobody is missed by mistake.
      let found = null;
      let looked = false;
      try {
        const results = await current.onWhatsApp(digits);
        if (Array.isArray(results)) {
          looked = true;
          found = results.find(result => result?.exists) || null;
        }
      } catch (error) {
        if (DEBUG) console.log('[whatsapp] lookup failed:', error.message);
      }
      try {
        const sent = await current.sendMessage(found?.jid || `${digits}@s.whatsapp.net`, { text });
        rememberSent(sent);
        status.lastSentAt = new Date().toISOString();
        return 'sent';
      } catch (error) {
        // The lookup found no WhatsApp and the message could not be delivered either, while the
        // connection is fine: the number has no WhatsApp.
        if (looked && !found && socket === current && module.exports.isReady()) return 'no-whatsapp';
        throw error;
      }
    })(), SEND_TIMEOUT_MS, 'Sending the message');
  },

  // The server is stopping: close the connection and finish saving the sign-in first.
  async close() {
    clearTimeout(retryTimer);
    retryTimer = null;
    const current = socket;
    socket = null;
    if (current) {
      try { current.end(undefined); } catch (error) { /* already closed */ }
    }
    if (sentSaveTimer) {
      clearTimeout(sentSaveTimer);
      sentSaveTimer = null;
      saveSentNow();
    }
    await flushWrites();
  }
};
