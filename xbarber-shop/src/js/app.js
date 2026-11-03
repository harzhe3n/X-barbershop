'use strict';

/*
 * XBARBER SHOP
 *
 * Pages: Cashier (one column per barber), Dashboard, History, Catalog, Barbers, Settings.
 *
 * A client visit is a row in `orders`:
 *   waiting     -> client added, not started
 *   in-service  -> client is with the barber ("Take client")
 *   completed   -> finished and paid
 * Its services and products live in `order_items`. The Electron app, the local servers and
 * the PWA all share this schema.
 *
 * Who can do what:
 *   admin  (admin / admin123) -> every page, every client, creates barber sign-ins
 *   barber (barber_accounts)  -> Cashier and History; changes only their own clients
 * Finished (paid) clients can only be changed after entering the history edit password.
 *
 * Online booking: when it is turned on in Settings, the app syncs with the booking website
 * (xoshawi.com). See docs/ONLINE-BOOKING.md for the API the website provides.
 */

const api = window.electronAPI || window.webApi;
if (!api) throw new Error('XBARBER SHOP needs its desktop API or the hosted offline app; do not open it as a file.');

const I18N = window.I18N;
const t = I18N.t;

const XAuth = window.XAuth;

const OPEN_STATUSES = ['waiting', 'in-service'];
const ADMIN_PAGES = ['cashier', 'dashboard', 'history', 'catalog', 'barbers', 'settings'];
const BARBER_PAGES = ['cashier', 'history'];
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
// Hash of the default password for editing finished clients. The admin can change it in Settings.
const DEFAULT_HISTORY_PASSWORD_HASH = 'sha256i$2000$e5c1d0a94b7f3c2a6d18f0b9$a3be0402ed692e89e332b4cbc0f6e386678ea349fb58a7c0881bb1b69dca4965';
const EDIT_UNLOCK_MS = 5 * 60 * 1000;
const PAGE_ICONS = {
    cashier: 'columns',
    dashboard: 'chart',
    history: 'history',
    catalog: 'tag',
    barbers: 'users',
    settings: 'sliders'
};
const MAX_TRANSACTION_STATEMENTS = 100;
const REFRESH_INTERVAL_MS = 60000;

const state = {
    signedIn: false,
    user: null,
    editUnlockedUntil: 0,
    booking: null,
    page: 'cashier',
    boardDate: todayString(),
    dashPeriod: 'today',
    historyPeriod: 'today',
    historyDay: todayString(),
    catalogTab: 'services',
    productCategory: 'all',
    shopName: 'XBARBER SHOP',
    openDone: new Set(),
    renderToken: 0
};

const dom = {
    login: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    app: document.getElementById('main-app'),
    nav: document.getElementById('nav'),
    title: document.getElementById('page-title'),
    subtitle: document.getElementById('page-subtitle'),
    actions: document.getElementById('page-actions'),
    page: document.getElementById('page'),
    modalRoot: document.getElementById('modal-root'),
    toastRoot: document.getElementById('toast-root')
};

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, stroke style)                                    */
/* ------------------------------------------------------------------ */

const ICONS = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    columns: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    sliders: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'
};

function icon(name, className = '') {
    return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function safeImage(value) {
    const text = String(value || '');
    return /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(text) ? text : '';
}

function initials(name) {
    const text = String(name || '').trim();
    return text ? Array.from(text)[0].toUpperCase() : '?';
}

function digits(value) {
    return String(value || '').replace(/\D+/g, '');
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function toDateString(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayString() {
    return toDateString(new Date());
}

function parseDate(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

function addDays(value, amount) {
    const date = parseDate(value);
    date.setDate(date.getDate() + amount);
    return toDateString(date);
}

function nowTime() {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isValidTime(value) {
    return /^\d{2}:\d{2}(:\d{2})?$/.test(String(value || ''));
}

function sum(list, pick) {
    return list.reduce((total, item) => total + Number(pick(item) || 0), 0);
}

function money(value) {
    return `<bdi class="money">${escapeHtml(I18N.formatNumber(value))}<small>${escapeHtml(I18N.currency())}</small></bdi>`;
}

function moneyText(value) {
    return I18N.formatMoney(value);
}

function timeLabel(value) {
    return value ? escapeHtml(I18N.formatTime(String(value).slice(0, 5))) : '';
}

function periodRange(period, day) {
    const today = todayString();
    if (period === 'week') return { start: addDays(today, -6), end: today };
    if (period === 'month') {
        const date = parseDate(today);
        return { start: `${today.slice(0, 8)}01`, end: toDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
    }
    if (period === 'all') return { start: '0000-01-01', end: '9999-12-31' };
    if (period === 'day' && isValidDate(day)) return { start: day, end: day };
    return { start: today, end: today };
}

function periodLabel(period, day) {
    const range = periodRange(period, day);
    if (period === 'all') return t('period.all');
    if (range.start === range.end) return I18N.formatDate(range.start, { weekday: true });
    return `${I18N.formatDate(range.start)} – ${I18N.formatDate(range.end)}`;
}

/* ------------------------------------------------------------------ */
/* Database helpers                                                    */
/* ------------------------------------------------------------------ */

async function queryMany(list) {
    if (typeof api.dbQueryMany === 'function') return api.dbQueryMany(list);
    return Promise.all(list.map(item => api.dbQuery(item.query, item.params || [])));
}

async function queryOne(query, params = []) {
    return (await api.dbQuery(query, params))[0] || null;
}

async function runStatements(statements) {
    if (!statements.length) return [];
    if (statements.length > MAX_TRANSACTION_STATEMENTS) throw new Error(t('err.tooManyItems'));
    return api.runTransaction(statements);
}

function handleError(error) {
    console.error(error);
    if (error && error.status === 401) {
        signOut();
        toast(t('err.session'), 'error');
        return;
    }
    toast(t('err.generic', { message: error?.message || '' }), 'error');
}

function setOption(key, value) {
    return {
        query: 'INSERT OR REPLACE INTO app_options (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        params: [key, value == null ? null : String(value)]
    };
}

/* ------------------------------------------------------------------ */
/* Roles: admin sees and changes everything, a barber only their own    */
/* ------------------------------------------------------------------ */

function isAdmin() {
    return state.user?.role === 'admin';
}

function myBarberId() {
    return state.user?.role === 'barber' ? Number(state.user.barberId) : null;
}

function allowedPages() {
    return isAdmin() ? ADMIN_PAGES : BARBER_PAGES;
}

function isMine(barberId) {
    return barberId != null && myBarberId() != null && Number(barberId) === myBarberId();
}

function canManageTicket(ticket) {
    return isAdmin() || isMine(ticket?.barber_id);
}

// Barbers may take a waiting client who has no barber yet; the client becomes theirs.
function canTakeTicket(ticket) {
    return canManageTicket(ticket) || (ticket?.barber_id == null && myBarberId() != null);
}

function denyNotYours() {
    toast(t('err.notYours'), 'error');
}

/* ------------------------------------------------------------------ */
/* Toasts and modals                                                   */
/* ------------------------------------------------------------------ */

function toast(message, type = 'success') {
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<span>${escapeHtml(message)}</span>`;
    dom.toastRoot.appendChild(element);
    requestAnimationFrame(() => element.classList.add('show'));
    setTimeout(() => {
        element.classList.remove('show');
        setTimeout(() => element.remove(), 300);
    }, type === 'error' ? 5200 : 2600);
}

const modalStack = [];
let modalCounter = 0;

function openModal({ title, body, footer = '', size = 'md', dismissible = true, autofocus = false, onClose, className = '' }) {
    const id = `modal-${++modalCounter}`;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
        <div class="modal modal-${size} ${className}" role="dialog" aria-modal="true" aria-labelledby="${id}-title" tabindex="-1">
            <header class="modal-head">
                <h2 id="${id}-title">${escapeHtml(title)}</h2>
                <button type="button" class="btn-icon" data-modal-close aria-label="${escapeHtml(t('common.close'))}">${icon('x')}</button>
            </header>
            <div class="modal-body">${body}</div>
            ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
        </div>`;

    const entry = {
        el: backdrop,
        modal: backdrop.firstElementChild,
        dismissible,
        closed: false,
        previousFocus: document.activeElement,
        close(result) {
            if (entry.closed) return;
            entry.closed = true;
            const index = modalStack.indexOf(entry);
            if (index >= 0) modalStack.splice(index, 1);
            backdrop.remove();
            document.body.classList.toggle('modal-open', modalStack.length > 0);
            if (typeof onClose === 'function') onClose(result);
            if (entry.previousFocus && typeof entry.previousFocus.focus === 'function' && document.contains(entry.previousFocus)) {
                entry.previousFocus.focus({ preventScroll: true });
            }
        }
    };

    let pressedBackdrop = false;
    backdrop.addEventListener('pointerdown', event => {
        pressedBackdrop = event.target === backdrop;
    });
    backdrop.addEventListener('click', event => {
        if (event.target === backdrop && pressedBackdrop && entry.dismissible) entry.close();
        if (event.target.closest('[data-modal-close]')) entry.close();
        pressedBackdrop = false;
    });

    modalStack.push(entry);
    dom.modalRoot.appendChild(backdrop);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => backdrop.classList.add('show'));
    setTimeout(() => {
        // Do not move focus away from a field the user already started typing in.
        if (document.activeElement !== entry.modal && entry.modal.contains(document.activeElement)) return;
        const target = autofocus
            ? entry.modal.querySelector('input:not([type="hidden"]):not([type="file"]), select, textarea')
            : null;
        (target || entry.modal).focus({ preventScroll: true });
    }, 40);
    return entry;
}

function closeAllModals() {
    [...modalStack].reverse().forEach(entry => entry.close());
}

function confirmDialog(message, { okLabel = t('common.confirm'), danger = false, title = t('confirm.title') } = {}) {
    return new Promise(resolve => {
        let accepted = false;
        const entry = openModal({
            title,
            size: 'sm',
            body: `<p class="confirm-text">${escapeHtml(message)}</p>`,
            footer: `
                <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm-ok>${escapeHtml(okLabel)}</button>`,
            onClose: () => resolve(accepted)
        });
        entry.modal.querySelector('[data-confirm-ok]').addEventListener('click', () => {
            accepted = true;
            entry.close();
        });
    });
}

function promptDialog({ title, label, value = '', okLabel = t('common.save'), placeholder = '', maxLength = 120 }) {
    return new Promise(resolve => {
        let result = null;
        const entry = openModal({
            title,
            size: 'sm',
            autofocus: true,
            body: `
                <form class="stack" data-prompt-form>
                    <label class="field">
                        <span>${escapeHtml(label)}</span>
                        <input type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="${maxLength}" data-prompt-input>
                    </label>
                </form>`,
            footer: `
                <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                <button type="button" class="btn btn-primary" data-prompt-ok>${escapeHtml(okLabel)}</button>`,
            onClose: () => resolve(result)
        });
        const input = entry.modal.querySelector('[data-prompt-input]');
        const accept = () => {
            result = input.value.trim();
            entry.close();
        };
        entry.modal.querySelector('[data-prompt-ok]').addEventListener('click', accept);
        entry.modal.querySelector('[data-prompt-form]').addEventListener('submit', event => {
            event.preventDefault();
            accept();
        });
    });
}

/* ------------------------------------------------------------------ */
/* Shell: login, navigation, language                                  */
/* ------------------------------------------------------------------ */

function renderLanguageSwitches() {
    const current = I18N.getLanguage();
    document.querySelectorAll('[data-lang-switch]').forEach(container => {
        container.innerHTML = I18N.languages.map(language => `
            <button type="button" class="lang-option ${language.code === current ? 'active' : ''}" data-action="lang" data-lang="${language.code}" aria-pressed="${language.code === current}" lang="${language.code}">
                <span class="lang-full">${escapeHtml(language.name)}</span>
                <span class="lang-short">${escapeHtml(language.short)}</span>
            </button>`).join('');
        container.setAttribute('aria-label', t('settings.language'));
    });
}

function renderNav() {
    const user = state.user || {};
    const userName = isAdmin() ? t('roles.admin') : (user.name || user.username || '');
    dom.nav.innerHTML = `
        <div class="nav-brand"><img src="../assets/logo/logo.png" alt="${escapeHtml(state.shopName)}"></div>
        <div class="nav-links">
            ${allowedPages().map(page => `
                <button type="button" class="nav-link ${state.page === page ? 'active' : ''}" data-action="go" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}>
                    ${icon(PAGE_ICONS[page])}
                    <span>${escapeHtml(t(`nav.${page}`))}</span>
                </button>`).join('')}
        </div>
        <div class="nav-user" title="${escapeHtml(t('roles.signedInAs', { name: userName }))}">
            <span class="avatar avatar-sm">${isAdmin() ? icon('key') : escapeHtml(initials(userName))}</span>
            <span class="nav-user-name">${escapeHtml(userName)}</span>
        </div>
        <button type="button" class="nav-link nav-signout" data-action="sign-out">
            ${icon('logout')}
            <span>${escapeHtml(t('nav.signOut'))}</span>
        </button>`;
}

function applyStaticText() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = t(element.dataset.i18n);
    });
    document.querySelectorAll('[data-shop-name]').forEach(element => {
        element.textContent = state.shopName;
    });
    document.title = state.shopName;
}

function applyLanguage() {
    I18N.apply();
    applyStaticText();
    renderLanguageSwitches();
    if (typeof api.refreshStatus === 'function') api.refreshStatus();
    if (state.signedIn) renderPage({ keepScroll: true });
}

const ADMIN_USER = { role: 'admin', username: ADMIN_USERNAME };

// Returns the signed-in user, or null for a wrong username or password.
async function authenticate(username, password) {
    const isAdminName = username.toLowerCase() === ADMIN_USERNAME;
    const serverMode = Boolean(window.webApi) && typeof api.isLocalDatabase === 'function' && !(await api.isLocalDatabase());
    if (typeof api.login === 'function') {
        const result = await api.login(username, password);
        if (result && typeof result === 'object') {
            return result.role === 'barber'
                ? { role: 'barber', username: result.username, barberId: Number(result.barberId), name: result.name }
                : ADMIN_USER;
        }
        if (result === true) return ADMIN_USER;
        if (serverMode) return null;
    } else if (isAdminName) {
        return password === ADMIN_PASSWORD ? ADMIN_USER : null;
    }
    if (isAdminName) return null;

    // Offline and desktop modes: barber accounts are in the local database.
    const account = await queryOne(
        `SELECT a.username, a.password_hash, a.barber_id, b.name
         FROM barber_accounts a JOIN barbers b ON b.id = a.barber_id
         WHERE a.username = ? COLLATE NOCASE AND a.is_active = 1 AND b.is_active = 1`,
        [username]
    );
    if (!account || !XAuth.verifyPassword(password, account.password_hash)) return null;
    return { role: 'barber', username: account.username, barberId: Number(account.barber_id), name: account.name };
}

async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const button = dom.loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    let user;
    try {
        user = await authenticate(username, password);
        if (!user) {
            toast(t('login.invalid'), 'error');
            return;
        }
    } catch (error) {
        toast(t('login.error', { message: error.message }), 'error');
        return;
    } finally {
        button.disabled = false;
    }

    state.signedIn = true;
    state.user = user;
    state.editUnlockedUntil = 0;
    state.boardDate = todayString();
    if (!allowedPages().includes(state.page)) state.page = 'cashier';
    document.body.dataset.signedIn = 'true';
    document.body.dataset.role = user.role;
    dom.login.hidden = true;
    dom.app.hidden = false;
    document.getElementById('password').value = '';
    await loadShopName();
    await migrateLegacyAppointments();
    await go(state.page);
    startBookingSync();
}

function signOut() {
    state.signedIn = false;
    state.user = null;
    state.editUnlockedUntil = 0;
    stopBookingSync();
    delete document.body.dataset.signedIn;
    delete document.body.dataset.role;
    closeAllModals();
    dom.app.hidden = true;
    dom.login.hidden = false;
    document.getElementById('username').focus();
}

async function loadShopName() {
    try {
        const settings = await queryOne('SELECT shop_name FROM settings ORDER BY id DESC LIMIT 1');
        state.shopName = String(settings?.shop_name || '').trim() || 'XBARBER SHOP';
    } catch (error) {
        console.warn('Could not load shop name:', error);
    }
    applyStaticText();
}

async function go(page) {
    state.page = allowedPages().includes(page) ? page : 'cashier';
    await renderPage();
}

function captureScroll() {
    const board = dom.page.querySelector('[data-scroll-x]');
    const columns = {};
    dom.page.querySelectorAll('[data-scroll-key]').forEach(element => {
        columns[element.dataset.scrollKey] = element.scrollTop;
    });
    return { top: dom.page.scrollTop, left: board ? board.scrollLeft : 0, columns };
}

function restoreScroll(saved) {
    dom.page.scrollTop = saved.top;
    const board = dom.page.querySelector('[data-scroll-x]');
    if (board) board.scrollLeft = saved.left;
    dom.page.querySelectorAll('[data-scroll-key]').forEach(element => {
        const value = saved.columns[element.dataset.scrollKey];
        if (value) element.scrollTop = value;
    });
}

const renderers = {
    cashier: renderCashier,
    dashboard: renderDashboard,
    history: renderHistory,
    catalog: renderCatalog,
    barbers: renderBarbers,
    settings: renderSettings
};

async function renderPage({ keepScroll = false } = {}) {
    if (!state.signedIn) return;
    if (!allowedPages().includes(state.page)) state.page = 'cashier';
    const token = ++state.renderToken;
    const page = state.page;
    renderNav();
    const saved = captureScroll();
    try {
        const view = await renderers[page]();
        if (token !== state.renderToken) return;
        dom.title.textContent = t(`page.${page}.title`);
        dom.subtitle.textContent = t(`page.${page}.subtitle`);
        dom.actions.innerHTML = view.actions || '';
        dom.page.className = `page page-${page}`;
        dom.page.innerHTML = view.body;
        if (keepScroll) restoreScroll(saved);
        else dom.page.scrollTop = 0;
        if (typeof view.after === 'function') view.after();
    } catch (error) {
        if (token !== state.renderToken) return;
        dom.title.textContent = t(`page.${page}.title`);
        dom.subtitle.textContent = '';
        dom.actions.innerHTML = '';
        dom.page.className = `page page-${page}`;
        dom.page.innerHTML = `<div class="empty-state">${icon('alert')}<p>${escapeHtml(t('err.load'))}</p></div>`;
        handleError(error);
    }
}

function segmented(options, current, action, label) {
    return `
        <div class="segmented" role="group" aria-label="${escapeHtml(label)}">
            ${options.map(option => `
                <button type="button" class="${option.value === current ? 'active' : ''}" data-action="${action}" data-value="${option.value}" aria-pressed="${option.value === current}">
                    ${escapeHtml(option.label)}
                </button>`).join('')}
        </div>`;
}

function periodOptions() {
    return [
        { value: 'today', label: t('period.today') },
        { value: 'week', label: t('period.week') },
        { value: 'month', label: t('period.month') },
        { value: 'all', label: t('period.all') }
    ];
}

/* ------------------------------------------------------------------ */
/* Cashier board                                                       */
/* ------------------------------------------------------------------ */

const TICKET_COLUMNS = `
    o.id, o.date, o.time, COALESCE(o.status, 'completed') AS status, o.total, o.payment_method,
    o.barber_id, o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
    (SELECT ob.booking_id FROM online_bookings ob WHERE ob.order_id = o.id LIMIT 1) AS online_id`;

