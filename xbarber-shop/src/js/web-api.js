(function () {
    if (window.electronAPI || window.webApi) return;

    const DATABASE_NAME = 'xbarber-offline';
    const DATABASE_VERSION = 2;
    const DATABASE_STORE = 'storage';
    const DATABASE_KEY = 'sqlite';
    const LOCK_KEY = 'database-lock';
    const MAX_TRANSACTION_STATEMENTS = 100;
    const REQUEST_TIMEOUT_MS = 20000;

    let modePromise;
    let sqlPromise;
    let indexedDbPromise;
    let operationQueue = Promise.resolve();
    let offlineFilesReady = false;

    const STATUS_FALLBACK = {
        'net.onlineReady': 'Online · works offline',
        'net.onlinePreparing': 'Online · preparing offline mode…',
        'net.offlineReady': 'Offline · saving on this device',
        'net.offlineNotReady': 'Offline · connect once to enable offline mode',
        'net.unavailable': 'Offline mode needs HTTPS',
        'net.serverOnline': 'Online · connected to the shop server',
        'net.serverOffline': 'No internet · the cashier needs internet'
    };
    let statusKey = null;
    let statusState = 'checking';
    // Online cashier (shop server): no offline copy, the data is on the server.
    let serverMode = false;

    function setStatus(key, state) {
        statusKey = key;
        statusState = state;
        const status = document.getElementById('offline-status');
        if (!status) return;
        status.textContent = window.I18N ? window.I18N.t(key) : STATUS_FALLBACK[key] || key;
        status.dataset.state = state;
        status.dataset.key = key;
    }

    function refreshStatus() {
        if (statusKey) setStatus(statusKey, statusState);
    }

    function updateNetworkStatus() {
        if (serverMode) {
            setStatus(navigator.onLine ? 'net.serverOnline' : 'net.serverOffline', navigator.onLine ? 'online' : 'offline');
            return;
        }
        if (statusState === 'error') return;
        if (navigator.onLine) {
            setStatus(offlineFilesReady ? 'net.onlineReady' : 'net.onlinePreparing', 'online');
        } else {
            setStatus(offlineFilesReady ? 'net.offlineReady' : 'net.offlineNotReady', 'offline');
        }
    }

    async function request(url, payload, method = 'POST') {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let response;
        try {
            response = await fetch(url, {
                method,
                credentials: 'same-origin',
                cache: 'no-store',
                headers: payload ? { 'Content-Type': 'application/json' } : {},
                body: payload ? JSON.stringify(payload) : undefined,
                signal: controller.signal
            });
        } catch (error) {
            throw new Error('Could not reach the XBARBER server. Check the internet connection and try again.');
        } finally {
            clearTimeout(timer);
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const requestError = new Error(data.error || `Request failed (${response.status}).`);
            requestError.status = response.status;
            throw requestError;
        }
        return data;
    }

    // Online: a backup comes back from the server as a file.
    async function requestFile(url) {
        let response;
        try {
            response = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
        } catch (error) {
            throw new Error('Could not reach the XBARBER server. Check the internet connection and try again.');
        }
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const requestError = new Error(data.error || `Request failed (${response.status}).`);
            requestError.status = response.status;
            throw requestError;
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    async function resolveMode() {
        try {
            const response = await fetch('/app-mode.json', { cache: 'no-store' });
            if (response.ok) {
                const config = await response.json();
                if (config.mode === 'server' || config.mode === 'indexeddb') {
                    return config.mode;
                }
            }
        } catch (error) {
            if (navigator.onLine) {
                console.warn('Could not load the app-mode configuration; using local offline storage:', error.message);
            }
        }

        // A missing/static-host config must not reuse a stale server mode from an older deployment.
        return 'indexeddb';
    }

    function getMode() {
        if (!modePromise) modePromise = resolveMode();
        return modePromise;
    }

    function openIndexedDb() {
        if (indexedDbPromise) return indexedDbPromise;
        indexedDbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('This browser does not support IndexedDB, which is required for offline data.'));
                return;
            }
            const opening = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            opening.onupgradeneeded = () => {
                const database = opening.result;
                if (!database.objectStoreNames.contains(DATABASE_STORE)) {
                    database.createObjectStore(DATABASE_STORE);
                }
            };
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => reject(opening.error || new Error('Could not open offline database storage.'));
            opening.onblocked = () => reject(new Error('Close other XBARBER tabs to finish updating local storage.'));
        });
        return indexedDbPromise;
    }

    function idbRequest(requestObject) {
        return new Promise((resolve, reject) => {
            requestObject.onsuccess = () => resolve(requestObject.result);
            requestObject.onerror = () => reject(requestObject.error || new Error('IndexedDB request failed.'));
        });
    }

    function idbTransactionDone(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
        });
    }

    async function readStoredDatabase() {
        const database = await openIndexedDb();
        const transaction = database.transaction(DATABASE_STORE, 'readonly');
        const value = await idbRequest(transaction.objectStore(DATABASE_STORE).get(DATABASE_KEY));
        await idbTransactionDone(transaction);
        return value || null;
    }

    async function persistDatabase(bytes) {
        const storage = await openIndexedDb();
        const transaction = storage.transaction(DATABASE_STORE, 'readwrite');
        transaction.objectStore(DATABASE_STORE).put(bytes, DATABASE_KEY);
        await idbTransactionDone(transaction);
    }

    async function acquireLease(owner) {
        const storage = await openIndexedDb();
        const transaction = storage.transaction(DATABASE_STORE, 'readwrite');
        const store = transaction.objectStore(DATABASE_STORE);
        const requestObject = store.get(LOCK_KEY);
        let acquired = false;
        requestObject.onsuccess = () => {
            const lock = requestObject.result;
            if (!lock || lock.expiresAt < Date.now() || lock.owner === owner) {
                store.put({ owner, expiresAt: Date.now() + 30000 }, LOCK_KEY);
                acquired = true;
            }
        };
        await idbTransactionDone(transaction);
        return acquired;
    }

    async function releaseLease(owner) {
        const storage = await openIndexedDb();
        const transaction = storage.transaction(DATABASE_STORE, 'readwrite');
        const store = transaction.objectStore(DATABASE_STORE);
        const requestObject = store.get(LOCK_KEY);
        requestObject.onsuccess = () => {
            if (requestObject.result?.owner === owner) store.delete(LOCK_KEY);
        };
        await idbTransactionDone(transaction);
    }

    async function withDatabaseLock(task) {
        if (navigator.locks?.request) {
            return navigator.locks.request('xbarber-sqlite-database', { mode: 'exclusive' }, task);
        }

        const owner = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const deadline = Date.now() + 15000;
        while (!(await acquireLease(owner))) {
            if (Date.now() >= deadline) {
                throw new Error('Another XBARBER window is busy. Close it and retry.');
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        try {
            return await task();
        } finally {
            await releaseLease(owner);
        }
    }

    function enqueue(task) {
        const next = operationQueue.then(task, task);
        operationQueue = next.catch(() => {});
        return next;
    }

    async function loadSqlModule() {
        if (!sqlPromise) {
            if (typeof window.initSqlJs !== 'function') {
                throw new Error('SQLite could not load. Reopen XBARBER SHOP while online once, then retry.');
            }
            sqlPromise = window.initSqlJs({
                locateFile: filename => new URL(`../vendor/${filename}`, window.location.href).href
            });
        }
        return sqlPromise;
    }

    function queryRows(database, query, params = []) {
        const statement = database.prepare(query);
        try {
            statement.bind(params);
            const rows = [];
            while (statement.step()) rows.push(statement.getAsObject());
            return rows;
        } finally {
            statement.free();
        }
    }

    function writeResult(database, query, params = []) {
        database.run(query, params);
        const rows = queryRows(database, 'SELECT last_insert_rowid() AS lastID');
        return { lastID: Number(rows[0]?.lastID || 0), changes: database.getRowsModified() };
    }

    async function ensureSchema(database) {
        const schemaResponse = await fetch('/database/schema.sql', { cache: 'no-store' });
        if (!schemaResponse.ok) {
            throw new Error(`Could not load the database schema (${schemaResponse.status}).`);
        }
        database.run(await schemaResponse.text());
        database.run('PRAGMA foreign_keys = ON');
        const customerColumns = queryRows(database, 'PRAGMA table_info(customers)');
        if (!customerColumns.some(column => column.name === 'is_active')) {
            database.run('ALTER TABLE customers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1');
        }
        const orderColumns = queryRows(database, 'PRAGMA table_info(orders)');
        if (!orderColumns.some(column => column.name === 'barber_id')) {
            database.run('ALTER TABLE orders ADD COLUMN barber_id INTEGER REFERENCES barbers(id)');
        }
        const productColumns = queryRows(database, 'PRAGMA table_info(products)');
        if (!productColumns.some(column => column.name === 'category_id')) {
            database.run('ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)');
        }
        const updatedProductColumns = queryRows(database, 'PRAGMA table_info(products)');
        if (!updatedProductColumns.some(column => column.name === 'image_data')) {
            database.run('ALTER TABLE products ADD COLUMN image_data TEXT');
        }
        const updatedCustomerColumns = queryRows(database, 'PRAGMA table_info(customers)');
        if (!updatedCustomerColumns.some(column => column.name === 'image_data')) {
            database.run('ALTER TABLE customers ADD COLUMN image_data TEXT');
        }
        database.run('CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)');
    }

    async function loadDatabase() {
        const SQL = await loadSqlModule();
        const stored = await readStoredDatabase();
        let database;
        if (stored) {
            database = new SQL.Database(stored instanceof Uint8Array ? stored : new Uint8Array(stored));
            let databaseChanged = false;
            const hasCategoryTable = queryRows(
                database,
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'categories'"
            ).length > 0;
            const hasCategoryColumn = queryRows(database, 'PRAGMA table_info(products)')
                .some(column => column.name === 'category_id');
            const hasProductImageColumn = queryRows(database, 'PRAGMA table_info(products)')
                .some(column => column.name === 'image_data');
            const hasCustomerImageColumn = queryRows(database, 'PRAGMA table_info(customers)')
                .some(column => column.name === 'image_data');
            const hasCustomerActiveColumn = queryRows(database, 'PRAGMA table_info(customers)')
                .some(column => column.name === 'is_active');
            const hasOrderBarberColumn = queryRows(database, 'PRAGMA table_info(orders)')
                .some(column => column.name === 'barber_id');
            // Tables added later (barber accounts, app options, online bookings, product sales, barber photos) are created by the schema.
            const newerTables = queryRows(
                database,
                "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('barber_accounts', 'app_options', 'online_bookings', 'product_sales', 'product_sale_items', 'barber_photos', 'expenses')"
            )[0].count;
            database.run('PRAGMA foreign_keys = ON');
            if (!hasCategoryTable || !hasCategoryColumn || !hasProductImageColumn || !hasCustomerImageColumn
                || !hasCustomerActiveColumn || !hasOrderBarberColumn || Number(newerTables) < 7) {
                await ensureSchema(database);
                databaseChanged = true;
            }
            const outdatedCurrency = queryRows(
                database,
                "SELECT COUNT(*) AS count FROM settings WHERE currency IS NULL OR currency <> 'IQD'"
            )[0].count;
            if (Number(outdatedCurrency)) {
                database.run("UPDATE settings SET currency = 'IQD'");
                databaseChanged = true;
            }
            if (databaseChanged) await persistDatabase(database.export());
        } else {
            database = new SQL.Database();
            await ensureSchema(database);
            await persistDatabase(database.export());
        }
        return database;
    }

    function resolveParams(params, results) {
        if (!Array.isArray(params)) return [];
        return params.map(value => {
            if (value && typeof value === 'object' && Number.isInteger(value.lastIDFrom)) {
                const prior = results[value.lastIDFrom];
                if (!prior || !Number.isInteger(prior.lastID)) {
                    throw new Error('A database transaction referenced an invalid previous result.');
                }
                return prior.lastID;
            }
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return value === true ? 1 : value === false ? 0 : value;
            }
            throw new Error('Invalid database transaction parameter.');
        });
    }

    function validateWriteQuery(query) {
        if (typeof query !== 'string' || query.length > 20000 || query.includes('\0')) {
            throw new Error('Invalid database statement.');
        }
        if (!/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query)) {
            throw new Error('Offline transactions only accept data-changing SQL statements.');
        }
    }

    async function localOperation(task) {
        return enqueue(() => withDatabaseLock(async () => {
            const database = await loadDatabase();
            try {
                return await task(database);
            } finally {
                database.close();
            }
        }));
    }

    async function localQuery(query, params = []) {
        if (typeof query !== 'string' || !/^\s*(SELECT|WITH)\b/i.test(query)) {
            throw new Error('Only read queries are allowed.');
        }
        return localOperation(database => queryRows(database, query, params));
    }

    async function localTransaction(statements) {
        if (!Array.isArray(statements) || !statements.length || statements.length > MAX_TRANSACTION_STATEMENTS) {
            throw new Error('A database transaction must contain between 1 and 100 statements.');
        }
        statements.forEach(statement => validateWriteQuery(statement?.query));
        return localOperation(async database => {
            const results = [];
            database.run('BEGIN IMMEDIATE');
            try {
                statements.forEach(statement => {
                    results.push(writeResult(database, statement.query, resolveParams(statement.params, results)));
                });
                database.run('COMMIT');
                await persistDatabase(database.export());
                return results;
            } catch (error) {
                try {
                    database.run('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Could not roll back offline database transaction:', rollbackError);
                }
                throw error;
            }
        });
    }

    function downloadDatabase(bytes) {
        const blob = new Blob([bytes], { type: 'application/vnd.sqlite3' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `xbarber-backup-${stamp}.db`;
        link.href = url;
        link.download = filename;
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return filename;
    }

    function chooseBackupFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream';
            input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
            input.addEventListener('cancel', () => resolve(null), { once: true });
            input.click();
            setTimeout(() => {
                if (!input.isConnected && !input.files?.length) resolve(null);
            }, 120000);
        });
    }

    async function restoreLocalDatabase() {
        const file = await chooseBackupFile();
        if (!file) return { canceled: true };
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\u0000') {
            throw new Error('Choose a valid XBARBER SQLite backup file.');
        }
        const SQL = await loadSqlModule();
        const candidate = new SQL.Database(bytes);
        try {
            const check = queryRows(candidate, 'PRAGMA integrity_check');
            if (check.length !== 1 || check[0].integrity_check !== 'ok') {
                throw new Error('The selected backup failed its SQLite integrity check.');
            }
            await ensureSchema(candidate);
            await enqueue(() => withDatabaseLock(() => persistDatabase(candidate.export())));
        } finally {
            candidate.close();
        }
        return { canceled: false, filePath: file.name };
    }

    const api = {
        isLocalDatabase: async () => (await getMode()) === 'indexeddb',
        // Server mode: the server checks admin and barber accounts and returns the signed-in user.
        // Offline mode: only the admin is checked here; app.js checks barber accounts in the local database.
        login: async (username, password) => {
            if (await getMode() === 'server') {
                try {
                    const result = await request('/api/login', { username, password });
                    return result.user || { role: 'admin', username: 'admin' };
                } catch (error) {
                    if (error.status === 401) return false;
                    throw error;
                }
            }
            return username.trim() === 'admin' && password === 'admin123';
        },
        dbQuery: async (query, params = []) => {
            if (await getMode() === 'server') return request('/api/db-query', { query, params });
            return localQuery(query, params);
        },
        // Runs several read queries; offline mode opens the stored database only once.
        dbQueryMany: async queries => {
            if (!Array.isArray(queries)) throw new Error('A list of queries is required.');
            if (await getMode() === 'server') {
                return Promise.all(queries.map(item => request('/api/db-query', { query: item.query, params: item.params || [] })));
            }
            queries.forEach(item => {
                if (typeof item?.query !== 'string' || !/^\s*(SELECT|WITH)\b/i.test(item.query)) {
                    throw new Error('Only read queries are allowed.');
                }
            });
            return localOperation(database => queries.map(item => queryRows(database, item.query, item.params || [])));
        },
        refreshStatus,
        dbRun: async (query, params = []) => {
            if (await getMode() === 'server') return request('/api/db-run', { query, params });
            const results = await localTransaction([{ query, params }]);
            return results[0];
        },
        runTransaction: async statements => {
            if (await getMode() === 'server') return request('/api/db-transaction', { statements });
            return localTransaction(statements);
        },
        clearHistory: async today => {
            if (await getMode() === 'server') return request('/api/clear-history', { today });
            await api.runTransaction([
                { query: "DELETE FROM appointments WHERE date < ? OR (date = ? AND status IN ('completed', 'cancelled'))", params: [today, today] },
                { query: 'DELETE FROM payments', params: [] },
                { query: 'DELETE FROM order_items', params: [] },
                { query: 'DELETE FROM orders', params: [] },
                { query: 'DELETE FROM product_sale_items', params: [] },
                { query: 'DELETE FROM product_sales', params: [] },
                { query: 'DELETE FROM expenses', params: [] }
            ]);
            return true;
        },
        // Online: the server checks the history password, so its hash never leaves the server.
        checkHistoryPassword: async password => {
            const result = await request('/api/check-history-password', { password });
            return Boolean(result.ok);
        },
        // Online: changes the owner's ("admin") sign-in password.
        changeAdminPassword: (current, next) => request('/api/admin-password', { current, next }),
        // Online, owner only: the shop's WhatsApp for reminders. action: status, link or unlink.
        whatsapp: (action, payload = {}) => request(`/api/whatsapp/${action}`, payload),
        backupDatabase: async () => {
            if (await getMode() === 'server') return downloadDatabase(await requestFile('/api/backup-download'));
            const bytes = await localOperation(database => database.export());
            return downloadDatabase(bytes);
        },
        restoreDatabase: async () => {
            if (await getMode() === 'server') {
                const file = await chooseBackupFile();
                if (!file) return { canceled: true };
                const bytes = new Uint8Array(await file.arrayBuffer());
                if (new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\u0000') {
                    throw new Error('Choose a valid XBARBER SQLite backup file.');
                }
                let response;
                try {
                    response = await fetch('/api/restore-upload', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: bytes
                    });
                } catch (error) {
                    throw new Error('Could not reach the XBARBER server. Check the internet connection and try again.');
                }
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
                return { canceled: false, filePath: file.name };
            }
            return restoreLocalDatabase();
        },
        exportSchedulePdf: async () => {
            window.print();
            return { canceled: false, filePath: null };
        }
    };

    window.webApi = api;
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    getMode().then(mode => {
        if (mode === 'server') {
            // The shop server also serves the booking website, so no offline copy of pages is kept here.
            serverMode = true;
            updateNetworkStatus();
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations()
                    .then(list => list.forEach(registration => registration.unregister()))
                    .catch(() => {});
            }
            return;
        }
        updateNetworkStatus();
        if (window.isSecureContext && 'serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => {
                return navigator.serviceWorker.ready;
            }).then(() => {
                offlineFilesReady = true;
                updateNetworkStatus();
            }).catch(error => {
                console.error('Could not install offline support:', error);
                setStatus('net.unavailable', 'error');
            });
        } else {
            setStatus('net.unavailable', 'error');
        }
    });
})();