const ITEM_COLUMNS = `
    oi.order_id, oi.item_type, oi.item_id, oi.quantity, oi.price,
    COALESCE(s.name, p.name) AS name, p.image_data`;

const ITEM_JOINS = `
    LEFT JOIN services s ON oi.item_type = 'service' AND s.id = oi.item_id
    LEFT JOIN products p ON oi.item_type = 'product' AND p.id = oi.item_id`;

function buildTickets(tickets, items) {
    const map = new Map();
    tickets.forEach(ticket => {
        map.set(Number(ticket.id), { ...ticket, id: Number(ticket.id), items: [] });
    });
    items.forEach(item => {
        map.get(Number(item.order_id))?.items.push(item);
    });
    return [...map.values()];
}

function sortOpenTickets(tickets) {
    const rank = ticket => (ticket.status === 'in-service' ? 0 : 1);
    return [...tickets].sort((a, b) => rank(a) - rank(b)
        || String(a.time || '99:99').localeCompare(String(b.time || '99:99'))
        || a.id - b.id);
}

async function renderCashier() {
    const date = state.boardDate;
    const today = todayString();
    const mineOnly = isAdmin() ? '' : ' AND (o.barber_id = ? OR o.barber_id IS NULL)';
    const [barbers, ticketRows, itemRows, upcomingRows] = await queryMany([
        { query: 'SELECT id, name, is_active FROM barbers ORDER BY id' },
        {
            query: `SELECT ${TICKET_COLUMNS}
                    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
                    WHERE o.date = ? AND COALESCE(o.status, 'completed') IN ('waiting', 'in-service', 'completed')
                    ORDER BY o.time, o.id`,
            params: [date]
        },
        {
            query: `SELECT ${ITEM_COLUMNS}
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id ${ITEM_JOINS}
                    WHERE o.date = ? AND COALESCE(o.status, 'completed') IN ('waiting', 'in-service', 'completed')
                    ORDER BY oi.id`,
            params: [date]
        },
        {
            // The next day after this one that has online bookings waiting.
            query: `SELECT o.date, COUNT(*) AS count FROM orders o JOIN online_bookings ob ON ob.order_id = o.id
                    WHERE o.status = 'waiting' AND o.date > ?${mineOnly}
                    GROUP BY o.date ORDER BY o.date LIMIT 1`,
            params: isAdmin() ? [date] : [date, myBarberId()]
        }
    ]);

    const tickets = buildTickets(ticketRows, itemRows);
    const upcoming = upcomingRows[0];
    const barberById = new Map(barbers.map(barber => [Number(barber.id), barber]));
    const byBarber = new Map();
    const unassigned = [];
    tickets.forEach(ticket => {
        const barber = ticket.barber_id == null ? null : barberById.get(Number(ticket.barber_id));
        if (!barber) {
            unassigned.push(ticket);
            return;
        }
        const list = byBarber.get(Number(barber.id)) || [];
        list.push(ticket);
        byBarber.set(Number(barber.id), list);
    });

    const columns = [];
    if (unassigned.length) columns.push({ key: 'none', barber: null, tickets: unassigned });
    barbers.forEach(barber => {
        const list = byBarber.get(Number(barber.id)) || [];
        if (Number(barber.is_active) || list.length) columns.push({ key: `b${barber.id}`, barber, tickets: list });
    });
    // A barber sees their own column first.
    if (!isAdmin()) {
        const mine = columns.findIndex(column => column.barber && isMine(column.barber.id));
        if (mine > 0) columns.unshift(...columns.splice(mine, 1));
    }

    // Barbers see their own numbers; the admin sees the whole shop.
    const counted = isAdmin() ? tickets : tickets.filter(ticket => isMine(ticket.barber_id));
    const waiting = counted.filter(ticket => ticket.status === 'waiting').length;
    const active = counted.filter(ticket => ticket.status === 'in-service').length;
    const done = counted.filter(ticket => ticket.status === 'completed');
    const activeBarbers = barbers.filter(barber => Number(barber.is_active));

    const actions = `
        <div class="date-nav">
            <button type="button" class="btn-icon" data-action="board-day" data-step="-1" aria-label="${escapeHtml(t('cashier.prevDay'))}">${icon('chevronLeft', 'flip-rtl')}</button>
            <label class="date-pill">
                ${icon('calendar')}
                <span>${escapeHtml(I18N.formatDate(date, { weekday: true }))}</span>
                <input type="date" value="${date}" data-date-input="board" aria-label="${escapeHtml(t('client.date'))}">
            </label>
            <button type="button" class="btn-icon" data-action="board-day" data-step="1" aria-label="${escapeHtml(t('cashier.nextDay'))}">${icon('chevronRight', 'flip-rtl')}</button>
            ${date !== today ? `<button type="button" class="btn btn-ghost btn-sm" data-action="board-today">${escapeHtml(t('common.today'))}</button>` : ''}
        </div>
        ${upcoming ? `
            <button type="button" class="btn btn-sm upcoming-pill" data-action="board-goto" data-date="${escapeHtml(upcoming.date)}">
                ${icon('globe')}<span>${escapeHtml(t('booking.nextDay', { date: I18N.formatDate(upcoming.date, { weekday: true }), n: Number(upcoming.count) }))}</span>
            </button>` : ''}`;

    if (!activeBarbers.length && !tickets.length && isAdmin()) {
        return {
            actions,
            body: `
                <div class="empty-hero">
                    <span class="empty-hero-icon">${icon('scissors')}</span>
                    <h2>${escapeHtml(t('cashier.noBarbersTitle'))}</h2>
                    <p>${escapeHtml(t('cashier.noBarbersText'))}</p>
                    <form class="inline-form" data-form="add-barber">
                        <input type="text" name="name" maxlength="60" placeholder="${escapeHtml(t('barbers.namePlaceholder'))}" aria-label="${escapeHtml(t('barbers.name'))}" required>
                        <button type="submit" class="btn btn-primary">${icon('plus')}${escapeHtml(t('barbers.add'))}</button>
                    </form>
                </div>`
        };
    }

    const body = `
        <div class="day-strip">
            <div class="day-stat"><span class="status-dot status-dot-waiting"></span><span>${escapeHtml(t('status.waiting'))}</span><strong>${waiting}</strong></div>
            <div class="day-stat"><span class="status-dot status-dot-active"></span><span>${escapeHtml(t('status.in-service'))}</span><strong>${active}</strong></div>
            <div class="day-stat"><span class="status-dot status-dot-done"></span><span>${escapeHtml(t('status.completed'))}</span><strong>${done.length}</strong></div>
            <div class="day-stat day-stat-money"><span>${escapeHtml(t(isAdmin() ? 'cashier.moneyToday' : 'cashier.myMoneyToday'))}</span><strong>${money(sum(done, ticket => ticket.total))}</strong></div>
        </div>
        <div class="board" data-scroll-x>
            ${columns.map(renderColumn).join('')}
            ${isAdmin() ? `
                <button type="button" class="col col-ghost" data-action="add-barber">
                    <span class="col-ghost-icon">${icon('plus')}</span>
                    <span>${escapeHtml(t('cashier.addBarber'))}</span>
                </button>` : ''}
        </div>`;

    return { actions, body };
}

function renderColumn(column) {
    const openTickets = sortOpenTickets(column.tickets.filter(ticket => OPEN_STATUSES.includes(ticket.status)));
    const doneTickets = column.tickets.filter(ticket => ticket.status === 'completed')
        .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')) || b.id - a.id);
    const waiting = openTickets.filter(ticket => ticket.status === 'waiting').length;
    const active = openTickets.length - waiting;
    const removed = column.barber && !Number(column.barber.is_active);
    const name = column.barber ? column.barber.name : t('cashier.anyBarber');
    const mine = column.barber && isMine(column.barber.id);
    // Admin: every column. Barber: only their own column (and taking clients who have no barber).
    const editable = isAdmin() || mine;
    const canAdd = !removed && editable;
    const doneOpen = state.openDone.has(column.key);
    const access = { editable, takeable: !column.barber && myBarberId() != null };

    return `
        <section class="col ${column.barber ? '' : 'col-unassigned'} ${mine ? 'col-mine' : ''} ${editable ? '' : 'col-readonly'}" data-col="${column.key}">
            <header class="col-head">
                <div class="col-id">
                    <span class="avatar ${column.barber ? '' : 'avatar-muted'}">${column.barber ? escapeHtml(initials(name)) : icon('users')}</span>
                    <div class="col-name">
                        <h3>${escapeHtml(name)}</h3>
                        ${mine ? `<span class="tag tag-mine">${escapeHtml(t('cashier.you'))}</span>` : ''}
                        ${removed ? `<span class="tag">${escapeHtml(t('cashier.removedBarber'))}</span>` : ''}
                        ${!column.barber ? `<span class="col-note">${escapeHtml(t('cashier.anyBarberNote'))}</span>` : ''}
                    </div>
                </div>
                ${editable ? `<div class="col-money">${money(sum(doneTickets, ticket => ticket.total))}</div>` : ''}
            </header>
            <div class="col-stats">
                <div><strong>${waiting}</strong><span>${escapeHtml(t('status.waiting'))}</span></div>
                <div><strong>${active}</strong><span>${escapeHtml(t('status.in-service'))}</span></div>
                <div><strong>${doneTickets.length}</strong><span>${escapeHtml(t('status.completed'))}</span></div>
            </div>
            ${canAdd ? `
                <button type="button" class="btn btn-add-client" data-action="new-client" data-barber="${column.barber ? column.barber.id : ''}">
                    ${icon('plus')}<span>${escapeHtml(t('cashier.newClient'))}</span>
                </button>` : ''}
            <div class="col-body" data-scroll-key="${column.key}">
                ${openTickets.map(ticket => renderTicket(ticket, access)).join('') || `<p class="col-empty">${escapeHtml(t('cashier.emptyColumn'))}</p>`}
                ${doneTickets.length && editable ? `
                    <details class="done-group" data-done-key="${column.key}" ${doneOpen ? 'open' : ''}>
                        <summary>${icon('check')}<span>${escapeHtml(t('cashier.finishedList', { n: doneTickets.length }))}</span>${icon('chevronRight', 'summary-chevron')}</summary>
                        <div class="done-list">${doneTickets.map(ticket => renderTicket(ticket, access)).join('')}</div>
                    </details>` : ''}
            </div>
        </section>`;
}

function statusBadge(ticket) {
    if (ticket.status === 'in-service') {
        return `<span class="badge badge-active"><span class="pulse"></span>${escapeHtml(t('status.in-service'))}</span>`;
    }
    if (ticket.status === 'completed') {
        return `<span class="badge badge-done">${icon('check')}${escapeHtml(t('status.completed'))}</span>`;
    }
    return `<span class="badge badge-waiting">${icon('clock')}${escapeHtml(t('status.waiting'))}</span>`;
}

function itemChip(item) {
    const quantity = Number(item.quantity || 1);
    const image = item.item_type === 'product' ? safeImage(item.image_data) : '';
    const thumb = item.item_type === 'product'
        ? `<span class="chip-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : icon('package')}</span>`
        : '';
    return `<span class="chip chip-${item.item_type}">${thumb}<span>${escapeHtml(item.name || t('client.removedItem'))}</span>${quantity > 1 ? `<b>×${quantity}</b>` : ''}</span>`;
}

function renderTicket(ticket, access = { editable: true, takeable: false }) {
    const isDone = ticket.status === 'completed';
    const canEdit = access.editable;
    const services = ticket.items.filter(item => item.item_type === 'service');
    const products = ticket.items.filter(item => item.item_type === 'product');
    const name = String(ticket.customer_name || '').trim() || t('cashier.walkIn');
    const stateClass = ticket.status === 'in-service' ? 'is-active' : isDone ? 'is-done' : 'is-waiting';

    const addChip = (focus, empty) => `
        <button type="button" class="chip chip-add" data-action="edit-client" data-id="${ticket.id}" data-focus="${focus}">
            ${icon('plus')}${empty ? `<span>${escapeHtml(t(focus === 'products' ? 'cashier.addProduct' : 'cashier.addService'))}</span>` : ''}
        </button>`;

    const line = (kind, list) => {
        const label = t(kind === 'products' ? 'client.products' : 'client.services');
        const chips = list.map(itemChip).join('');
        const none = list.length ? '' : `<span class="chip-none">${escapeHtml(t(kind === 'products' ? 'cashier.noProducts' : 'cashier.noServices'))}</span>`;
        const tail = isDone || !canEdit ? none : addChip(kind, !list.length);
        return `
            <div class="ticket-line" title="${escapeHtml(label)}">
                <span class="line-icon" aria-label="${escapeHtml(label)}">${icon(kind === 'products' ? 'bag' : 'scissors')}</span>
                <div class="chips">${chips}${tail}</div>
            </div>`;
    };

    let actions = '';
    const editButton = `<button type="button" class="btn-icon" data-action="edit-client" data-id="${ticket.id}" aria-label="${escapeHtml(t('common.edit'))}" title="${escapeHtml(t('common.edit'))}">${icon('pencil')}</button>`;
    if (ticket.status === 'waiting') {
        if (canEdit || access.takeable) {
            actions = `
                <button type="button" class="btn btn-primary btn-sm" data-action="take-client" data-id="${ticket.id}">${icon('scissors')}<span>${escapeHtml(t('cashier.take'))}</span></button>
                ${canEdit ? editButton : ''}`;
        }
    } else if (ticket.status === 'in-service') {
        if (canEdit) {
            actions = `
                <button type="button" class="btn btn-light btn-sm" data-action="pay-client" data-id="${ticket.id}">${icon('check')}<span>${escapeHtml(t('cashier.finish'))}</span></button>
                <button type="button" class="btn-icon" data-action="back-to-waiting" data-id="${ticket.id}" aria-label="${escapeHtml(t('cashier.backToWaiting'))}" title="${escapeHtml(t('cashier.backToWaiting'))}">${icon('undo')}</button>
                ${editButton}`;
        }
    } else {
        const method = ticket.payment_method === 'card' ? 'card' : ticket.payment_method === 'cash' ? 'cash' : 'other';
        actions = `
            <span class="paid-label">${icon(method === 'card' ? 'card' : 'cash')}${escapeHtml(t(`pay.${method}`))}</span>
            ${canEdit ? `<button type="button" class="btn-icon" data-action="edit-finished" data-id="${ticket.id}" aria-label="${escapeHtml(t('history.editLocked'))}" title="${escapeHtml(t('history.editLocked'))}">${icon('pencil')}</button>` : ''}`;
    }

    return `
        <article class="ticket ${stateClass}" data-ticket="${ticket.id}">
            <div class="ticket-top">
                ${statusBadge(ticket)}
                ${ticket.online_id ? `<span class="badge badge-online" title="${escapeHtml(t('booking.badgeTitle'))}">${icon('globe')}${escapeHtml(t('booking.badge'))}</span>` : ''}
                ${ticket.time ? `<span class="ticket-time">${icon('clock')}${timeLabel(ticket.time)}</span>` : ''}
            </div>
            <div class="ticket-who">
                <strong>${escapeHtml(name)}</strong>
                ${ticket.customer_phone ? `<bdi dir="ltr">${escapeHtml(ticket.customer_phone)}</bdi>` : ''}
            </div>
            ${line('services', services)}
            ${line('products', products)}
            <div class="ticket-foot">
                <strong class="ticket-total">${money(ticket.total)}</strong>
                <div class="ticket-actions">${actions}</div>
            </div>
        </article>`;
}

async function getActiveBarbers() {
    return api.dbQuery('SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY id');
}

function pickBarber(barbers) {
    if (barbers.length === 1) return Promise.resolve(Number(barbers[0].id));
    return new Promise(resolve => {
        let chosen = null;
        const entry = openModal({
            title: t('cashier.whichBarber'),
            size: 'sm',
            body: `<div class="barber-pick">${barbers.map(barber => `
                <button type="button" class="barber-pick-option" data-pick-barber="${barber.id}">
                    <span class="avatar">${escapeHtml(initials(barber.name))}</span><span>${escapeHtml(barber.name)}</span>
                </button>`).join('')}</div>`,
            onClose: () => resolve(chosen)
        });
        entry.modal.addEventListener('click', event => {
            const option = event.target.closest('[data-pick-barber]');
            if (!option) return;
            chosen = Number(option.dataset.pickBarber);
            entry.close();
        });
    });
}

async function takeClient(id) {
    const ticket = await queryOne(
        `SELECT o.id, o.status, o.barber_id, b.is_active AS barber_active
         FROM orders o LEFT JOIN barbers b ON b.id = o.barber_id WHERE o.id = ?`,
        [id]
    );
    if (!ticket || ticket.status !== 'waiting') {
        await renderPage({ keepScroll: true });
        return;
    }
    let barberId = ticket.barber_id != null && Number(ticket.barber_active) ? Number(ticket.barber_id) : null;
    if (!isAdmin()) {
        // A barber takes their own clients, or a client who has no barber (it becomes theirs).
        if (barberId && !isMine(barberId)) {
            denyNotYours();
            await renderPage({ keepScroll: true });
            return;
        }
        barberId = myBarberId();
    } else if (!barberId) {
        const barbers = await getActiveBarbers();
        if (!barbers.length) {
            toast(t('cashier.needBarber'), 'error');
            return;
        }
        barberId = await pickBarber(barbers);
        if (!barberId) return;
    }
    await runStatements([{
        query: "UPDATE orders SET status = 'in-service', barber_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'waiting'",
        params: [barberId, id]
    }]);
    toast(t('toast.taken'));
    await renderPage({ keepScroll: true });
}

async function backToWaiting(id) {
    const ticket = await queryOne('SELECT barber_id FROM orders WHERE id = ?', [id]);
    if (!ticket || !canManageTicket(ticket)) {
        if (ticket) denyNotYours();
        await renderPage({ keepScroll: true });
        return;
    }
    await runStatements([{
        query: "UPDATE orders SET status = 'waiting', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in-service'",
        params: [id]
    }]);
    await renderPage({ keepScroll: true });
}

async function loadTicket(id) {
    const [rows, items] = await queryMany([
        {
            query: `SELECT ${TICKET_COLUMNS}, b.name AS barber_name
                    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
                    LEFT JOIN barbers b ON b.id = o.barber_id WHERE o.id = ?`,
            params: [id]
        },
        {
            query: `SELECT ${ITEM_COLUMNS} FROM order_items oi ${ITEM_JOINS} WHERE oi.order_id = ? ORDER BY oi.id`,
            params: [id]
        }
    ]);
    if (!rows[0]) return null;
    return { ...rows[0], id: Number(rows[0].id), items };
}

// Undoing a payment changes a finished client, so it needs the history edit password.
async function undoPayment(id) {
    const ticket = await loadTicket(id);
    if (!ticket || ticket.status !== 'completed') {
        await renderPage({ keepScroll: true });
        return false;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        return false;
    }
    if (!await requireEditPassword()) return false;
    const ok = await confirmDialog(t('confirm.undoPay'), { okLabel: t('cashier.undoPay') });
    if (!ok) return false;
    const statements = [{ query: 'DELETE FROM payments WHERE order_id = ?', params: [id] }];
    ticket.items.filter(item => item.item_type === 'product').forEach(item => {
        statements.push({
            query: 'UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ?',
            params: [Number(item.quantity || 1), Number(item.item_id)]
        });
    });
    if (ticket.customer_id) {
        statements.push({
            query: `UPDATE customers SET total_visits = MAX(COALESCE(total_visits, 0) - 1, 0),
                    total_spent = MAX(COALESCE(total_spent, 0) - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            params: [Number(ticket.total || 0), Number(ticket.customer_id)]
        });
    }
    const backTo = ticket.barber_id != null ? 'in-service' : 'waiting';
    statements.push({
        query: "UPDATE orders SET status = ?, payment_method = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND COALESCE(status, 'completed') = 'completed'",
        params: [backTo, id]
    });
    await runStatements(statements);
    toast(t('toast.undone'));
    await renderPage({ keepScroll: true });
    return true;
}

/* ------------------------------------------------------------------ */
/* Password for changing finished clients                              */
/* ------------------------------------------------------------------ */

async function getHistoryPasswordHash() {
    const row = await queryOne("SELECT value FROM app_options WHERE key = 'history_password'");
    return row?.value || DEFAULT_HISTORY_PASSWORD_HASH;
}

function editUnlocked() {
    return Date.now() < state.editUnlockedUntil;
}

let relockTimer = null;

function unlockEditing() {
    state.editUnlockedUntil = Date.now() + EDIT_UNLOCK_MS;
    clearTimeout(relockTimer);
    relockTimer = setTimeout(() => {
        if (state.page === 'history' && !modalStack.length) renderPage({ keepScroll: true });
    }, EDIT_UNLOCK_MS + 500);
}

function lockEditing() {
    state.editUnlockedUntil = 0;
    clearTimeout(relockTimer);
}

// Asks for the password, unless it was entered in the last few minutes.
async function requireEditPassword() {
    if (editUnlocked()) {
        unlockEditing();
        return true;
    }
    const stored = await getHistoryPasswordHash();
    return new Promise(resolve => {
        let unlocked = false;
        const entry = openModal({
            title: t('lock.title'),
            size: 'sm',
            autofocus: true,
            body: `
                <form class="stack lock-form" data-lock-form>
                    <div class="lock-hero">${icon('lock')}<p>${escapeHtml(t('lock.text'))}</p></div>
                    <label class="field"><span>${escapeHtml(t('lock.password'))}</span>
                        <input type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="100" data-lock-input>
                    </label>
                    <p class="field-error" data-lock-error hidden>${icon('alert')}<span>${escapeHtml(t('lock.wrong'))}</span></p>
                </form>`,
            footer: `
                <span class="spacer"></span>
                <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                <button type="button" class="btn btn-primary" data-lock-ok>${icon('unlock')}<span>${escapeHtml(t('lock.unlock'))}</span></button>`,
            onClose: () => resolve(unlocked)
        });
        const input = entry.modal.querySelector('[data-lock-input]');
        const error = entry.modal.querySelector('[data-lock-error]');
        const check = () => {
            if (XAuth.verifyPassword(input.value, stored)) {
                unlocked = true;
                unlockEditing();
                entry.close();
                if (state.page === 'history') renderPage({ keepScroll: true });
                return;
            }
            error.hidden = false;
            input.select();
            input.classList.remove('shake');
            void input.offsetWidth;
            input.classList.add('shake');
        };
        entry.modal.querySelector('[data-lock-ok]').addEventListener('click', check);
        entry.modal.querySelector('[data-lock-form]').addEventListener('submit', event => {
            event.preventDefault();
            check();
        });
        input.addEventListener('input', () => {
            error.hidden = true;
        });
    });
}

async function editFinished(id) {
    const ticket = await loadTicket(id);
    if (!ticket || ticket.status !== 'completed') {
        toast(t('client.notEditable'), 'error');
        await renderPage({ keepScroll: true });
        return;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        return;
    }
    if (!await requireEditPassword()) return;
    await openClientModal({ ticketId: id, finished: true });
}

async function saveHistoryPassword(form) {
    const current = form.elements.current.value;
    const next = form.elements.next.value;
    const repeat = form.elements.repeat.value;
    if (!XAuth.verifyPassword(current, await getHistoryPasswordHash())) {
        toast(t('lock.wrongCurrent'), 'error');
        form.elements.current.focus();
        return;
    }
    if (next.length < 4) {
        toast(t('lock.tooShort'), 'error');
        form.elements.next.focus();
        return;
    }
    if (next !== repeat) {
        toast(t('lock.mismatch'), 'error');
        form.elements.repeat.focus();
        return;
    }
    await runStatements([setOption('history_password', XAuth.hashPassword(next))]);
    lockEditing();
    form.reset();
    toast(t('lock.changed'));
}

/* ------------------------------------------------------------------ */
/* Client form (new / edit)                                            */
/* ------------------------------------------------------------------ */

// finished = true edits a paid client (opened from History after the password).
async function openClientModal({ ticketId = null, barberId = null, focus = null, finished = false } = {}) {
    const queries = [
        { query: 'SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name, price, stock, image_data, category_id FROM products WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name FROM categories ORDER BY name' },
        { query: 'SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY id DESC LIMIT 3000' },
        { query: 'SELECT id, name, is_active FROM barbers ORDER BY id' }
    ];
    const [services, products, categories, customers, allBarbers] = await queryMany(queries);
    const ticket = ticketId ? await loadTicket(ticketId) : null;

    const editableStatus = ticket && (finished ? ticket.status === 'completed' : OPEN_STATUSES.includes(ticket.status));
    if (ticketId && !editableStatus) {
        toast(t('client.notEditable'), 'error');
        await renderPage({ keepScroll: true });
        return;
    }
    if (ticket && !canManageTicket(ticket)) {
        denyNotYours();
        await renderPage({ keepScroll: true });
        return;
    }
    // A barber always adds clients to their own column.
    if (!ticket && !isAdmin()) barberId = myBarberId();

    // Active barbers, plus the client's current barber if that barber was removed (finished clients).
    const barbers = allBarbers.filter(barber => Number(barber.is_active)
        || (finished && ticket?.barber_id != null && Number(barber.id) === Number(ticket.barber_id)));

    const draft = {
        id: ticket ? ticket.id : null,
        status: ticket ? ticket.status : 'waiting',
        finished: Boolean(finished && ticket),
        method: ticket?.payment_method === 'card' ? 'card' : 'cash',
        customerId: ticket?.customer_id ? Number(ticket.customer_id) : null,
        services: new Map(),
        products: new Map()
    };

    // Keep items on the visit even if they were later removed from the catalog.
    (ticket?.items || []).forEach(item => {
        const id = Number(item.item_id);
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || 0);
        if (item.item_type === 'service') {
            const existing = draft.services.get(id);
            draft.services.set(id, { price, quantity: (existing?.quantity || 0) + quantity });
            if (!services.some(service => Number(service.id) === id)) {
                services.push({ id, name: item.name || t('client.removedItem'), price, removed: true });
            }
        } else {
            const existing = draft.products.get(id);
            draft.products.set(id, { price, quantity: (existing?.quantity || 0) + quantity });
            if (!products.some(product => Number(product.id) === id)) {
                products.push({ id, name: item.name || t('client.removedItem'), price, stock: null, image_data: item.image_data, removed: true });
            }
        }
    });

    const selectedBarber = ticket
        ? (ticket.barber_id != null && barbers.some(barber => Number(barber.id) === Number(ticket.barber_id)) ? String(ticket.barber_id) : '')
        : (barberId ? String(barberId) : '');
    const dateValue = ticket ? ticket.date : state.boardDate;
    const timeValue = ticket ? String(ticket.time || '').slice(0, 5) : (state.boardDate === todayString() ? nowTime() : '');
    const showProductFilters = products.length > 8 || categories.length > 0;
    const usedCategories = categories.filter(category => products.some(product => Number(product.category_id) === Number(category.id)));

    const serviceChoices = services.length
        ? `<div class="choice-grid">${services.map(service => {
            const selected = draft.services.get(Number(service.id));
            return `
                <button type="button" class="choice ${selected ? 'selected' : ''}" data-svc="${service.id}" aria-pressed="${Boolean(selected)}">
                    <span class="choice-check">${icon('check')}</span>
                    <span class="choice-name">${escapeHtml(service.name)}</span>
                    <span class="choice-price">${money(selected ? selected.price : service.price)}</span>
                </button>`;
        }).join('')}</div>`
        : `<div class="inline-empty">${escapeHtml(t('client.noServices'))} ${isAdmin() ? `<button type="button" class="link" data-goto-catalog="services">${escapeHtml(t('client.openCatalog'))}</button>` : ''}</div>`;

    const productChoices = products.length
        ? `
            ${showProductFilters ? `
                <div class="filter-row">
                    <label class="search-field">${icon('search')}<input type="search" data-product-search placeholder="${escapeHtml(t('client.searchProducts'))}" aria-label="${escapeHtml(t('client.searchProducts'))}"></label>
                    ${usedCategories.length ? `
                        <div class="filter-chips">
                            <button type="button" class="filter-chip active" data-product-filter="all">${escapeHtml(t('catalog.all'))}</button>
                            ${usedCategories.map(category => `<button type="button" class="filter-chip" data-product-filter="${category.id}">${escapeHtml(category.name)}</button>`).join('')}
                        </div>` : ''}
                </div>` : ''}
            <div class="pick-grid">${products.map(product => {
                const selected = draft.products.get(Number(product.id));
                const quantity = selected ? selected.quantity : 0;
                const image = safeImage(product.image_data);
                const stock = product.stock == null ? null : Number(product.stock);
                return `
                    <div class="pick ${quantity ? 'selected' : ''}" data-prod="${product.id}" data-cat="${product.category_id || ''}" data-name="${escapeHtml(String(product.name || '').toLowerCase())}">
                        <button type="button" class="pick-main" data-prod-add="${product.id}">
                            <span class="pick-img">${image ? `<img src="${escapeHtml(image)}" alt="">` : icon('package')}</span>
                            <span class="pick-name">${escapeHtml(product.name || t('catalog.unnamedProduct'))}</span>
                            <span class="pick-price">${money(selected ? selected.price : product.price)}</span>
                            ${stock == null ? '' : `<span class="pick-stock ${stock <= 0 ? 'out' : ''}">${escapeHtml(stock <= 0 ? t('catalog.outOfStock') : t('catalog.inStock', { n: stock }))}</span>`}
                        </button>
                        <div class="pick-qty">
                            <button type="button" data-prod-minus="${product.id}" aria-label="${escapeHtml(t('client.less'))}">${icon('minus')}</button>
                            <span data-qty>${quantity}</span>
                            <button type="button" data-prod-add="${product.id}" aria-label="${escapeHtml(t('client.more'))}">${icon('plus')}</button>
                        </div>
                    </div>`;
            }).join('')}</div>`
        : `<div class="inline-empty">${escapeHtml(t('client.noProducts'))} ${isAdmin() ? `<button type="button" class="link" data-goto-catalog="products">${escapeHtml(t('client.openCatalog'))}</button>` : ''}</div>`;

    const optional = `<em>${escapeHtml(t('common.optional'))}</em>`;
    const barberField = isAdmin()
        ? `<select data-field="barber">
                <option value="">${escapeHtml(t(draft.finished ? 'history.noBarber' : 'cashier.anyBarber'))}</option>
                ${barbers.map(barber => `<option value="${barber.id}" ${String(barber.id) === selectedBarber ? 'selected' : ''}>${escapeHtml(barber.name)}${Number(barber.is_active) ? '' : ` (${escapeHtml(t('cashier.removedBarber'))})`}</option>`).join('')}
           </select>`
        : `<select data-field="barber" disabled>
                ${barbers.filter(barber => isMine(barber.id)).map(barber => `<option value="${barber.id}" selected>${escapeHtml(barber.name)}</option>`).join('')}
           </select>`;
    const paymentSection = draft.finished ? `
            <section class="form-section">
                <h3 class="section-title">${icon('wallet')}${escapeHtml(t('pay.method'))}</h3>
                <div class="segmented segmented-lg" data-finish-method>
                    <button type="button" class="${draft.method === 'cash' ? 'active' : ''}" data-method="cash" aria-pressed="${draft.method === 'cash'}">${icon('cash')}${escapeHtml(t('pay.cash'))}</button>
                    <button type="button" class="${draft.method === 'card' ? 'active' : ''}" data-method="card" aria-pressed="${draft.method === 'card'}">${icon('card')}${escapeHtml(t('pay.card'))}</button>
                </div>
            </section>` : '';
    const body = `
        <div class="client-form">
            ${draft.finished ? `<p class="notice notice-unlocked">${icon('unlock')}<span>${escapeHtml(t('client.finishedNotice'))}</span></p>` : ''}
            <section class="form-section">
                <h3 class="section-title">${icon('user')}${escapeHtml(t('client.who'))}</h3>
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('client.name'))} ${optional}</span>
                        <input type="text" data-field="name" maxlength="80" autocomplete="off" value="${escapeHtml(ticket?.customer_name || '')}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('client.phone'))} ${optional}</span>
                        <input type="tel" data-field="phone" maxlength="30" inputmode="tel" dir="ltr" autocomplete="off" value="${escapeHtml(ticket?.customer_phone || '')}">
                    </label>
                </div>
                <div class="linked-row" data-linked></div>
                <div class="suggestions" data-suggestions></div>
            </section>
            <section class="form-section">
                <h3 class="section-title">${icon('calendar')}${escapeHtml(t('client.when'))}</h3>
                <div class="grid-3">
                    <label class="field"><span>${escapeHtml(t('client.barber'))}</span>
                        ${barberField}
                    </label>
                    <label class="field"><span>${escapeHtml(t('client.date'))} ${optional}</span>
                        <input type="date" data-field="date" value="${escapeHtml(dateValue)}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('client.time'))} ${optional}</span>
                        <input type="time" data-field="time" value="${escapeHtml(timeValue)}">
                    </label>
                </div>
            </section>
            ${paymentSection}
            <section class="form-section" data-section="services">
                <h3 class="section-title">${icon('scissors')}${escapeHtml(t('client.services'))} ${optional}</h3>
                ${serviceChoices}
            </section>
            <section class="form-section" data-section="products">
                <h3 class="section-title">${icon('bag')}${escapeHtml(t('client.products'))} ${optional}</h3>
                ${productChoices}
            </section>
        </div>`;

    const footer = `
        <div class="foot-summary">
            <span>${escapeHtml(t('client.services'))} <b data-sum="services"></b></span>
            <span>${escapeHtml(t('client.products'))} <b data-sum="products"></b></span>
            <span class="foot-total">${escapeHtml(t('client.total'))} <b data-sum="total"></b></span>
        </div>
        <div class="foot-buttons">
            ${draft.finished
                ? `<button type="button" class="btn btn-ghost-danger" data-finished-delete>${icon('trash')}<span>${escapeHtml(t('common.delete'))}</span></button>
                   <button type="button" class="btn btn-ghost" data-finished-reopen>${icon('undo')}<span>${escapeHtml(t('cashier.undoPay'))}</span></button>
                   <span class="spacer"></span>
                   <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                   <button type="button" class="btn btn-primary" data-client-save>${icon('check')}<span>${escapeHtml(t('client.saveChanges'))}</span></button>`
                : draft.id
                ? `<button type="button" class="btn btn-ghost-danger" data-client-remove>${icon('trash')}<span>${escapeHtml(t('client.remove'))}</span></button>
                   <span class="spacer"></span>
                   <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                   <button type="button" class="btn btn-primary" data-client-save>${icon('check')}<span>${escapeHtml(t('client.saveChanges'))}</span></button>`
                : `<button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                   <span class="spacer"></span>
                   <button type="button" class="btn btn-outline" data-client-save="take">${icon('scissors')}<span>${escapeHtml(t('client.saveAndTake'))}</span></button>
                   <button type="button" class="btn btn-primary" data-client-save>${icon('plus')}<span>${escapeHtml(t('client.addClient'))}</span></button>`}
        </div>`;

    const entry = openModal({
        title: draft.finished ? t('client.editFinishedTitle') : draft.id ? t('client.editTitle') : t('client.newTitle'),
        size: 'lg',
        dismissible: false,
        body,
        footer,
        className: 'client-modal'
    });
    const modal = entry.modal;
    const field = name => modal.querySelector(`[data-field="${name}"]`);
    const servicePrice = id => Number(services.find(service => Number(service.id) === id)?.price || 0);
    const productPrice = id => Number(products.find(product => Number(product.id) === id)?.price || 0);

    const updateSummary = () => {
        const servicesTotal = sum([...draft.services.values()], item => item.price * item.quantity);
        const productsTotal = sum([...draft.products.values()], item => item.price * item.quantity);
        modal.querySelector('[data-sum="services"]').innerHTML = money(servicesTotal);
        modal.querySelector('[data-sum="products"]').innerHTML = money(productsTotal);
        modal.querySelector('[data-sum="total"]').innerHTML = money(servicesTotal + productsTotal);
    };

    const renderLinked = () => {
        const container = modal.querySelector('[data-linked]');
        if (!draft.customerId) {
            container.innerHTML = '';
            return;
        }
        const customer = customers.find(item => Number(item.id) === draft.customerId);
        const label = customer ? (customer.name || customer.phone || t('cashier.walkIn')) : (ticket?.customer_name || ticket?.customer_phone || t('cashier.walkIn'));
        container.innerHTML = `
            <span class="linked-pill">${icon('user')}<span>${escapeHtml(t('client.linked', { name: label }))}</span>
                <button type="button" data-unlink aria-label="${escapeHtml(t('client.unlink'))}" title="${escapeHtml(t('client.unlink'))}">${icon('x')}</button>
            </span>`;
    };

    const renderSuggestions = () => {
        const box = modal.querySelector('[data-suggestions]');
        const name = field('name').value.trim().toLowerCase();
        const phone = digits(field('phone').value);
        if (draft.customerId || (name.length < 2 && phone.length < 3)) {
            box.innerHTML = '';
            return;
        }
        const matches = customers.filter(customer =>
            (name.length >= 2 && String(customer.name || '').toLowerCase().includes(name))
            || (phone.length >= 3 && digits(customer.phone).includes(phone))
        ).slice(0, 4);
        box.innerHTML = matches.length ? `
            <span class="suggest-label">${escapeHtml(t('client.savedClients'))}</span>
            ${matches.map(customer => `
                <button type="button" class="suggest" data-pick-customer="${customer.id}">
                    ${icon('user')}<span>${escapeHtml(customer.name || t('cashier.walkIn'))}</span>
                    ${customer.phone ? `<bdi dir="ltr">${escapeHtml(customer.phone)}</bdi>` : ''}
                </button>`).join('')}` : '';
    };

    const updateProductTile = id => {
        const tile = modal.querySelector(`[data-prod="${id}"]`);
        if (!tile) return;
        const quantity = draft.products.get(id)?.quantity || 0;
        tile.classList.toggle('selected', quantity > 0);
        tile.querySelector('[data-qty]').textContent = String(quantity);
    };

    const filterProducts = () => {
        const search = (modal.querySelector('[data-product-search]')?.value || '').trim().toLowerCase();
        const category = modal.querySelector('[data-product-filter].active')?.dataset.productFilter || 'all';
        modal.querySelectorAll('[data-prod]').forEach(tile => {
            const matchesSearch = !search || tile.dataset.name.includes(search);
            const matchesCategory = category === 'all' || tile.dataset.cat === category;
            tile.hidden = !(matchesSearch && matchesCategory);
        });
    };

    let saving = false;
    const setSaving = value => {
        saving = value;
        modal.querySelectorAll('[data-client-save], [data-client-remove], [data-finished-delete], [data-finished-reopen]').forEach(button => {
            button.disabled = value;
        });
    };

    const save = async takeNow => {
        if (saving) return;
        const name = field('name').value.trim();
        const phone = field('phone').value.trim();
        const date = isValidDate(field('date').value) ? field('date').value : (ticket?.date || state.boardDate);
        const time = isValidTime(field('time').value) ? field('time').value.slice(0, 5) : '';
        const barberValue = field('barber').value;
        const chosenBarber = isAdmin() ? (barberValue ? Number(barberValue) : null) : myBarberId();
        if (takeNow && !chosenBarber) {
            toast(t('client.chooseBarberToTake'), 'error');
            field('barber').focus();
            return;
        }

        const items = [
            ...[...draft.services.entries()].map(([id, item]) => ({ type: 'service', id, ...item })),
            ...[...draft.products.entries()].map(([id, item]) => ({ type: 'product', id, ...item }))
        ];
        const total = sum(items, item => item.price * item.quantity);

        setSaving(true);
        try {
            let current = null;
            if (draft.id) {
                current = await loadTicket(draft.id);
                const stillEditable = current && canManageTicket(current)
                    && (draft.finished ? current.status === 'completed' : OPEN_STATUSES.includes(current.status));
                if (!stillEditable) {
                    toast(t('client.notEditable'), 'error');
                    entry.close();
                    await renderPage({ keepScroll: true });
                    return;
                }
            }

            const statements = [];
            let customerRef = null;
            if (draft.customerId) {
                if (name || phone) {
                    statements.push({
                        query: 'UPDATE customers SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        params: [name || null, phone || null, draft.customerId]
                    });
                    customerRef = draft.customerId;
                }
            } else if (name || phone) {
                const phoneDigits = digits(phone);
                const match = phoneDigits
                    ? customers.find(customer => digits(customer.phone) === phoneDigits)
                    : null;
                if (match) {
                    customerRef = Number(match.id);
                    if (name && !String(match.name || '').trim()) {
                        statements.push({
                            query: 'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            params: [name, customerRef]
                        });
                    }
                } else {
                    statements.push({
                        query: 'INSERT INTO customers (name, phone, total_visits, total_spent) VALUES (?, ?, 0, 0)',
                        params: [name || null, phone || null]
                    });
                    customerRef = { lastIDFrom: statements.length - 1 };
                }
            }

            if (draft.finished) {
                const payments = await queryOne('SELECT COUNT(*) AS count FROM payments WHERE order_id = ?', [draft.id]);
                finishedEditStatements(statements, {
                    current,
                    customerRef,
                    items,
                    total,
                    date,
                    time,
                    barberId: chosenBarber,
                    method: draft.method,
                    hasPayment: Number(payments?.count || 0) > 0
                });
            } else {
                let orderRef;
                if (draft.id) {
                    const status = chosenBarber ? draft.status : 'waiting';
                    statements.push({
                        query: 'UPDATE orders SET customer_id = ?, date = ?, time = ?, total = ?, barber_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        params: [customerRef, date, time, total, chosenBarber, status, draft.id]
                    });
                    statements.push({ query: 'DELETE FROM order_items WHERE order_id = ?', params: [draft.id] });
                    orderRef = draft.id;
                } else {
                    statements.push({
                        query: 'INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, ?, 0, ?, NULL, ?)',
                        params: [customerRef, date, time, total, takeNow ? 'in-service' : 'waiting', chosenBarber]
                    });
                    orderRef = { lastIDFrom: statements.length - 1 };
                }
                items.forEach(item => {
                    statements.push({
                        query: 'INSERT INTO order_items (order_id, item_type, item_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
                        params: [orderRef, item.type, item.id, item.quantity, item.price]
                    });
                });
            }

            await runStatements(statements);
            entry.close();
            if (!draft.finished && date !== state.boardDate) state.boardDate = date;
            toast(draft.finished ? t('toast.finishedSaved')
                : draft.id ? t('toast.clientSaved') : (takeNow ? t('toast.clientTaken') : t('toast.clientAdded')));
            if (['cashier', 'history'].includes(state.page)) await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const removeFinished = async () => {
        const ok = await confirmDialog(t('confirm.deleteFinished'), { okLabel: t('common.delete'), danger: true });
        if (!ok) return;
        setSaving(true);
        try {
            const current = await loadTicket(draft.id);
            if (!current || current.status !== 'completed' || !canManageTicket(current)) {
                toast(t('client.notEditable'), 'error');
                entry.close();
                await renderPage({ keepScroll: true });
                return;
            }
            const statements = [];
            current.items.filter(item => item.item_type === 'product').forEach(item => {
                statements.push({
                    query: 'UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ?',
                    params: [Number(item.quantity || 1), Number(item.item_id)]
                });
            });
            if (current.customer_id) {
                statements.push({
                    query: `UPDATE customers SET total_visits = MAX(COALESCE(total_visits, 0) - 1, 0),
                            total_spent = MAX(COALESCE(total_spent, 0) - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    params: [Number(current.total || 0), Number(current.customer_id)]
                });
            }
            statements.push(
                { query: 'DELETE FROM payments WHERE order_id = ?', params: [draft.id] },
                { query: 'DELETE FROM order_items WHERE order_id = ?', params: [draft.id] },
                { query: "DELETE FROM orders WHERE id = ? AND COALESCE(status, 'completed') = 'completed'", params: [draft.id] }
            );
            await runStatements(statements);
            entry.close();
            toast(t('toast.finishedDeleted'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const reopenFinished = async () => {
        setSaving(true);
        try {
            if (await undoPayment(draft.id)) entry.close();
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        const ok = await confirmDialog(t('confirm.removeClient'), { okLabel: t('client.remove'), danger: true });
        if (!ok) return;
        setSaving(true);
        try {
            await runStatements([
                { query: 'DELETE FROM order_items WHERE order_id = ?', params: [draft.id] },
                { query: 'DELETE FROM payments WHERE order_id = ?', params: [draft.id] },
                { query: "DELETE FROM orders WHERE id = ? AND status IN ('waiting', 'in-service')", params: [draft.id] }
            ]);
            entry.close();
            toast(t('toast.clientRemoved'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    modal.addEventListener('click', event => {
        const serviceButton = event.target.closest('[data-svc]');
        if (serviceButton) {
            const id = Number(serviceButton.dataset.svc);
            if (draft.services.has(id)) draft.services.delete(id);
            else draft.services.set(id, { price: servicePrice(id), quantity: 1 });
            const selected = draft.services.has(id);
            serviceButton.classList.toggle('selected', selected);
            serviceButton.setAttribute('aria-pressed', String(selected));
            updateSummary();
            return;
        }
        const addButton = event.target.closest('[data-prod-add]');
        if (addButton) {
            const id = Number(addButton.dataset.prodAdd);
            const current = draft.products.get(id);
            draft.products.set(id, { price: current ? current.price : productPrice(id), quantity: (current?.quantity || 0) + 1 });
            updateProductTile(id);
            updateSummary();
            return;
        }
        const minusButton = event.target.closest('[data-prod-minus]');
        if (minusButton) {
            const id = Number(minusButton.dataset.prodMinus);
            const current = draft.products.get(id);
            if (current) {
                if (current.quantity <= 1) draft.products.delete(id);
                else current.quantity -= 1;
            }
            updateProductTile(id);
            updateSummary();
            return;
        }
        const filterButton = event.target.closest('[data-product-filter]');
        if (filterButton) {
            modal.querySelectorAll('[data-product-filter]').forEach(button => button.classList.toggle('active', button === filterButton));
            filterProducts();
            return;
        }
        const suggestion = event.target.closest('[data-pick-customer]');
        if (suggestion) {
            const customer = customers.find(item => Number(item.id) === Number(suggestion.dataset.pickCustomer));
            if (customer) {
                draft.customerId = Number(customer.id);
                field('name').value = customer.name || '';
                field('phone').value = customer.phone || '';
                renderLinked();
                renderSuggestions();
            }
            return;
        }
        if (event.target.closest('[data-unlink]')) {
            draft.customerId = null;
            field('name').value = '';
            field('phone').value = '';
            renderLinked();
            renderSuggestions();
            field('name').focus();
            return;
        }
        const catalogLink = event.target.closest('[data-goto-catalog]');
        if (catalogLink) {
            state.catalogTab = catalogLink.dataset.gotoCatalog;
            entry.close();
            go('catalog');
            return;
        }
        const methodButton = event.target.closest('[data-finish-method] [data-method]');
        if (methodButton) {
            draft.method = methodButton.dataset.method === 'card' ? 'card' : 'cash';
            modal.querySelectorAll('[data-finish-method] [data-method]').forEach(button => {
                button.classList.toggle('active', button === methodButton);
                button.setAttribute('aria-pressed', String(button === methodButton));
            });
            return;
        }
        const saveButton = event.target.closest('[data-client-save]');
        if (saveButton) {
            save(saveButton.dataset.clientSave === 'take');
            return;
        }
        if (event.target.closest('[data-client-remove]')) remove();
        if (event.target.closest('[data-finished-delete]')) removeFinished();
        if (event.target.closest('[data-finished-reopen]')) reopenFinished();
    });

    modal.addEventListener('input', event => {
        if (event.target.matches('[data-field="name"], [data-field="phone"]')) renderSuggestions();
        if (event.target.matches('[data-product-search]')) filterProducts();
    });

    renderLinked();
    updateSummary();
    if (focus === 'services' || focus === 'products') {
        setTimeout(() => {
            modal.querySelector(`[data-section="${focus}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 80);
    }
}

// Changes to a paid client: its items, product stock (only the difference), customer totals and payment.
function finishedEditStatements(statements, { current, customerRef, items, total, date, time, barberId, method, hasPayment }) {
    const id = current.id;
    const quantities = list => {
        const map = new Map();
        list.forEach(item => map.set(item.id, (map.get(item.id) || 0) + item.quantity));
        return map;
    };
    const before = quantities(current.items
        .filter(item => item.item_type === 'product')
        .map(item => ({ id: Number(item.item_id), quantity: Number(item.quantity || 1) })));
    const after = quantities(items.filter(item => item.type === 'product'));
    new Set([...before.keys(), ...after.keys()]).forEach(productId => {
        const change = (after.get(productId) || 0) - (before.get(productId) || 0);
        if (change > 0) {
            statements.push({ query: 'UPDATE products SET stock = MAX(COALESCE(stock, 0) - ?, 0) WHERE id = ?', params: [change, productId] });
        } else if (change < 0) {
            statements.push({ query: 'UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ?', params: [-change, productId] });
        }
    });

    const oldCustomer = current.customer_id ? Number(current.customer_id) : null;
    const oldTotal = Number(current.total || 0);
    if (oldCustomer && customerRef === oldCustomer) {
        if (total !== oldTotal) {
            statements.push({
                query: 'UPDATE customers SET total_spent = MAX(COALESCE(total_spent, 0) + ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                params: [total - oldTotal, oldCustomer]
            });
        }
    } else {
        if (oldCustomer) {
            statements.push({
                query: `UPDATE customers SET total_visits = MAX(COALESCE(total_visits, 0) - 1, 0),
                        total_spent = MAX(COALESCE(total_spent, 0) - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                params: [oldTotal, oldCustomer]
            });
        }
        if (customerRef != null) {
            statements.push({
                query: `UPDATE customers SET total_visits = COALESCE(total_visits, 0) + 1,
                        total_spent = COALESCE(total_spent, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                params: [total, customerRef]
            });
        }
    }

    statements.push({
        query: `UPDATE orders SET customer_id = ?, date = ?, time = ?, total = ?, barber_id = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND COALESCE(status, 'completed') = 'completed'`,
        params: [customerRef, date, time, total, barberId, method, id]
    });
    statements.push({ query: 'DELETE FROM order_items WHERE order_id = ?', params: [id] });
    items.forEach(item => {
        statements.push({
            query: 'INSERT INTO order_items (order_id, item_type, item_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
            params: [id, item.type, item.id, item.quantity, item.price]
        });
    });

    if (!hasPayment) {
        statements.push({
            query: 'INSERT INTO payments (order_id, amount, method, received_amount, change_amount) VALUES (?, ?, ?, ?, 0)',
            params: [id, total, method, total]
        });
    } else if (method === 'card') {
        statements.push({
            query: "UPDATE payments SET amount = ?, method = 'card', received_amount = ?, change_amount = 0 WHERE order_id = ?",
            params: [total, total, id]
        });
    } else {
        // Keep the cash received when it still covers the new total; otherwise it equals the total.
        statements.push({
            query: `UPDATE payments SET amount = ?, method = 'cash',
                    change_amount = CASE WHEN received_amount IS NOT NULL AND received_amount >= ? THEN received_amount - ? ELSE 0 END,
                    received_amount = CASE WHEN received_amount IS NOT NULL AND received_amount >= ? THEN received_amount ELSE ? END
                    WHERE order_id = ?`,
            params: [total, total, total, total, total, id]
        });
    }
}

/* ------------------------------------------------------------------ */
/* Finish & pay                                                        */
/* ------------------------------------------------------------------ */

async function openPayModal(id) {
    const ticket = await loadTicket(id);
    if (!ticket || !OPEN_STATUSES.includes(ticket.status)) {
        await renderPage({ keepScroll: true });
        return;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        await renderPage({ keepScroll: true });
        return;
    }
    const total = sum(ticket.items, item => Number(item.price) * Number(item.quantity || 1));
    const name = String(ticket.customer_name || '').trim() || t('cashier.walkIn');

    const body = `
        <div class="pay">
            <div class="pay-who">
                <span class="avatar">${escapeHtml(initials(name))}</span>
                <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(ticket.barber_name || t('cashier.anyBarber'))}</span></div>
            </div>
            ${ticket.items.length ? `
                <ul class="pay-items">
                    ${ticket.items.map(item => `
                        <li>
                            <span class="pay-item-icon">${icon(item.item_type === 'product' ? 'bag' : 'scissors')}</span>
                            <span class="pay-item-name">${escapeHtml(item.name || t('client.removedItem'))}${Number(item.quantity) > 1 ? ` <b>×${Number(item.quantity)}</b>` : ''}</span>
                            <span>${money(Number(item.price) * Number(item.quantity || 1))}</span>
                        </li>`).join('')}
                </ul>` : `<p class="inline-empty">${escapeHtml(t('pay.noItems'))}</p>`}
            <div class="pay-edit-row">
                <button type="button" class="btn btn-ghost btn-sm" data-pay-edit>${icon('pencil')}<span>${escapeHtml(t('pay.editItems'))}</span></button>
            </div>
            <div class="pay-total"><span>${escapeHtml(t('client.total'))}</span><strong>${money(total)}</strong></div>
            <div class="field">
                <span>${escapeHtml(t('pay.method'))}</span>
                <div class="segmented segmented-lg" data-pay-method>
                    <button type="button" class="active" data-method="cash" aria-pressed="true">${icon('cash')}${escapeHtml(t('pay.cash'))}</button>
                    <button type="button" data-method="card" aria-pressed="false">${icon('card')}${escapeHtml(t('pay.card'))}</button>
                </div>
            </div>
            <div class="grid-2" data-cash-only>
                <label class="field"><span>${escapeHtml(t('pay.received'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                    <input type="number" min="0" step="any" inputmode="decimal" data-received>
                </label>
                <div class="pay-change"><span>${escapeHtml(t('pay.change'))}</span><strong data-change>${money(0)}</strong></div>
            </div>
        </div>`;

    const entry = openModal({
        title: t('pay.title'),
        size: 'md',
        body,
        footer: `
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary btn-lg" data-pay-confirm>${icon('check')}<span>${escapeHtml(t('pay.confirm'))}</span></button>`
    });
    const modal = entry.modal;
    let method = 'cash';
    const receivedInput = modal.querySelector('[data-received]');

    const updateChange = () => {
        const received = Number(receivedInput.value || 0);
        const change = modal.querySelector('[data-change]');
        const changeBox = modal.querySelector('.pay-change');
        if (receivedInput.value !== '' && received < total) {
            change.innerHTML = `${escapeHtml(t('pay.short'))} ${money(total - received)}`;
            changeBox.classList.add('short');
        } else {
            change.innerHTML = money(Math.max(received - total, 0));
            changeBox.classList.remove('short');
        }
    };

    modal.addEventListener('click', async event => {
        const methodButton = event.target.closest('[data-method]');
        if (methodButton) {
            method = methodButton.dataset.method;
            modal.querySelectorAll('[data-method]').forEach(button => {
                button.classList.toggle('active', button === methodButton);
                button.setAttribute('aria-pressed', String(button === methodButton));
            });
            modal.querySelector('[data-cash-only]').hidden = method !== 'cash';
            return;
        }
        if (event.target.closest('[data-pay-edit]')) {
            entry.close();
            await openClientModal({ ticketId: id });
            return;
        }
        const confirmButton = event.target.closest('[data-pay-confirm]');
        if (!confirmButton || confirmButton.disabled) return;
        confirmButton.disabled = true;
        try {
            const current = await queryOne("SELECT COALESCE(status, 'completed') AS status FROM orders WHERE id = ?", [id]);
            if (!current || !OPEN_STATUSES.includes(current.status)) {
                entry.close();
                await renderPage({ keepScroll: true });
                return;
            }
            const received = method === 'cash' && receivedInput.value !== '' ? Number(receivedInput.value) : total;
            const change = method === 'cash' ? Math.max(received - total, 0) : 0;
            const statements = [
                {
                    query: "UPDATE orders SET status = 'completed', payment_method = ?, total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    params: [method, total, id]
                },
                {
                    query: 'INSERT INTO payments (order_id, amount, method, received_amount, change_amount) VALUES (?, ?, ?, ?, ?)',
                    params: [id, total, method, received, change]
                }
            ];
            ticket.items.filter(item => item.item_type === 'product').forEach(item => {
                statements.push({
                    query: 'UPDATE products SET stock = MAX(COALESCE(stock, 0) - ?, 0) WHERE id = ?',
                    params: [Number(item.quantity || 1), Number(item.item_id)]
                });
            });
            if (ticket.customer_id) {
                statements.push({
                    query: `UPDATE customers SET total_visits = COALESCE(total_visits, 0) + 1,
                            total_spent = COALESCE(total_spent, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    params: [total, Number(ticket.customer_id)]
                });
            }
            await runStatements(statements);
            entry.close();
            toast(t('toast.paid', { amount: moneyText(total) }));
            await renderPage({ keepScroll: true });
        } catch (error) {
            confirmButton.disabled = false;
            handleError(error);
        }
    });
    receivedInput.addEventListener('input', updateChange);
    updateChange();
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

async function renderDashboard() {
    const { start, end } = periodRange(state.dashPeriod);
    const completed = "COALESCE(o.status, 'completed') = 'completed' AND o.date BETWEEN ? AND ?";
    const [summaryRows, openRows, splitRows, barberRows, topProducts, topServices] = await queryMany([
        { query: `SELECT COUNT(*) AS clients, COALESCE(SUM(o.total), 0) AS money FROM orders o WHERE ${completed}`, params: [start, end] },
        { query: "SELECT COUNT(*) AS total FROM orders o WHERE o.status IN ('waiting', 'in-service') AND o.date BETWEEN ? AND ?", params: [start, end] },
        {
            query: `SELECT oi.item_type, COALESCE(SUM(oi.price * oi.quantity), 0) AS money, COALESCE(SUM(oi.quantity), 0) AS quantity
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${completed} GROUP BY oi.item_type`,
            params: [start, end]
        },
        {
            query: `SELECT o.barber_id, b.name AS barber_name, COUNT(*) AS clients, COALESCE(SUM(o.total), 0) AS money
                    FROM orders o LEFT JOIN barbers b ON b.id = o.barber_id WHERE ${completed}
                    GROUP BY o.barber_id ORDER BY money DESC`,
            params: [start, end]
        },
        {
            query: `SELECT oi.item_id, p.name, p.image_data, SUM(oi.quantity) AS quantity, SUM(oi.price * oi.quantity) AS money
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.item_id
                    WHERE oi.item_type = 'product' AND ${completed}
                    GROUP BY oi.item_id ORDER BY quantity DESC, money DESC LIMIT 5`,
            params: [start, end]
        },
        {
            query: `SELECT oi.item_id, s.name, SUM(oi.quantity) AS quantity, SUM(oi.price * oi.quantity) AS money
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN services s ON s.id = oi.item_id
                    WHERE oi.item_type = 'service' AND ${completed}
                    GROUP BY oi.item_id ORDER BY quantity DESC, money DESC LIMIT 5`,
            params: [start, end]
        }
    ]);

    const clients = Number(summaryRows[0]?.clients || 0);
    const total = Number(summaryRows[0]?.money || 0);
    const open = Number(openRows[0]?.total || 0);
    const servicesRow = splitRows.find(row => row.item_type === 'service') || {};
    const productsRow = splitRows.find(row => row.item_type === 'product') || {};
    const servicesMoney = Number(servicesRow.money || 0);
    const productsMoney = Number(productsRow.money || 0);
    const splitTotal = servicesMoney + productsMoney;
    const share = value => (splitTotal ? Math.round((value / splitTotal) * 100) : 0);

    const actions = segmented(periodOptions(), state.dashPeriod, 'dash-period', t('dash.period'));

    const kpis = `
        <div class="kpis">
            <article class="kpi">
                <div class="kpi-label">${icon('users')}<span>${escapeHtml(t('dash.clientsDone'))}</span></div>
                <div class="kpi-value">${escapeHtml(I18N.formatNumber(clients))}</div>
                <div class="kpi-sub">${escapeHtml(t('dash.stillWaiting', { n: open }))}</div>
            </article>
            <article class="kpi kpi-hero">
                <div class="kpi-label">${icon('wallet')}<span>${escapeHtml(t('dash.totalMoney'))}</span></div>
                <div class="kpi-value">${money(total)}</div>
                <div class="kpi-sub">${escapeHtml(t('dash.totalMoneySub'))}</div>
            </article>
            <article class="kpi">
                <div class="kpi-label"><span class="swatch swatch-services"></span><span>${escapeHtml(t('dash.servicesMoney'))}</span></div>
                <div class="kpi-value">${money(servicesMoney)}</div>
                <div class="kpi-sub">${escapeHtml(t('dash.servicesSub', { n: Number(servicesRow.quantity || 0) }))}</div>
            </article>
            <article class="kpi">
                <div class="kpi-label"><span class="swatch swatch-products"></span><span>${escapeHtml(t('dash.productsMoney'))}</span></div>
                <div class="kpi-value">${money(productsMoney)}</div>
                <div class="kpi-sub">${escapeHtml(t('dash.productsSub', { n: Number(productsRow.quantity || 0) }))}</div>
            </article>
        </div>`;

    const splitCard = `
        <article class="card">
            <h3 class="card-title">${escapeHtml(t('dash.split'))}</h3>
            ${splitTotal ? `
                <div class="segbar" role="img" aria-label="${escapeHtml(`${t('client.services')} ${share(servicesMoney)}%, ${t('client.products')} ${share(productsMoney)}%`)}">
                    ${servicesMoney ? `<div class="seg seg-services" style="width:${(servicesMoney / splitTotal) * 100}%" title="${escapeHtml(`${t('client.services')}: ${moneyText(servicesMoney)} (${share(servicesMoney)}%)`)}">${share(servicesMoney) >= 12 ? `<span>${share(servicesMoney)}%</span>` : ''}</div>` : ''}
                    ${productsMoney ? `<div class="seg seg-products" style="width:${(productsMoney / splitTotal) * 100}%" title="${escapeHtml(`${t('client.products')}: ${moneyText(productsMoney)} (${share(productsMoney)}%)`)}">${share(productsMoney) >= 12 ? `<span>${share(productsMoney)}%</span>` : ''}</div>` : ''}
                </div>
                <ul class="legend">
                    <li><span class="swatch swatch-services"></span><span>${escapeHtml(t('client.services'))}</span></li>
                    <li><span class="swatch swatch-products"></span><span>${escapeHtml(t('client.products'))}</span></li>
                </ul>` : `<p class="card-empty">${escapeHtml(t('dash.noData'))}</p>`}
        </article>`;

    const maxBarber = Math.max(...barberRows.map(row => Number(row.money || 0)), 0);
    const barberCard = `
        <article class="card">
            <h3 class="card-title">${escapeHtml(t('dash.byBarber'))}</h3>
            ${barberRows.length ? `
                <div class="hbars">
                    ${barberRows.map(row => {
                        const value = Number(row.money || 0);
                        const width = maxBarber ? Math.max((value / maxBarber) * 100, value ? 2 : 0) : 0;
                        const name = row.barber_id == null ? t('history.noBarber') : (row.barber_name || t('history.noBarber'));
                        return `
                            <div class="hbar-row" title="${escapeHtml(`${name}: ${moneyText(value)} · ${t('dash.clientsCount', { n: Number(row.clients) })}`)}">
                                <span class="hbar-name">${escapeHtml(name)}</span>
                                <div class="hbar-track"><div class="hbar" style="width:${width}%"></div></div>
                                <span class="hbar-value">${money(value)}<span class="hbar-sub">${escapeHtml(t('dash.clientsCount', { n: Number(row.clients) }))}</span></span>
                            </div>`;
                    }).join('')}
                </div>` : `<p class="card-empty">${escapeHtml(t('dash.noData'))}</p>`}
        </article>`;

    const rankList = (rows, kind) => rows.length ? `
        <ol class="rank-list">
            ${rows.map((row, index) => {
                const image = kind === 'product' ? safeImage(row.image_data) : '';
                return `
                    <li>
                        <span class="rank-num">${index + 1}</span>
                        <span class="rank-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : icon(kind === 'product' ? 'package' : 'scissors')}</span>
                        <span class="rank-name">${escapeHtml(row.name || t('client.removedItem'))}<small>${escapeHtml(t('dash.timesSold', { n: Number(row.quantity || 0) }))}</small></span>
                        <span class="rank-value">${money(row.money)}</span>
                    </li>`;
            }).join('')}
        </ol>` : `<p class="card-empty">${escapeHtml(t('dash.noData'))}</p>`;

    const body = `
        ${kpis}
        <div class="dash-grid">
            ${splitCard}
            ${barberCard}
            <article class="card">
                <h3 class="card-title">${escapeHtml(t('dash.topServices'))}</h3>
                ${rankList(topServices, 'service')}
            </article>
            <article class="card">
                <h3 class="card-title">${escapeHtml(t('dash.topProducts'))}</h3>
                ${rankList(topProducts, 'product')}
            </article>
        </div>`;

    return { actions, body };
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

async function renderHistory() {
    const period = state.historyPeriod;
    const { start, end } = periodRange(period, state.historyDay);
    // A barber sees only their own column.
    const own = !isAdmin();
    const where = `COALESCE(o.status, 'completed') = 'completed' AND o.date BETWEEN ? AND ?${own ? ' AND o.barber_id = ?' : ''}`;
    const params = own ? [start, end, myBarberId()] : [start, end];
    const limit = 3000;
    const [allBarbers, ticketRows, itemRows] = await queryMany([
        { query: 'SELECT id, name, is_active FROM barbers ORDER BY id' },
        {
            query: `SELECT ${TICKET_COLUMNS} FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
                    WHERE ${where} ORDER BY o.date DESC, o.time DESC, o.id DESC LIMIT ${limit}`,
            params
        },
        {
            query: `SELECT ${ITEM_COLUMNS} FROM order_items oi JOIN orders o ON o.id = oi.order_id ${ITEM_JOINS}
                    WHERE ${where} ORDER BY oi.id`,
            params
        }
    ]);
    const barbers = own ? allBarbers.filter(barber => isMine(barber.id)) : allBarbers;
    const tickets = buildTickets(ticketRows, itemRows.map(item => ({ ...item, image_data: null })));
    const multiDay = start !== end;

    const byKey = new Map();
    tickets.forEach(ticket => {
        const key = ticket.barber_id == null ? 'none' : `b${ticket.barber_id}`;
        const list = byKey.get(key) || [];
        list.push(ticket);
        byKey.set(key, list);
    });

    const knownBarbers = new Set(barbers.map(barber => `b${barber.id}`));
    const columns = [];
    barbers.forEach(barber => {
        const key = `b${barber.id}`;
        const list = byKey.get(key) || [];
        if (Number(barber.is_active) || list.length) columns.push({ key, name: barber.name, removed: !Number(barber.is_active), tickets: list });
    });
    const orphaned = [...byKey.entries()].filter(([key]) => key === 'none' || !knownBarbers.has(key)).flatMap(([, list]) => list);
    if (orphaned.length) columns.push({ key: 'none', name: t('history.noBarber'), noBarber: true, tickets: orphaned });

    const totalMoney = sum(tickets, ticket => ticket.total);
    const actions = `
        ${segmented(periodOptions(), period, 'history-period', t('dash.period'))}
        <label class="date-pill date-pill-sm ${period === 'day' ? 'active' : ''}">
            ${icon('calendar')}<span>${escapeHtml(t('history.pickDay'))}</span>
            <input type="date" value="${escapeHtml(state.historyDay)}" data-date-input="history" aria-label="${escapeHtml(t('history.pickDay'))}">
        </label>
        <button type="button" class="btn btn-ghost btn-sm" data-action="print">${icon('printer')}<span>${escapeHtml(t('history.print'))}</span></button>
        ${editUnlocked() ? `<button type="button" class="btn btn-sm unlock-pill" data-action="lock-editing" title="${escapeHtml(t('history.lockNow'))}">${icon('unlock')}<span>${escapeHtml(t('history.unlocked'))}</span><b>${escapeHtml(t('history.lock'))}</b></button>` : ''}`;

    const itemsText = ticket => {
        const services = ticket.items.filter(item => item.item_type === 'service')
            .map(item => `${item.name || t('client.removedItem')}${Number(item.quantity) > 1 ? ` ×${Number(item.quantity)}` : ''}`);
        const products = ticket.items.filter(item => item.item_type === 'product')
            .map(item => `${item.name || t('client.removedItem')}${Number(item.quantity) > 1 ? ` ×${Number(item.quantity)}` : ''}`);
        return `
            ${services.length ? `<span class="hrow-items">${icon('scissors')}${escapeHtml(services.join(I18N.listSeparator()))}</span>` : ''}
            ${products.length ? `<span class="hrow-items hrow-products">${icon('bag')}${escapeHtml(products.join(I18N.listSeparator()))}</span>` : ''}`;
    };

    const body = `
        <div class="print-header">
            <strong>${escapeHtml(state.shopName)}</strong>
            <span>${escapeHtml(t('page.history.title'))} · ${escapeHtml(periodLabel(period, state.historyDay))}</span>
        </div>
        <div class="day-strip">
            <div class="day-stat"><span>${escapeHtml(periodLabel(period, state.historyDay))}</span></div>
            <div class="day-stat"><span>${escapeHtml(t('dash.clientsDone'))}</span><strong>${escapeHtml(I18N.formatNumber(tickets.length))}</strong></div>
            <div class="day-stat day-stat-money"><span>${escapeHtml(t('dash.totalMoney'))}</span><strong>${money(totalMoney)}</strong></div>
        </div>
        ${ticketRows.length >= limit ? `<p class="notice">${escapeHtml(t('history.limited', { n: limit }))}</p>` : ''}
        ${columns.length ? `
            <div class="board history-board" data-scroll-x>
                ${columns.map(column => {
                    const earned = sum(column.tickets, ticket => ticket.total);
                    return `
                        <section class="col hcol">
                            <header class="col-head">
                                <div class="col-id">
                                    <span class="avatar ${column.noBarber ? 'avatar-muted' : ''}">${column.noBarber ? icon('users') : escapeHtml(initials(column.name))}</span>
                                    <div class="col-name">
                                        <h3>${escapeHtml(column.name)}</h3>
                                        ${column.removed ? `<span class="tag">${escapeHtml(t('cashier.removedBarber'))}</span>` : ''}
                                    </div>
                                </div>
                            </header>
                            <div class="hcol-totals">
                                <div><span>${escapeHtml(t('history.earned'))}</span><strong>${money(earned)}</strong></div>
                                <div><span>${escapeHtml(t('history.clientsFinished'))}</span><strong>${escapeHtml(I18N.formatNumber(column.tickets.length))}</strong></div>
                            </div>
                            <div class="col-body" data-scroll-key="h-${column.key}">
                                ${column.tickets.length ? `
                                    <ol class="hlist">
                                        ${column.tickets.map(ticket => `
                                            <li class="hrow">
                                                <div class="hrow-when">
                                                    ${ticket.time ? `<span>${timeLabel(ticket.time)}</span>` : ''}
                                                    ${multiDay ? `<small>${escapeHtml(I18N.formatDateShort(ticket.date))}</small>` : ''}
                                                </div>
                                                <div class="hrow-main">
                                                    <strong>${escapeHtml(String(ticket.customer_name || '').trim() || t('cashier.walkIn'))}</strong>
                                                    ${ticket.customer_phone ? `<bdi dir="ltr" class="hrow-phone">${escapeHtml(ticket.customer_phone)}</bdi>` : ''}
                                                    ${itemsText(ticket)}
                                                </div>
                                                <div class="hrow-amount">
                                                    ${money(ticket.total)}
                                                    ${canManageTicket(ticket) ? `<button type="button" class="hrow-edit" data-action="edit-finished" data-id="${ticket.id}" title="${escapeHtml(t('history.editLocked'))}">${icon(editUnlocked() ? 'pencil' : 'lock')}<span>${escapeHtml(t('common.edit'))}</span></button>` : ''}
                                                </div>
                                            </li>`).join('')}
                                    </ol>` : `<p class="col-empty">${escapeHtml(t('history.empty'))}</p>`}
                            </div>
                        </section>`;
                }).join('')}
            </div>` : `
            <div class="empty-hero">
                <span class="empty-hero-icon">${icon('history')}</span>
                <h2>${escapeHtml(t('history.noBarbersTitle'))}</h2>
                <p>${escapeHtml(t('history.noBarbersText'))}</p>
                <button type="button" class="btn btn-primary" data-action="go" data-page="barbers">${icon('users')}<span>${escapeHtml(t('nav.barbers'))}</span></button>
            </div>`}`;

    return { actions, body };
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

async function renderCatalog() {
    const [services, products, categories] = await queryMany([
        { query: 'SELECT id, name, price, duration FROM services WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name, price, stock, image_data, category_id, description FROM products WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name FROM categories ORDER BY name' }
    ]);
    const tab = state.catalogTab === 'products' ? 'products' : 'services';
    if (state.productCategory !== 'all' && !categories.some(category => String(category.id) === state.productCategory)) {
        state.productCategory = 'all';
    }

    const actions = `
        <div class="segmented" role="tablist" aria-label="${escapeHtml(t('nav.catalog'))}">
            <button type="button" role="tab" class="${tab === 'services' ? 'active' : ''}" aria-selected="${tab === 'services'}" data-action="catalog-tab" data-value="services">${icon('scissors')}${escapeHtml(t('catalog.services'))} <span class="count">${services.length}</span></button>
            <button type="button" role="tab" class="${tab === 'products' ? 'active' : ''}" aria-selected="${tab === 'products'}" data-action="catalog-tab" data-value="products">${icon('bag')}${escapeHtml(t('catalog.products'))} <span class="count">${products.length}</span></button>
        </div>
        <button type="button" class="btn btn-primary" data-action="${tab === 'services' ? 'add-service' : 'add-product'}">${icon('plus')}<span>${escapeHtml(t(tab === 'services' ? 'catalog.addService' : 'catalog.addProduct'))}</span></button>`;

    let body;
    if (tab === 'services') {
        body = services.length ? `
            <div class="service-grid">
                ${services.map(service => `
                    <button type="button" class="service-card" data-action="edit-service" data-id="${service.id}">
                        <span class="service-icon">${icon('scissors')}</span>
                        <span class="service-name">${escapeHtml(service.name)}</span>
                        <span class="service-price">${money(service.price)}</span>
                        ${Number(service.duration) > 0 ? `<span class="service-duration">${icon('clock')}${escapeHtml(t('catalog.minutes', { n: Number(service.duration) }))}</span>` : ''}
                        <span class="card-edit">${icon('pencil')}</span>
                    </button>`).join('')}
            </div>` : emptyCatalog('services');
    } else {
        const visible = state.productCategory === 'all'
            ? products
            : products.filter(product => String(product.category_id) === state.productCategory);
        body = `
            <div class="filter-chips catalog-filters">
                <button type="button" class="filter-chip ${state.productCategory === 'all' ? 'active' : ''}" data-action="catalog-category" data-value="all">${escapeHtml(t('catalog.all'))}</button>
                ${categories.map(category => `<button type="button" class="filter-chip ${state.productCategory === String(category.id) ? 'active' : ''}" data-action="catalog-category" data-value="${category.id}">${escapeHtml(category.name)}</button>`).join('')}
                <button type="button" class="filter-chip filter-chip-ghost" data-action="manage-categories">${icon('sliders')}${escapeHtml(t('catalog.manageCategories'))}</button>
            </div>
            ${visible.length ? `
                <div class="product-grid">
                    ${visible.map(product => {
                        const image = safeImage(product.image_data);
                        const stock = Number(product.stock || 0);
                        const category = categories.find(item => Number(item.id) === Number(product.category_id));
                        return `
                            <button type="button" class="product-card" data-action="edit-product" data-id="${product.id}">
                                <span class="product-photo ${image ? '' : 'empty'}">${image ? `<img src="${escapeHtml(image)}" alt="">` : `${icon('image')}<small>${escapeHtml(t('catalog.addPhoto'))}</small>`}</span>
                                <span class="product-body">
                                    <span class="product-name">${escapeHtml(product.name || t('catalog.unnamedProduct'))}</span>
                                    <span class="product-meta">
                                        <span class="product-price">${money(product.price)}</span>
                                        <span class="stock-badge ${stock <= 0 ? 'out' : stock < 5 ? 'low' : ''}">${escapeHtml(stock <= 0 ? t('catalog.outOfStock') : t('catalog.inStock', { n: stock }))}</span>
                                    </span>
                                    ${category ? `<span class="product-category">${icon('tag')}${escapeHtml(category.name)}</span>` : ''}
                                </span>
                            </button>`;
                    }).join('')}
                </div>` : (products.length ? `<p class="card-empty">${escapeHtml(t('catalog.noneInCategory'))}</p>` : emptyCatalog('products'))}`;
    }
    return { actions, body };
}

function emptyCatalog(kind) {
    return `
        <div class="empty-hero">
            <span class="empty-hero-icon">${icon(kind === 'services' ? 'scissors' : 'bag')}</span>
            <h2>${escapeHtml(t(kind === 'services' ? 'catalog.noServicesTitle' : 'catalog.noProductsTitle'))}</h2>
            <p>${escapeHtml(t(kind === 'services' ? 'catalog.noServicesText' : 'catalog.noProductsText'))}</p>
            <button type="button" class="btn btn-primary" data-action="${kind === 'services' ? 'add-service' : 'add-product'}">${icon('plus')}<span>${escapeHtml(t(kind === 'services' ? 'catalog.addService' : 'catalog.addProduct'))}</span></button>
        </div>`;
}

function parsePrice(value) {
    const text = String(value ?? '').trim();
    if (text === '') return null;
    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

async function openServiceModal(id = null) {
    const service = id ? await queryOne('SELECT id, name, price, duration FROM services WHERE id = ?', [id]) : null;
    const entry = openModal({
        title: service ? t('catalog.editService') : t('catalog.addService'),
        size: 'sm',
        autofocus: !service,
        body: `
            <form class="stack" data-service-form>
                <label class="field"><span>${escapeHtml(t('catalog.serviceName'))}</span>
                    <input type="text" name="name" maxlength="80" required value="${escapeHtml(service?.name || '')}" placeholder="${escapeHtml(t('catalog.serviceNamePlaceholder'))}">
                </label>
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('catalog.price'))} (${escapeHtml(I18N.currency())})</span>
                        <input type="number" name="price" min="0" step="any" inputmode="decimal" required value="${service ? escapeHtml(service.price) : ''}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('catalog.duration'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                        <input type="number" name="duration" min="0" step="1" inputmode="numeric" value="${service && Number(service.duration) > 0 ? escapeHtml(service.duration) : ''}">
                    </label>
                </div>
            </form>`,
        footer: `
            ${service ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash')}<span>${escapeHtml(t('common.delete'))}</span></button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" data-save>${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>`
    });
    const form = entry.modal.querySelector('[data-service-form]');
    const save = async () => {
        const name = form.elements.name.value.trim();
        const price = parsePrice(form.elements.price.value);
        const durationText = form.elements.duration.value.trim();
        const duration = durationText === '' ? 0 : Math.round(Number(durationText));
        if (!name || price == null || !Number.isFinite(duration) || duration < 0) {
            toast(t('catalog.needNamePrice'), 'error');
            return;
        }
        try {
            if (service) {
                await api.dbRun('UPDATE services SET name = ?, price = ?, duration = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, price, duration, Number(service.id)]);
            } else {
                await api.dbRun('INSERT INTO services (name, price, duration, is_active) VALUES (?, ?, ?, 1)', [name, price, duration]);
            }
            entry.close();
            toast(t('toast.saved'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    };
    form.addEventListener('submit', event => {
        event.preventDefault();
        save();
    });
    entry.modal.querySelector('[data-save]').addEventListener('click', save);
    entry.modal.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (!await confirmDialog(t('confirm.deleteService'), { okLabel: t('common.delete'), danger: true })) return;
        try {
            await api.dbRun('UPDATE services SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [Number(service.id)]);
            entry.close();
            toast(t('toast.deleted'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    });
}

function readImageFile(file, maxSize = 720) {
    if (!file) return Promise.resolve(null);
    if (!file.type.startsWith('image/')) return Promise.reject(new Error(t('err.imageType')));
    if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error(t('err.imageSize')));

    // Read as a data: URL; the page's security policy does not allow blob: images.
    const readAsDataUrl = () => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error(t('err.imageOpen')));
        reader.readAsDataURL(file);
    });

    return readAsDataUrl().then(source => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) {
                reject(new Error(t('err.imageOpen')));
                return;
            }
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        image.onerror = () => reject(new Error(t('err.imageOpen')));
        image.src = source;
    }));
}

async function openProductModal(id = null) {
    const [rows, categories] = await queryMany([
        { query: 'SELECT id, name, price, stock, description, category_id, image_data FROM products WHERE id = ?', params: [id || 0] },
        { query: 'SELECT id, name FROM categories ORDER BY name' }
    ]);
    const product = id ? rows[0] || null : null;
    let imageData = safeImage(product?.image_data) || null;
    const defaultCategory = !product && state.productCategory !== 'all' ? state.productCategory : String(product?.category_id || '');

    const entry = openModal({
        title: product ? t('catalog.editProduct') : t('catalog.addProduct'),
        size: 'md',
        body: `
            <form class="product-form" data-product-form>
                <div class="photo-picker">
                    <label class="photo-drop" data-photo-drop>
                        <input type="file" accept="image/*" hidden data-photo-input>
                        <span class="photo-preview" data-photo-preview></span>
                    </label>
                    <div class="photo-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-photo-choose>${icon('upload')}<span>${escapeHtml(t('catalog.choosePhoto'))}</span></button>
                        <button type="button" class="btn btn-ghost btn-sm" data-photo-remove>${icon('trash')}<span>${escapeHtml(t('catalog.removePhoto'))}</span></button>
                    </div>
                </div>
                <div class="stack">
                    <label class="field"><span>${escapeHtml(t('catalog.productName'))}</span>
                        <input type="text" name="name" maxlength="80" required value="${escapeHtml(product?.name || '')}" placeholder="${escapeHtml(t('catalog.productNamePlaceholder'))}">
                    </label>
                    <div class="grid-2">
                        <label class="field"><span>${escapeHtml(t('catalog.price'))} (${escapeHtml(I18N.currency())})</span>
                            <input type="number" name="price" min="0" step="any" inputmode="decimal" required value="${product ? escapeHtml(product.price) : ''}">
                        </label>
                        <label class="field"><span>${escapeHtml(t('catalog.stock'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="number" name="stock" min="0" step="1" inputmode="numeric" value="${product ? escapeHtml(product.stock ?? 0) : ''}">
                        </label>
                    </div>
                    <label class="field"><span>${escapeHtml(t('catalog.category'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                        <select name="category">
                            <option value="">${escapeHtml(t('catalog.noCategory'))}</option>
                            ${categories.map(category => `<option value="${category.id}" ${String(category.id) === defaultCategory ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
                        </select>
                    </label>
                    <label class="field"><span>${escapeHtml(t('catalog.description'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                        <textarea name="description" rows="2" maxlength="300">${escapeHtml(product?.description || '')}</textarea>
                    </label>
                </div>
            </form>`,
        footer: `
            ${product ? `<button type="button" class="btn btn-ghost-danger" data-delete>${icon('trash')}<span>${escapeHtml(t('common.delete'))}</span></button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" data-save>${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>`
    });
    const modal = entry.modal;
    const form = modal.querySelector('[data-product-form]');
    const fileInput = modal.querySelector('[data-photo-input]');

    const showPhoto = () => {
        modal.querySelector('[data-photo-preview]').innerHTML = imageData
            ? `<img src="${escapeHtml(imageData)}" alt="">`
            : `${icon('image')}<span>${escapeHtml(t('catalog.tapToAddPhoto'))}</span>`;
        modal.querySelector('[data-photo-drop]').classList.toggle('has-photo', Boolean(imageData));
        modal.querySelector('[data-photo-remove]').hidden = !imageData;
    };
    showPhoto();

    modal.querySelector('[data-photo-choose]').addEventListener('click', () => fileInput.click());
    modal.querySelector('[data-photo-remove]').addEventListener('click', () => {
        imageData = null;
        fileInput.value = '';
        showPhoto();
    });
    fileInput.addEventListener('change', async () => {
        try {
            const result = await readImageFile(fileInput.files?.[0]);
            if (result) imageData = result;
            showPhoto();
        } catch (error) {
            toast(error.message, 'error');
            fileInput.value = '';
        }
    });

    const save = async () => {
        const name = form.elements.name.value.trim();
        const price = parsePrice(form.elements.price.value);
        const stockText = form.elements.stock.value.trim();
        const stock = stockText === '' ? 0 : Number(stockText);
        const categoryId = form.elements.category.value ? Number(form.elements.category.value) : null;
        const description = form.elements.description.value.trim();
        if (!name || price == null || !Number.isInteger(stock) || stock < 0) {
            toast(t('catalog.needNamePrice'), 'error');
            return;
        }
        try {
            if (product) {
                await api.dbRun(
                    'UPDATE products SET name = ?, price = ?, stock = ?, description = ?, category_id = ?, image_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [name, price, stock, description || null, categoryId, imageData, Number(product.id)]
                );
            } else {
                await api.dbRun(
                    'INSERT INTO products (name, price, stock, description, category_id, image_data, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
                    [name, price, stock, description || null, categoryId, imageData]
                );
            }
            entry.close();
            toast(t('toast.saved'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    };
    form.addEventListener('submit', event => {
        event.preventDefault();
        save();
    });
    modal.querySelector('[data-save]').addEventListener('click', save);
    modal.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (!await confirmDialog(t('confirm.deleteProduct'), { okLabel: t('common.delete'), danger: true })) return;
        try {
            await api.dbRun('UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [Number(product.id)]);
            entry.close();
            toast(t('toast.deleted'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    });
}

async function openCategoriesModal() {
    const entry = openModal({
        title: t('catalog.categories'),
        size: 'sm',
        body: `
            <form class="inline-form" data-category-form>
                <input type="text" name="name" maxlength="60" placeholder="${escapeHtml(t('catalog.categoryName'))}" aria-label="${escapeHtml(t('catalog.categoryName'))}" required>
                <button type="submit" class="btn btn-primary">${icon('plus')}<span>${escapeHtml(t('common.add'))}</span></button>
            </form>
            <ul class="category-list" data-category-list></ul>`,
        onClose: () => renderPage({ keepScroll: true })
    });
    const modal = entry.modal;
    const list = modal.querySelector('[data-category-list]');
    const refresh = async () => {
        const categories = await api.dbQuery('SELECT id, name FROM categories ORDER BY name');
        list.innerHTML = categories.length
            ? categories.map(category => `
                <li><span>${icon('tag')}${escapeHtml(category.name)}</span>
                    <button type="button" class="btn-icon" data-delete-category="${category.id}" aria-label="${escapeHtml(t('common.delete'))}">${icon('trash')}</button>
                </li>`).join('')
            : `<li class="muted">${escapeHtml(t('catalog.noCategories'))}</li>`;
    };
    modal.querySelector('[data-category-form]').addEventListener('submit', async event => {
        event.preventDefault();
        const input = event.target.elements.name;
        const name = input.value.trim();
        if (!name) return;
        try {
            await api.dbRun('INSERT INTO categories (name) VALUES (?)', [name]);
            input.value = '';
            await refresh();
        } catch (error) {
            toast(t('catalog.categoryExists'), 'error');
        }
    });
    list.addEventListener('click', async event => {
        const button = event.target.closest('[data-delete-category]');
        if (!button) return;
        if (!await confirmDialog(t('confirm.deleteCategory'), { okLabel: t('common.delete'), danger: true })) return;
        const id = Number(button.dataset.deleteCategory);
        try {
            await runStatements([
                { query: 'UPDATE products SET category_id = NULL WHERE category_id = ?', params: [id] },
                { query: 'DELETE FROM categories WHERE id = ?', params: [id] }
            ]);
            await refresh();
        } catch (error) {
            handleError(error);
        }
    });
    await refresh();
}

/* ------------------------------------------------------------------ */
/* Barbers                                                             */
/* ------------------------------------------------------------------ */

async function renderBarbers() {
    const today = todayString();
    const [barbers, stats, accounts] = await queryMany([
        { query: 'SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY id' },
        {
            query: `SELECT barber_id,
                        SUM(CASE WHEN COALESCE(status, 'completed') = 'completed' THEN 1 ELSE 0 END) AS done,
                        SUM(CASE WHEN COALESCE(status, 'completed') = 'completed' THEN total ELSE 0 END) AS money,
                        SUM(CASE WHEN status IN ('waiting', 'in-service') THEN 1 ELSE 0 END) AS open
                    FROM orders WHERE date = ? GROUP BY barber_id`,
            params: [today]
        },
        { query: 'SELECT barber_id, username FROM barber_accounts WHERE is_active = 1' }
    ]);
    const statsByBarber = new Map(stats.map(row => [Number(row.barber_id), row]));
    const accountByBarber = new Map(accounts.map(row => [Number(row.barber_id), row]));

    const body = `
        <form class="card add-barber" data-form="add-barber">
            <div class="add-barber-text">
                <h3 class="card-title">${escapeHtml(t('barbers.addTitle'))}</h3>
                <p>${escapeHtml(t('barbers.addText'))}</p>
            </div>
            <div class="inline-form">
                <input type="text" name="name" maxlength="60" placeholder="${escapeHtml(t('barbers.namePlaceholder'))}" aria-label="${escapeHtml(t('barbers.name'))}" required>
                <button type="submit" class="btn btn-primary">${icon('plus')}<span>${escapeHtml(t('barbers.add'))}</span></button>
            </div>
        </form>
        ${barbers.length ? `
            <div class="barber-grid">
                ${barbers.map((barber, index) => {
                    const row = statsByBarber.get(Number(barber.id)) || {};
                    const account = accountByBarber.get(Number(barber.id));
                    return `
                        <article class="barber-card">
                            <div class="barber-card-head">
                                <span class="avatar avatar-lg">${escapeHtml(initials(barber.name))}</span>
                                <div>
                                    <h3>${escapeHtml(barber.name)}</h3>
                                    <span class="muted">${escapeHtml(t('barbers.column', { n: index + 1 }))}</span>
                                </div>
                            </div>
                            <div class="barber-card-stats">
                                <div><strong>${escapeHtml(I18N.formatNumber(Number(row.done || 0)))}</strong><span>${escapeHtml(t('barbers.doneToday'))}</span></div>
                                <div><strong>${escapeHtml(I18N.formatNumber(Number(row.open || 0)))}</strong><span>${escapeHtml(t('barbers.openNow'))}</span></div>
                                <div><strong>${money(row.money || 0)}</strong><span>${escapeHtml(t('barbers.moneyToday'))}</span></div>
                            </div>
                            <div class="barber-account ${account ? 'has-account' : ''}">
                                <span class="barber-account-icon">${icon('key')}</span>
                                <div class="barber-account-text">
                                    <strong>${escapeHtml(t(account ? 'accounts.hasSignIn' : 'accounts.noSignIn'))}</strong>
                                    <span>${account ? `${escapeHtml(t('login.username'))}: <bdi dir="ltr">${escapeHtml(account.username)}</bdi>` : escapeHtml(t('accounts.noSignInText'))}</span>
                                </div>
                                <button type="button" class="btn ${account ? 'btn-ghost' : 'btn-outline'} btn-sm" data-action="barber-account" data-id="${barber.id}">${icon(account ? 'pencil' : 'plus')}<span>${escapeHtml(t(account ? 'accounts.change' : 'accounts.create'))}</span></button>
                            </div>
                            <div class="barber-card-actions">
                                <button type="button" class="btn btn-ghost btn-sm" data-action="rename-barber" data-id="${barber.id}" data-name="${escapeHtml(barber.name)}">${icon('pencil')}<span>${escapeHtml(t('barbers.rename'))}</span></button>
                                <button type="button" class="btn btn-ghost-danger btn-sm" data-action="remove-barber" data-id="${barber.id}" data-name="${escapeHtml(barber.name)}">${icon('trash')}<span>${escapeHtml(t('barbers.remove'))}</span></button>
                            </div>
                        </article>`;
                }).join('')}
            </div>` : `<p class="card-empty">${escapeHtml(t('barbers.empty'))}</p>`}`;

    return { actions: '', body };
}

async function addBarber(name) {
    const clean = String(name || '').trim();
    if (!clean) {
        toast(t('barbers.needName'), 'error');
        return false;
    }
    await api.dbRun('INSERT INTO barbers (name, is_active) VALUES (?, 1)', [clean]);
    toast(t('toast.barberAdded', { name: clean }));
    await renderPage({ keepScroll: true });
    return true;
}

async function renameBarber(id, currentName) {
    const name = await promptDialog({ title: t('barbers.rename'), label: t('barbers.name'), value: currentName, maxLength: 60 });
    if (!name) return;
    await api.dbRun('UPDATE barbers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
    toast(t('toast.saved'));
    await renderPage({ keepScroll: true });
}

async function removeBarber(id, name) {
    if (!await confirmDialog(t('confirm.removeBarber', { name }), { okLabel: t('barbers.remove'), danger: true })) return;
    await runStatements([
        { query: "UPDATE orders SET barber_id = NULL, status = 'waiting' WHERE barber_id = ? AND status IN ('waiting', 'in-service')", params: [id] },
        { query: 'UPDATE barbers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', params: [id] },
        { query: 'UPDATE barber_accounts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE barber_id = ?', params: [id] }
    ]);
    toast(t('toast.barberRemoved', { name }));
    await renderPage({ keepScroll: true });
}

// The admin creates a sign-in for a barber. That barber then sees only their own clients.
async function openAccountModal(barberId) {
    const [barberRows, accountRows] = await queryMany([
        { query: 'SELECT id, name FROM barbers WHERE id = ? AND is_active = 1', params: [barberId] },
        { query: 'SELECT barber_id, username, is_active FROM barber_accounts WHERE barber_id = ?', params: [barberId] }
    ]);
    const barber = barberRows[0];
    if (!barber) return;
    const existing = accountRows[0] || null;
    const account = existing && Number(existing.is_active) ? existing : null;

    const entry = openModal({
        title: t('accounts.title', { name: barber.name }),
        size: 'sm',
        autofocus: true,
        body: `
            <form class="stack" data-account-form autocomplete="off">
                <p class="card-text">${escapeHtml(t('accounts.text', { name: barber.name }))}</p>
                <label class="field"><span>${escapeHtml(t('login.username'))}</span>
                    <input type="text" name="username" maxlength="40" dir="ltr" autocapitalize="none" spellcheck="false" autocomplete="off" required value="${escapeHtml(account?.username || '')}">
                </label>
                <label class="field"><span>${escapeHtml(t(account ? 'accounts.newPassword' : 'login.password'))}</span>
                    <input type="text" name="password" maxlength="100" dir="ltr" autocapitalize="none" spellcheck="false" autocomplete="off" ${account ? '' : 'required'}>
                    <small class="field-hint">${escapeHtml(t(account ? 'accounts.keepPassword' : 'accounts.passwordHint'))}</small>
                </label>
            </form>`,
        footer: `
            ${account ? `<button type="button" class="btn btn-ghost-danger" data-account-remove>${icon('trash')}<span>${escapeHtml(t('accounts.remove'))}</span></button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" data-account-save>${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>`
    });
    const modal = entry.modal;
    const form = modal.querySelector('[data-account-form]');

    const save = async () => {
        const username = form.elements.username.value.trim();
        const password = form.elements.password.value;
        if (username.length < 3 || /\s/.test(username)) {
            toast(t('accounts.badUsername'), 'error');
            form.elements.username.focus();
            return;
        }
        if (username.toLowerCase() === ADMIN_USERNAME) {
            toast(t('accounts.adminReserved'), 'error');
            form.elements.username.focus();
            return;
        }
        if ((!account || password) && password.length < 4) {
            toast(t('accounts.shortPassword'), 'error');
            form.elements.password.focus();
            return;
        }
        try {
            const taken = await queryOne(
                'SELECT barber_id FROM barber_accounts WHERE username = ? COLLATE NOCASE AND barber_id <> ?',
                [username, barberId]
            );
            if (taken) {
                toast(t('accounts.usernameTaken'), 'error');
                form.elements.username.focus();
                return;
            }
            let statement;
            if (existing && !password) {
                statement = { query: 'UPDATE barber_accounts SET username = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE barber_id = ?', params: [username, barberId] };
            } else if (existing) {
                statement = { query: 'UPDATE barber_accounts SET username = ?, password_hash = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE barber_id = ?', params: [username, XAuth.hashPassword(password), barberId] };
            } else {
                statement = { query: 'INSERT INTO barber_accounts (barber_id, username, password_hash, is_active) VALUES (?, ?, ?, 1)', params: [barberId, username, XAuth.hashPassword(password)] };
            }
            await runStatements([statement]);
            entry.close();
            toast(t('accounts.saved', { name: barber.name }));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        save();
    });
    modal.querySelector('[data-account-save]').addEventListener('click', save);
    modal.querySelector('[data-account-remove]')?.addEventListener('click', async () => {
        if (!await confirmDialog(t('confirm.removeSignIn', { name: barber.name }), { okLabel: t('accounts.remove'), danger: true })) return;
        try {
            await runStatements([{ query: 'DELETE FROM barber_accounts WHERE barber_id = ?', params: [barberId] }]);
            entry.close();
            toast(t('accounts.removed', { name: barber.name }));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        }
    });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

async function renderSettings() {
    const settings = await queryOne('SELECT shop_name, phone, address FROM settings ORDER BY id DESC LIMIT 1') || {};
    const isLocal = typeof api.isLocalDatabase === 'function' ? await api.isLocalDatabase() : false;
    const current = I18N.getLanguage();
    const booking = await loadBookingOptions();
    const bookingCount = await queryOne("SELECT COUNT(*) AS count FROM online_bookings WHERE order_id IS NOT NULL");

    const body = `
        <div class="settings-grid">
            <section class="card">
                <h3 class="card-title">${icon('globe')}${escapeHtml(t('settings.language'))}</h3>
                <div class="language-options">
                    ${I18N.languages.map(language => `
                        <button type="button" class="language-option ${language.code === current ? 'active' : ''}" data-action="lang" data-lang="${language.code}" aria-pressed="${language.code === current}" lang="${language.code}">
                            <strong>${escapeHtml(language.name)}</strong>
                            <span>${escapeHtml(language.english)}</span>
                            ${language.code === current ? icon('check', 'language-check') : ''}
                        </button>`).join('')}
                </div>
            </section>
            <section class="card">
                <h3 class="card-title">${icon('store')}${escapeHtml(t('settings.shop'))}</h3>
                <form class="stack" data-form="shop">
                    <label class="field"><span>${escapeHtml(t('settings.shopName'))}</span>
                        <input type="text" name="shop_name" maxlength="60" value="${escapeHtml(settings.shop_name || 'XBARBER SHOP')}">
                    </label>
                    <div class="grid-2">
                        <label class="field"><span>${escapeHtml(t('settings.phone'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="tel" name="phone" maxlength="30" dir="ltr" value="${escapeHtml(settings.phone || '')}">
                        </label>
                        <label class="field"><span>${escapeHtml(t('settings.address'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="text" name="address" maxlength="160" value="${escapeHtml(settings.address || '')}">
                        </label>
                    </div>
                    <div><button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button></div>
                </form>
            </section>
            ${renderBookingCard(booking, Number(bookingCount?.count || 0))}
            <section class="card">
                <h3 class="card-title">${icon('lock')}${escapeHtml(t('lock.settingsTitle'))}</h3>
                <p class="card-text">${escapeHtml(t('lock.settingsText'))}</p>
                <form class="stack" data-form="history-password" autocomplete="off">
                    <label class="field"><span>${escapeHtml(t('lock.current'))}</span>
                        <input type="password" name="current" maxlength="100" autocomplete="off" required>
                    </label>
                    <div class="grid-2">
                        <label class="field"><span>${escapeHtml(t('lock.new'))}</span>
                            <input type="password" name="next" maxlength="100" autocomplete="new-password" required>
                        </label>
                        <label class="field"><span>${escapeHtml(t('lock.repeat'))}</span>
                            <input type="password" name="repeat" maxlength="100" autocomplete="new-password" required>
                        </label>
                    </div>
                    <div><button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('lock.change'))}</span></button></div>
                </form>
            </section>
            <section class="card">
                <h3 class="card-title">${icon('database')}${escapeHtml(t('settings.data'))}</h3>
                <p class="card-text">${escapeHtml(t(isLocal ? 'settings.dataLocal' : 'settings.dataShared'))}</p>
                <div class="button-row">
                    <button type="button" class="btn btn-outline" data-action="backup">${icon('download')}<span>${escapeHtml(t('settings.backup'))}</span></button>
                    <button type="button" class="btn btn-outline" data-action="restore">${icon('upload')}<span>${escapeHtml(t('settings.restore'))}</span></button>
                </div>
            </section>
            <section class="card card-danger">
                <h3 class="card-title">${icon('alert')}${escapeHtml(t('settings.clearTitle'))}</h3>
                <p class="card-text">${escapeHtml(t('settings.clearText'))}</p>
                <div class="button-row">
                    <button type="button" class="btn btn-danger" data-action="clear-history">${icon('trash')}<span>${escapeHtml(t('settings.clearButton'))}</span></button>
                    <button type="button" class="btn btn-ghost" data-action="sign-out">${icon('logout')}<span>${escapeHtml(t('nav.signOut'))}</span></button>
                </div>
            </section>
        </div>`;
    return { actions: '', body };
}

async function saveShop(form) {
    const shopName = form.elements.shop_name.value.trim() || 'XBARBER SHOP';
    const phone = form.elements.phone.value.trim();
    const address = form.elements.address.value.trim();
    await api.dbRun(
        "INSERT INTO settings (shop_name, phone, address, currency) VALUES (?, ?, ?, 'IQD')",
        [shopName, phone || null, address || null]
    );
    state.shopName = shopName;
    applyStaticText();
    renderNav();
    toast(t('toast.saved'));
}

async function backupDatabase() {
    if (window.webApi) {
        const isLocal = await api.isLocalDatabase();
        const result = await api.backupDatabase();
        toast(isLocal ? t('settings.backupDownloaded', { file: result }) : t('settings.backupSaved', { file: result }));
        return;
    }
    const path = await promptDialog({ title: t('settings.backup'), label: t('settings.backupPath'), placeholder: 'C:\\backup\\xbarber.db', okLabel: t('settings.backup'), maxLength: 400 });
    if (!path) return;
    await api.backupDatabase(path);
    toast(t('settings.backupSaved', { file: path }));
}

async function restoreDatabase() {
    if (!await confirmDialog(t('confirm.restore'), { okLabel: t('settings.restore'), danger: true })) return;
    if (window.webApi && await api.isLocalDatabase()) {
        const result = await api.restoreDatabase();
        if (result?.canceled) return;
    } else {
        const path = await promptDialog({ title: t('settings.restore'), label: t('settings.restorePath'), placeholder: 'C:\\backup\\xbarber.db', okLabel: t('settings.restore'), maxLength: 400 });
        if (!path) return;
        await api.restoreDatabase(path);
    }
    toast(t('settings.restored'));
    await loadShopName();
    await renderPage();
}

async function clearHistory() {
    if (!await confirmDialog(t('confirm.clearHistory'), { okLabel: t('settings.clearButton'), danger: true })) return;
    const finished = "SELECT id FROM orders WHERE COALESCE(status, 'completed') IN ('completed', 'cancelled')";
    await runStatements([
        // Online bookings keep their last status so the website is not told they were cancelled.
        { query: `UPDATE online_bookings SET status = 'completed', order_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE order_id IN (${finished})`, params: [] },
        { query: `DELETE FROM payments WHERE order_id IN (${finished}) OR order_id NOT IN (SELECT id FROM orders)`, params: [] },
        { query: `DELETE FROM order_items WHERE order_id IN (${finished}) OR order_id NOT IN (SELECT id FROM orders)`, params: [] },
        { query: "DELETE FROM orders WHERE COALESCE(status, 'completed') IN ('completed', 'cancelled')", params: [] },
        { query: "DELETE FROM appointments WHERE date < ? OR COALESCE(status, 'scheduled') IN ('completed', 'cancelled', 'transferred')", params: [todayString()] }
    ]);
    toast(t('settings.cleared'));
}

/* ------------------------------------------------------------------ */
/* Online booking (xoshawi.com)                                        */
/*                                                                     */
/* Every minute while online, the app sends the website its barbers,   */
/* opening hours and taken times, plus status changes of earlier       */
/* bookings. The website answers with new or changed bookings, which   */
/* become waiting clients in the chosen barber's column at the chosen  */
/* time. Full API: docs/ONLINE-BOOKING.md                              */
/* ------------------------------------------------------------------ */

const BOOKING_DOMAIN = 'xoshawi.com';
const BOOKING_DEFAULTS = {
    enabled: '0',
    url: `https://${BOOKING_DOMAIN}`,
    key: '',
    open: '10:00',
    close: '22:00',
    slot: '30',
    days: '14',
    closed: '',
    cursor: '',
    last_sync: '',
    last_error: '',
    last_error_at: ''
};
const BOOKING_SYNC_MS = 60000;
const BOOKING_TIMEOUT_MS = 15000;
const BOOKING_MAX_ROUNDS = 5;
const BOOKING_MAX_PER_REPLY = 200;
let bookingTimer = null;
let bookingSyncRunning = false;

function clampInt(value, min, max, fallback) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function parseWeekdays(value) {
    return [...new Set(String(value || '').split(',').filter(Boolean).map(Number))]
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
        .sort();
}

function formatStamp(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return `${I18N.formatDateShort(toDateString(date))} ${I18N.formatTime(`${pad(date.getHours())}:${pad(date.getMinutes())}`)}`;
}

async function loadBookingOptions() {
    const rows = await api.dbQuery("SELECT key, value FROM app_options WHERE key LIKE 'booking.%'");
    const options = { ...BOOKING_DEFAULTS };
    rows.forEach(row => {
        const name = String(row.key).slice('booking.'.length);
        if (name in options) options[name] = row.value == null ? '' : String(row.value);
    });
    state.booking = options;
    return options;
}

function bookingOptionStatements(values) {
    return Object.entries(values).map(([key, value]) => setOption(`booking.${key}`, value));
}

// Shop data is only sent to the shop's own website (or to this app's own address, for testing).
function bookingEndpoint(url) {
    let parsed;
    try {
        parsed = new URL(String(url || '').trim());
    } catch (error) {
        return null;
    }
    const host = parsed.hostname.toLowerCase();
    const shopSite = parsed.protocol === 'https:' && (host === BOOKING_DOMAIN || host.endsWith(`.${BOOKING_DOMAIN}`));
    if (!shopSite && parsed.origin !== window.location.origin) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}/api/cashier/sync`;
}

// The status the website is told about: received, in-service, completed or cancelled.
function bookingLocalStatus(row) {
    if (row.order_exists == null) return row.status === 'completed' ? 'completed' : 'cancelled';
    if (row.order_status === 'waiting') return 'received';
    if (row.order_status === 'in-service') return 'in-service';
    if (row.order_status === 'completed') return 'completed';
    return 'cancelled';
}

async function buildBookingPayload(options) {
    const today = todayString();
    const daysAhead = clampInt(options.days, 1, 60, 14);
    const [barbers, busyRows, bookingRows, shopRows] = await queryMany([
        { query: 'SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY id' },
        {
            query: `SELECT barber_id, date, time FROM orders
                    WHERE barber_id IS NOT NULL AND date BETWEEN ? AND ? AND time IS NOT NULL AND time <> ''
                      AND COALESCE(status, 'completed') IN ('waiting', 'in-service', 'completed')
                    ORDER BY date, time LIMIT 5000`,
            params: [today, addDays(today, daysAhead)]
        },
        {
            query: `SELECT ob.booking_id, ob.order_id, ob.status, ob.reported_status,
                           o.id AS order_exists, COALESCE(o.status, 'completed') AS order_status
                    FROM online_bookings ob LEFT JOIN orders o ON o.id = ob.order_id
                    WHERE ob.reported_status IS NULL OR ob.reported_status <> ob.status OR ob.date >= ?
                    LIMIT 2000`,
            params: [addDays(today, -60)]
        },
        { query: 'SELECT shop_name, phone, address FROM settings ORDER BY id DESC LIMIT 1' }
    ]);

    const updates = [];
    bookingRows.forEach(row => {
        const status = bookingLocalStatus(row);
        if (status !== row.reported_status) {
            updates.push({ booking_id: String(row.booking_id), status, order_id: row.order_exists == null ? null : Number(row.order_id) });
        }
    });
    const shop = shopRows[0] || {};
    let timezone = 'Asia/Baghdad';
    try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
    } catch (error) {
        // Keep the default.
    }

    return {
        updates,
        payload: {
            version: 1,
            sent_at: new Date().toISOString(),
            cursor: options.cursor || null,
            shop: {
                name: String(shop.shop_name || state.shopName),
                phone: shop.phone || null,
                address: shop.address || null,
                timezone,
                currency: 'IQD'
            },
            hours: {
                open: options.open,
                close: options.close,
                slot_minutes: clampInt(options.slot, 5, 240, 30),
                days_ahead: daysAhead,
                closed_weekdays: parseWeekdays(options.closed)
            },
            barbers: barbers.map(barber => ({ id: Number(barber.id), name: barber.name })),
            busy: busyRows.map(row => ({ barber_id: Number(row.barber_id), date: row.date, time: String(row.time).slice(0, 5) })),
            updates
        }
    };
}

async function postBookingSync(endpoint, key, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BOOKING_TIMEOUT_MS);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                cache: 'no-store',
                credentials: 'omit',
                mode: 'cors',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
        } catch (error) {
            throw new Error(t(error.name === 'AbortError' ? 'booking.timeout' : 'booking.unreachable'));
        }
        if (response.status === 401 || response.status === 403) throw new Error(t('booking.badKey'));
        if (response.status === 404) throw new Error(t('booking.notReady'));
        if (!response.ok) throw new Error(t('booking.httpError', { status: response.status }));
        const data = await response.json().catch(() => null);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(t('booking.badReply'));
        return data;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeBooking(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id ?? '').trim();
    if (!id || id.length > 100) return null;
    const status = raw.status === 'cancelled' ? 'cancelled' : 'booked';
    const date = String(raw.date || '').slice(0, 10);
    const time = String(raw.time || '').slice(0, 5);
    const hasWhen = isValidDate(date) && /^\d{2}:\d{2}$/.test(time);
    if (status === 'booked' && !hasWhen) return null;
    const barber = raw.barber_id === null || raw.barber_id === undefined || raw.barber_id === '' ? null : Number(raw.barber_id);
    return {
        id,
        status,
        barberId: Number.isInteger(barber) ? barber : null,
        name: String(raw.name || '').trim().slice(0, 80),
        phone: String(raw.phone || '').trim().slice(0, 30),
        date: isValidDate(date) ? date : null,
        time: hasWhen ? time : null
    };
}

// Turns website bookings into waiting clients. Returns what changed, for the toast.
async function applyOnlineBookings(rawList) {
    const result = { added: [], changed: 0, cancelled: 0 };
    const latest = new Map();
    rawList.slice(0, BOOKING_MAX_PER_REPLY).map(normalizeBooking).filter(Boolean)
        .forEach(booking => latest.set(booking.id, booking));
    const bookings = [...latest.values()];
    if (!bookings.length) return result;

    const ids = bookings.map(booking => booking.id);
    const [existingRows, customers, barbers] = await queryMany([
        {
            query: `SELECT ob.booking_id, ob.order_id, ob.barber_id, ob.date, ob.time, o.id AS order_exists, o.status AS order_status
                    FROM online_bookings ob LEFT JOIN orders o ON o.id = ob.order_id
                    WHERE ob.booking_id IN (${ids.map(() => '?').join(', ')})`,
            params: ids
        },
        { query: 'SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY id DESC' },
        { query: 'SELECT id, name FROM barbers WHERE is_active = 1' }
    ]);
    const existing = new Map(existingRows.map(row => [String(row.booking_id), row]));
    const barberNames = new Map(barbers.map(barber => [Number(barber.id), barber.name]));
    const customerByPhone = new Map();
    customers.forEach(customer => {
        const key = digits(customer.phone);
        if (key && !customerByPhone.has(key)) customerByPhone.set(key, customer);
    });

    let chunk = [];
    let newCustomers = new Map();
    const newCustomerNames = new Map();
    const flush = async () => {
        if (!chunk.length) return;
        const results = await runStatements(chunk);
        // Customers created in this batch can be reused by later bookings with the same phone.
        newCustomers.forEach((ref, phoneKey) => {
            const created = results[ref.lastIDFrom];
            if (created?.lastID) customerByPhone.set(phoneKey, { id: created.lastID, name: newCustomerNames.get(phoneKey) || '' });
        });
        chunk = [];
        newCustomers = new Map();
    };

    for (const booking of bookings) {
        if (chunk.length > 85) await flush();
        const row = existing.get(booking.id);
        const barberId = booking.barberId != null && barberNames.has(booking.barberId) ? booking.barberId : null;

        if (booking.status === 'cancelled') {
            if (!row) {
                chunk.push({
                    query: `INSERT INTO online_bookings (booking_id, barber_id, customer_name, phone, date, time, status, reported_status)
                            VALUES (?, ?, ?, ?, ?, ?, 'cancelled', 'cancelled')`,
                    params: [booking.id, barberId, booking.name || null, booking.phone || null, booking.date, booking.time]
                });
            } else if (row.order_exists != null && row.order_status === 'waiting') {
                // Only clients who have not started yet are removed.
                chunk.push(
                    { query: 'DELETE FROM order_items WHERE order_id = ?', params: [Number(row.order_id)] },
                    { query: "DELETE FROM orders WHERE id = ? AND status = 'waiting'", params: [Number(row.order_id)] },
                    {
                        query: "UPDATE online_bookings SET status = 'cancelled', reported_status = 'cancelled', order_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?",
                        params: [booking.id]
                    }
                );
                result.cancelled += 1;
            }
            continue;
        }

        if (!row) {
            // The booking row goes first: a booking that is already here fails the batch instead of being added twice.
            chunk.push({
                query: `INSERT INTO online_bookings (booking_id, barber_id, customer_name, phone, date, time, status, reported_status)
                        VALUES (?, ?, ?, ?, ?, ?, 'received', NULL)`,
                params: [booking.id, barberId, booking.name || null, booking.phone || null, booking.date, booking.time]
            });
            let customerRef = null;
            const phoneKey = digits(booking.phone);
            const known = phoneKey ? customerByPhone.get(phoneKey) : null;
            if (known) {
                customerRef = Number(known.id);
                if (booking.name && !String(known.name || '').trim()) {
                    chunk.push({ query: 'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', params: [booking.name, customerRef] });
                }
            } else if (phoneKey && newCustomers.has(phoneKey)) {
                customerRef = newCustomers.get(phoneKey);
            } else if (booking.name || booking.phone) {
                chunk.push({
                    query: 'INSERT INTO customers (name, phone, total_visits, total_spent) VALUES (?, ?, 0, 0)',
                    params: [booking.name || null, booking.phone || null]
                });
                customerRef = { lastIDFrom: chunk.length - 1 };
                if (phoneKey) {
                    newCustomers.set(phoneKey, customerRef);
                    newCustomerNames.set(phoneKey, booking.name);
                }
            }
            chunk.push({
                query: "INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, 0, 0, 'waiting', NULL, ?)",
                params: [customerRef, booking.date, booking.time, barberId]
            });
            chunk.push({
                query: 'UPDATE online_bookings SET order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?',
                params: [{ lastIDFrom: chunk.length - 1 }, booking.id]
            });
            result.added.push({ name: booking.name, barber: barberNames.get(barberId) || '', date: booking.date, time: booking.time });
            continue;
        }

        // Changed on the website: move the client while they are still waiting.
        const moved = row.date !== booking.date
            || String(row.time || '').slice(0, 5) !== booking.time
            || (row.barber_id == null ? null : Number(row.barber_id)) !== barberId;
        if (moved && row.order_exists != null && row.order_status === 'waiting') {
            chunk.push(
                {
                    query: "UPDATE orders SET date = ?, time = ?, barber_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'waiting'",
                    params: [booking.date, booking.time, barberId, Number(row.order_id)]
                },
                {
                    query: 'UPDATE online_bookings SET barber_id = ?, customer_name = ?, phone = ?, date = ?, time = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?',
                    params: [barberId, booking.name || null, booking.phone || null, booking.date, booking.time, booking.id]
                }
            );
            result.changed += 1;
        }
    }
    await flush();
    return result;
}

async function syncOnlineBookings({ manual = false } = {}) {
    if (!state.signedIn || bookingSyncRunning) return null;
    if (!manual && state.booking && state.booking.enabled !== '1') return null;
    bookingSyncRunning = true;
    try {
        const options = await loadBookingOptions();
        if (options.enabled !== '1') {
            if (manual) toast(t('booking.turnOnFirst'), 'error');
            return null;
        }
        const endpoint = bookingEndpoint(options.url);
        if (!endpoint) throw new Error(t('booking.badUrl'));
        if (!navigator.onLine) {
            if (manual) toast(t('booking.offline'), 'error');
            return null;
        }

        const totals = { added: [], changed: 0, cancelled: 0 };
        let cursor = options.cursor;
        for (let round = 0; round < BOOKING_MAX_ROUNDS; round += 1) {
            const { payload, updates } = await buildBookingPayload({ ...options, cursor });
            const reply = await postBookingSync(endpoint, options.key, payload);
            const result = await applyOnlineBookings(Array.isArray(reply.bookings) ? reply.bookings : []);
            totals.added.push(...result.added);
            totals.changed += result.changed;
            totals.cancelled += result.cancelled;
            if (reply.cursor !== undefined) cursor = reply.cursor == null ? '' : String(reply.cursor).slice(0, 500);

            const statements = [
                ...updates.map(update => ({
                    query: 'UPDATE online_bookings SET status = ?, reported_status = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?',
                    params: [update.status, update.status, update.booking_id]
                })),
                ...bookingOptionStatements({ cursor, last_sync: new Date().toISOString(), last_error: '', last_error_at: '' })
            ];
            for (let index = 0; index < statements.length; index += 90) {
                await runStatements(statements.slice(index, index + 90));
            }
            // Ask again right away when the website has more, or to confirm what just arrived.
            if (!reply.has_more && !result.added.length && !result.cancelled && !result.changed) break;
        }
        await loadBookingOptions();
        announceBookings(totals, manual);
        return totals;
    } catch (error) {
        const message = String(error?.message || error).slice(0, 300);
        try {
            await runStatements(bookingOptionStatements({ last_error: message, last_error_at: new Date().toISOString() }));
            await loadBookingOptions();
        } catch (saveError) {
            console.warn('Could not save the online booking status:', saveError);
        }
        if (manual) toast(t('booking.syncFailed', { message }), 'error');
        else console.warn('Online booking sync failed:', message);
        refreshSettingsIfOpen();
        return null;
    } finally {
        bookingSyncRunning = false;
    }
}

function announceBookings(totals, manual) {
    const added = totals.added;
    if (added.length === 1) {
        const booking = added[0];
        toast(t('booking.newOne', {
            name: booking.name || t('cashier.walkIn'),
            barber: booking.barber || t('cashier.anyBarber'),
            when: `${I18N.formatDateShort(booking.date)} ${I18N.formatTime(booking.time)}`
        }));
    } else if (added.length > 1) {
        toast(t('booking.newMany', { n: added.length }));
    } else if (manual) {
        toast(t('booking.upToDate'));
    }
    if ((added.length || totals.changed || totals.cancelled) && !modalStack.length && ['cashier', 'dashboard'].includes(state.page)) {
        renderPage({ keepScroll: true });
    }
    refreshSettingsIfOpen();
}

// Only the status pill is updated, so settings that are being changed are not lost.
function refreshSettingsIfOpen() {
    const pill = state.page === 'settings' ? dom.page.querySelector('.booking-status') : null;
    if (!pill || !state.booking) return;
    const { status, text } = bookingStatusInfo(state.booking);
    pill.dataset.state = status;
    pill.innerHTML = `<span class="status-dot"></span>${escapeHtml(text)}`;
}

function bookingStatusInfo(options) {
    const enabled = options.enabled === '1';
    if (!enabled) return { status: 'off', text: t('booking.statusOff') };
    if (!navigator.onLine) return { status: 'offline', text: t('booking.statusOffline') };
    if (options.last_error) return { status: 'error', text: t('booking.statusError', { message: options.last_error, time: formatStamp(options.last_error_at) }) };
    if (options.last_sync) return { status: 'ok', text: t('booking.statusOk', { time: formatStamp(options.last_sync) }) };
    return { status: 'waiting', text: t('booking.statusWaiting') };
}

function startBookingSync() {
    stopBookingSync();
    bookingTimer = setInterval(() => syncOnlineBookings(), BOOKING_SYNC_MS);
    loadBookingOptions()
        .then(() => syncOnlineBookings())
        .catch(error => console.warn('Could not start online booking:', error));
}

function stopBookingSync() {
    clearInterval(bookingTimer);
    bookingTimer = null;
}

function renderBookingCard(options, received) {
    const enabled = options.enabled === '1';
    const closed = parseWeekdays(options.closed);
    const { status, text: statusText } = bookingStatusInfo(options);
    const slot = clampInt(options.slot, 5, 240, 30);
    const days = clampInt(options.days, 1, 60, 14);
    const slotChoices = [...new Set([15, 20, 30, 45, 60, slot])].sort((a, b) => a - b);
    const dayChoices = [...new Set([7, 14, 30, days])].sort((a, b) => a - b);
    // The week starts on Saturday in Iraq.
    const weekOrder = [6, 0, 1, 2, 3, 4, 5];

    return `
        <section class="card card-wide booking-card">
            <div class="booking-head">
                <h3 class="card-title">${icon('globe')}${escapeHtml(t('booking.title'))}</h3>
                <span class="booking-status" data-state="${status}"><span class="status-dot"></span>${escapeHtml(statusText)}</span>
            </div>
            <p class="card-text">${escapeHtml(t('booking.text', { domain: BOOKING_DOMAIN }))}</p>
            <form class="stack" data-form="booking" autocomplete="off">
                <label class="switch-row">
                    <input type="checkbox" name="enabled" ${enabled ? 'checked' : ''}>
                    <span class="switch" aria-hidden="true"></span>
                    <span class="switch-text"><strong>${escapeHtml(t('booking.enable'))}</strong><small>${escapeHtml(t('booking.enableHint'))}</small></span>
                </label>
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('booking.url'))}</span>
                        <input type="url" name="url" maxlength="200" dir="ltr" spellcheck="false" value="${escapeHtml(options.url || BOOKING_DEFAULTS.url)}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('booking.key'))} <em>${escapeHtml(t('booking.keyHint'))}</em></span>
                        <input type="text" name="key" maxlength="200" dir="ltr" spellcheck="false" autocomplete="off" value="${escapeHtml(options.key)}">
                    </label>
                </div>
                <div class="grid-4">
                    <label class="field"><span>${escapeHtml(t('booking.open'))}</span>
                        <input type="time" name="open" value="${escapeHtml(options.open)}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('booking.close'))}</span>
                        <input type="time" name="close" value="${escapeHtml(options.close)}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('booking.slot'))}</span>
                        <select name="slot">${slotChoices.map(value => `<option value="${value}" ${value === slot ? 'selected' : ''}>${escapeHtml(t('catalog.minutes', { n: value }))}</option>`).join('')}</select>
                    </label>
                    <label class="field"><span>${escapeHtml(t('booking.daysAhead'))}</span>
                        <select name="days">${dayChoices.map(value => `<option value="${value}" ${value === days ? 'selected' : ''}>${escapeHtml(t('booking.days', { n: value }))}</option>`).join('')}</select>
                    </label>
                </div>
                <div class="field">
                    <span>${escapeHtml(t('booking.closedDays'))}</span>
                    <div class="day-checks">
                        ${weekOrder.map(day => `
                            <label class="day-check">
                                <input type="checkbox" name="closed" value="${day}" ${closed.includes(day) ? 'checked' : ''}>
                                <span>${escapeHtml(I18N.weekdayName(day))}</span>
                            </label>`).join('')}
                    </div>
                </div>
                <div class="button-row booking-actions">
                    <button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>
                    <button type="button" class="btn btn-outline" data-action="booking-sync">${icon('refresh')}<span>${escapeHtml(t('booking.syncNow'))}</span></button>
                    <span class="booking-count">${escapeHtml(t('booking.received', { n: received }))}</span>
                </div>
            </form>
        </section>`;
}

async function saveBookingSettings(form, { quiet = false } = {}) {
    const url = form.elements.url.value.trim() || BOOKING_DEFAULTS.url;
    if (!bookingEndpoint(url)) {
        toast(t('booking.badUrl'), 'error');
        form.elements.url.focus();
        return false;
    }
    const open = isValidTime(form.elements.open.value) ? form.elements.open.value.slice(0, 5) : BOOKING_DEFAULTS.open;
    const close = isValidTime(form.elements.close.value) ? form.elements.close.value.slice(0, 5) : BOOKING_DEFAULTS.close;
    if (close <= open) {
        toast(t('booking.badHours'), 'error');
        form.elements.close.focus();
        return false;
    }
    const previous = state.booking || await loadBookingOptions();
    const values = {
        enabled: form.elements.enabled.checked ? '1' : '0',
        url,
        key: form.elements.key.value.trim(),
        open,
        close,
        slot: String(clampInt(form.elements.slot.value, 5, 240, 30)),
        days: String(clampInt(form.elements.days.value, 1, 60, 14)),
        closed: [...form.querySelectorAll('[name="closed"]:checked')].map(input => input.value).join(',')
    };
    // A different website starts from the beginning.
    if (previous.url !== url) values.cursor = '';
    if (values.enabled !== '1' || previous.url !== url || previous.key !== values.key) {
        values.last_error = '';
        values.last_error_at = '';
    }
    await runStatements(bookingOptionStatements(values));
    await loadBookingOptions();
    if (!quiet) toast(t('toast.saved'));
    return true;
}

/* ------------------------------------------------------------------ */
/* One-time move of upcoming appointments from the old design          */
/* ------------------------------------------------------------------ */

async function migrateLegacyAppointments() {
    try {
        const [appointments, services, assignments] = await queryMany([
            {
                query: `SELECT id, customer_id, date, time, service_id, additional_services, status FROM appointments
                        WHERE date >= ? AND COALESCE(status, 'scheduled') IN ('scheduled', 'waiting', 'in-service')
                        ORDER BY date, time LIMIT 500`,
                params: [todayString()]
            },
            { query: 'SELECT id, price FROM services' },
            {
                query: `SELECT cb.customer_id, cb.barber_id FROM customer_barbers cb
                        JOIN barbers b ON b.id = cb.barber_id WHERE b.is_active = 1`
            }
        ]);
        if (!appointments.length) return;

        const priceById = new Map(services.map(service => [Number(service.id), Number(service.price || 0)]));
        const barbersByCustomer = new Map();
        assignments.forEach(row => {
            const list = barbersByCustomer.get(Number(row.customer_id)) || [];
            list.push(Number(row.barber_id));
            barbersByCustomer.set(Number(row.customer_id), list);
        });

        let chunk = [];
        const flush = async () => {
            if (chunk.length) await api.runTransaction(chunk);
            chunk = [];
        };
        for (const appointment of appointments) {
            let extra = [];
            try {
                extra = JSON.parse(appointment.additional_services || '[]');
            } catch (error) {
                extra = [];
            }
            const serviceIds = [appointment.service_id, ...(Array.isArray(extra) ? extra : [])]
                .map(Number)
                .filter((id, index, list) => priceById.has(id) && list.indexOf(id) === index);
            const assigned = barbersByCustomer.get(Number(appointment.customer_id)) || [];
            const barberId = assigned.length === 1 ? assigned[0] : null;
            const status = appointment.status === 'in-service' && barberId ? 'in-service' : 'waiting';
            const total = sum(serviceIds, id => priceById.get(id));

            if (chunk.length + serviceIds.length + 2 > 90) await flush();
            const orderIndex = chunk.length;
            chunk.push({
                query: 'INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, ?, 0, ?, NULL, ?)',
                params: [appointment.customer_id ?? null, appointment.date, String(appointment.time || '').slice(0, 5), total, status, barberId]
            });
            serviceIds.forEach(id => chunk.push({
                query: "INSERT INTO order_items (order_id, item_type, item_id, quantity, price) VALUES (?, 'service', ?, 1, ?)",
                params: [{ lastIDFrom: orderIndex }, id, priceById.get(id)]
            }));
            chunk.push({
                query: "UPDATE appointments SET status = 'transferred', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                params: [Number(appointment.id)]
            });
        }
        await flush();
    } catch (error) {
        console.warn('Could not move old appointments to the cashier board:', error);
    }
}

/* ------------------------------------------------------------------ */
/* Global events                                                       */
/* ------------------------------------------------------------------ */

const actions = {
    go: element => go(element.dataset.page),
    'sign-out': () => signOut(),
    lang: element => {
        I18N.setLanguage(element.dataset.lang);
        applyLanguage();
    },
    'board-day': element => {
        state.boardDate = addDays(state.boardDate, Number(element.dataset.step || 0));
        return renderPage();
    },
    'board-today': () => {
        state.boardDate = todayString();
        return renderPage();
    },
    'board-goto': element => {
        if (isValidDate(element.dataset.date)) state.boardDate = element.dataset.date;
        return renderPage();
    },
    'edit-finished': element => editFinished(Number(element.dataset.id)),
    'lock-editing': () => {
        lockEditing();
        toast(t('history.locked'));
        return renderPage({ keepScroll: true });
    },
    'barber-account': element => openAccountModal(Number(element.dataset.id)),
    'booking-sync': async () => {
        const form = document.querySelector('[data-form="booking"]');
        if (form && !await saveBookingSettings(form, { quiet: true })) return;
        await syncOnlineBookings({ manual: true });
        if (state.page === 'settings' && !modalStack.length) await renderPage({ keepScroll: true });
    },
    'new-client': element => openClientModal({ barberId: element.dataset.barber ? Number(element.dataset.barber) : null }),
    'edit-client': element => openClientModal({ ticketId: Number(element.dataset.id), focus: element.dataset.focus || null }),
    'take-client': element => takeClient(Number(element.dataset.id)),
    'pay-client': element => openPayModal(Number(element.dataset.id)),
    'back-to-waiting': element => backToWaiting(Number(element.dataset.id)),
    'undo-pay': element => undoPayment(Number(element.dataset.id)),
    'add-barber': async () => {
        const name = await promptDialog({ title: t('barbers.addTitle'), label: t('barbers.name'), placeholder: t('barbers.namePlaceholder'), okLabel: t('barbers.add'), maxLength: 60 });
        if (name) await addBarber(name);
    },
    'rename-barber': element => renameBarber(Number(element.dataset.id), element.dataset.name || ''),
    'remove-barber': element => removeBarber(Number(element.dataset.id), element.dataset.name || ''),
    'dash-period': element => {
        state.dashPeriod = element.dataset.value;
        return renderPage();
    },
    'history-period': element => {
        state.historyPeriod = element.dataset.value;
        return renderPage();
    },
    print: () => window.print(),
    'catalog-tab': element => {
        state.catalogTab = element.dataset.value;
        return renderPage();
    },
    'catalog-category': element => {
        state.productCategory = element.dataset.value;
        return renderPage({ keepScroll: true });
    },
    'manage-categories': () => openCategoriesModal(),
    'add-service': () => openServiceModal(),
    'edit-service': element => openServiceModal(Number(element.dataset.id)),
    'add-product': () => openProductModal(),
    'edit-product': element => openProductModal(Number(element.dataset.id)),
    backup: () => backupDatabase(),
    restore: () => restoreDatabase(),
    'clear-history': () => clearHistory()
};

const busyActions = new Set(['take-client', 'back-to-waiting', 'undo-pay', 'pay-client', 'edit-client', 'new-client', 'edit-finished', 'barber-account', 'booking-sync']);

document.addEventListener('click', event => {
    const dateInput = event.target.closest('input[type="date"][data-date-input]');
    if (dateInput && typeof dateInput.showPicker === 'function') {
        try {
            dateInput.showPicker();
        } catch (error) {
            // Some browsers only open the picker from the native control itself.
        }
    }

    const element = event.target.closest('[data-action]');
    if (!element || element.disabled) return;
    const handler = actions[element.dataset.action];
    if (!handler) return;
    event.preventDefault();
    const busy = busyActions.has(element.dataset.action);
    if (busy) element.disabled = true;
    Promise.resolve()
        .then(() => handler(element, event))
        .catch(handleError)
        .finally(() => {
            if (busy && document.contains(element)) element.disabled = false;
        });
});

document.addEventListener('change', event => {
    const input = event.target.closest('[data-date-input]');
    if (!input || !isValidDate(input.value)) return;
    if (input.dataset.dateInput === 'board') {
        state.boardDate = input.value;
    } else if (input.dataset.dateInput === 'history') {
        state.historyDay = input.value;
        state.historyPeriod = 'day';
    }
    renderPage();
});

document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'add-barber') {
        addBarber(form.elements.name.value).catch(handleError);
    } else if (form.dataset.form === 'shop') {
        saveShop(form).catch(handleError);
    } else if (form.dataset.form === 'history-password') {
        saveHistoryPassword(form).catch(handleError);
    } else if (form.dataset.form === 'booking') {
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        saveBookingSettings(form)
            .then(async saved => {
                if (!saved) return;
                if (state.booking?.enabled === '1') await syncOnlineBookings();
                if (state.page === 'settings' && !modalStack.length) await renderPage({ keepScroll: true });
            })
            .catch(handleError)
            .finally(() => {
                if (button && document.contains(button)) button.disabled = false;
            });
    }
});

document.addEventListener('toggle', event => {
    const details = event.target.closest?.('[data-done-key]');
    if (!details) return;
    if (details.open) state.openDone.add(details.dataset.doneKey);
    else state.openDone.delete(details.dataset.doneKey);
}, true);

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !modalStack.length) return;
    // The client form is not closed by Escape so typed details are never lost by accident.
    const top = modalStack[modalStack.length - 1];
    if (top.dismissible) top.close();
});

function autoRefresh() {
    if (!state.signedIn || modalStack.length || document.visibilityState !== 'visible') return;
    if (!['cashier', 'dashboard'].includes(state.page)) return;
    if (document.activeElement && document.activeElement.matches('input, select, textarea')) return;
    renderPage({ keepScroll: true });
}

setInterval(autoRefresh, REFRESH_INTERVAL_MS);
document.addEventListener('visibilitychange', autoRefresh);
// Bookings made while the shop was offline arrive as soon as the internet is back.
window.addEventListener('online', () => syncOnlineBookings());
window.addEventListener('offline', () => refreshSettingsIfOpen());

dom.loginForm.addEventListener('submit', handleLogin);
I18N.apply();
applyStaticText();
renderLanguageSwitches();
