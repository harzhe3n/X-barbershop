'use strict';

/*
 * XBARBER SHOP
 *
 * Pages: Cashier (one column of time slots per barber), Products (product cashier), Dashboard,
 * History, Catalog, Barbers, Settings.
 *
 * A client visit is a row in `orders`:
 *   waiting     -> client added to a time slot, not started
 *   in-service  -> client is with the barber ("Start")
 *   completed   -> finished ("Done", then "Are you sure?")
 * Its services (and products, on older visits) live in `order_items`. When the admin types the
 * money received, the order total is that money instead of the service prices.
 * Products sold on their own, without a client, are in `product_sales` / `product_sale_items`.
 * The Electron app, the local servers and the PWA all share this schema.
 *
 * Who can do what:
 *   admin  (admin / admin123) -> every page, every client, creates barber sign-ins
 *   barber (barber_accounts)  -> Cashier and History; changes only their own clients
 * Finished (paid) clients can only be changed after entering the history edit password.
 *
 * Online: on the shop's server (server.js on a VPS) every device and the booking website share
 * one database. Bookings made on the website appear by themselves. See docs/WEBSITE.md.
 * Time slots are worked out in src/js/slots.js, shared with the website.
 */

const api = window.electronAPI || window.webApi;
if (!api) throw new Error('XBARBER SHOP needs its desktop API or the hosted offline app; do not open it as a file.');

const I18N = window.I18N;
const t = I18N.t;

const XAuth = window.XAuth;
const XSlots = window.XSlots;

const OPEN_STATUSES = ['waiting', 'in-service'];
const ADMIN_PAGES = ['cashier', 'sell', 'expenses', 'dashboard', 'history', 'catalog', 'barbers', 'settings'];
const BARBER_PAGES = ['cashier', 'history'];
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
// Hash of the default password for editing finished clients. The admin can change it in Settings.
const DEFAULT_HISTORY_PASSWORD_HASH = 'sha256i$2000$e5c1d0a94b7f3c2a6d18f0b9$a3be0402ed692e89e332b4cbc0f6e386678ea349fb58a7c0881bb1b69dca4965';
const EDIT_UNLOCK_MS = 5 * 60 * 1000;
const PAGE_ICONS = {
    cashier: 'columns',
    sell: 'bag',
    expenses: 'receipt',
    dashboard: 'chart',
    history: 'history',
    catalog: 'tag',
    barbers: 'users',
    settings: 'sliders'
};
const MAX_TRANSACTION_STATEMENTS = 100;
const REFRESH_INTERVAL_MS = 30000;

const state = {
    signedIn: false,
    // true when the cashier runs online on the shop's server (shared by all devices and the website)
    serverMode: false,
    user: null,
    editUnlockedUntil: 0,
    booking: null,
    page: 'cashier',
    boardDate: todayString(),
    dashPeriod: 'today',
    historyPeriod: 'today',
    expensesPeriod: 'month',
    historyDay: todayString(),
    catalogTab: 'services',
    productCategory: 'all',
    shopName: 'XOSHAWI BARBER',
    // The client form open inside a time slot: { ticketId, barberId, date, time, name, phone, ... }
    slotForm: null,
    // The barber whose "Add slot" box is open on the board.
    addSlot: null,
    showPast: false,
    // Product cashier: product id -> quantity
    cart: new Map(),
    sellMethod: 'cash',
    sellCategory: 'all',
    sellSearch: '',
    focusHours: false,
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
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
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

// The owner signs in as "admin". The password is saved (hashed) in the admins table and can be
// changed in Settings; until it is changed it is admin123.
async function verifyLocalAdmin(password) {
    const row = await queryOne("SELECT password_hash FROM admins WHERE username = 'admin'");
    const stored = String(row?.password_hash || '');
    return stored.startsWith('sha256i$') ? XAuth.verifyPassword(password, stored) : password === ADMIN_PASSWORD;
}

// Returns the signed-in user, or null for a wrong username or password.
async function authenticate(username, password) {
    const isAdminName = username.toLowerCase() === ADMIN_USERNAME;
    if (state.serverMode) {
        // The server checks the owner and barber accounts.
        const result = await api.login(username, password);
        if (!result || typeof result !== 'object') return null;
        return result.role === 'barber'
            ? { role: 'barber', username: result.username, barberId: Number(result.barberId), name: result.name }
            : ADMIN_USER;
    }
    if (isAdminName) return await verifyLocalAdmin(password) ? ADMIN_USER : null;

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
        state.serverMode = Boolean(window.webApi) && typeof api.isLocalDatabase === 'function' && !(await api.isLocalDatabase());
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
    await migrateHoursToMidnight();
    await go(state.page);
    startBookingWatch();
}

function signOut() {
    state.signedIn = false;
    state.user = null;
    state.editUnlockedUntil = 0;
    state.slotForm = null;
    state.cart.clear();
    stopBookingWatch();
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
        const savedName = String(settings?.shop_name || '').trim();
        state.shopName = savedName && savedName.toUpperCase() !== 'XBARBER SHOP' ? savedName : 'XOSHAWI BARBER';
    } catch (error) {
        console.warn('Could not load shop name:', error);
    }
    applyStaticText();
}

async function go(page) {
    state.page = allowedPages().includes(page) ? page : 'cashier';
    state.slotForm = null;
    state.addSlot = null;
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
    sell: renderSell,
    expenses: renderExpenses,
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
        if (typeof view.after === 'function') view.after({ keepScroll });
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

// The money of a visit. When the admin types the money received, only that money counts
// for the services, not their prices. It is saved as the order total (plus any products).
function ticketMoney(ticket) {
    const lineTotal = item => Number(item.price || 0) * Number(item.quantity || 1);
    const services = sum(ticket.items.filter(item => item.item_type === 'service'), lineTotal);
    const products = sum(ticket.items.filter(item => item.item_type === 'product'), lineTotal);
    const servicesMoney = Number(ticket.total || 0) - products;
    const entered = Math.abs(servicesMoney - services) >= 0.01 ? Math.max(servicesMoney, 0) : null;
    return { services, products, entered };
}

/* ------------------------------------------------------------------ */
/* Time slots                                                          */
/* ------------------------------------------------------------------ */

const SLOT_PRESETS = [10, 20, 30];

const {
    toMinutes, fromMinutes, closingMinutes, slotGrid, parseBarberSlots, barberStep,
    offKey, extraKey, skipKey, parseExtraSlots, parseSkippedSlots, daySlots, parseOffDays, clampInt, parseWeekdays,
    parseBarberDays, barberDaysAhead
} = XSlots;

// "Book up to" choices, for the shop and for each barber.
const DAYS_AHEAD_CHOICES = [0, 1, 2, 3, 5, 7, 14, 21, 30, 60];

function daysAheadLabel(value) {
    if (value === 0) return t('booking.daysToday');
    if (value === 1) return t('booking.daysTomorrow');
    return t('booking.days', { n: value });
}

function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
}

// Opening hours and the shop's default time between clients.
function shopHours(options = state.booking || {}) {
    return XSlots.shopHours(options);
}

// Each barber chooses their own time between clients ("slot.barber.<id>").
// Each barber's time between clients and own "Book up to".
const BARBER_SLOT_QUERY = { query: "SELECT key, value FROM app_options WHERE key LIKE 'slot.barber.%' OR key LIKE 'days.barber.%'" };

/* ------------------------------------------------------------------ */
/* Cashier board                                                       */
/* ------------------------------------------------------------------ */

async function renderCashier() {
    const date = state.boardDate;
    const today = todayString();
    const options = await loadBookingOptions();
    const hours = shopHours(options);
    const mineOnly = isAdmin() ? '' : ' AND (o.barber_id = ? OR o.barber_id IS NULL)';
    const [barbers, ticketRows, itemRows, upcomingRows, services, slotRows, offRows, extraRows, onlineRows, skipRows] = await queryMany([
        { query: 'SELECT b.id, b.name, b.is_active, p.thumb_data FROM barbers b LEFT JOIN barber_photos p ON p.barber_id = b.id ORDER BY b.id' },
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
        },
        { query: 'SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name' },
        BARBER_SLOT_QUERY,
        { query: "SELECT key, value FROM app_options WHERE key LIKE ?", params: [`off.%.${date}`] },
        { query: "SELECT key, value FROM app_options WHERE key LIKE ?", params: [`extra.%.${date}`] },
        { query: "SELECT key, value FROM app_options WHERE key LIKE 'online.%'" },
        { query: "SELECT key, value FROM app_options WHERE key LIKE ?", params: [`skip.%.${date}`] }
    ]);
    if (state.addSlot != null && !barbers.some(barber => Number(barber.id) === state.addSlot && Number(barber.is_active))) state.addSlot = null;

    // A form left open on another day is closed.
    if (state.slotForm && state.slotForm.date !== date) state.slotForm = null;
    slotCatalog = services;

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

    const now = nowMinutes();
    const barberSlots = parseBarberSlots(slotRows);
    const barberDays = parseBarberDays(slotRows);
    const offDays = parseOffDays(offRows);
    const extraSlots = parseExtraSlots(extraRows);
    const skippedSlots = parseSkippedSlots(skipRows);
    const offline = offlineBarbers(onlineRows);
    const ctx = {
        date,
        isOnline: barberId => !offline.has(Number(barberId)),
        extraFor: barberId => extraSlots.get(`${Number(barberId)}|${date}`) || [],
        skipFor: barberId => skippedSlots.get(`${Number(barberId)}|${date}`) || [],
        isOff: barberId => offDays.has(`${Number(barberId)}|${date}`),
        today: date === today,
        hours,
        now,
        services,
        barbers: activeBarbers,
        pastFree: 0,
        stepFor: barberId => barberStep(hours, barberSlots, barberId),
        daysFor: barberId => barberDays.get(Number(barberId)),
        // A slot is over once it has ended. On earlier days every slot is over.
        isPast: (minutes, step) => date < today || (date === today && minutes + step <= now)
    };
    const columnsHtml = columns.map(column => renderColumn(column, ctx)).join('');
    // The slot was taken meanwhile (for example by an online booking): the form closes.
    if (state.slotForm && !ctx.formShown) state.slotForm = null;
    const closedDay = hours.closed.includes(parseDate(date).getDay());

    const body = `
        ${renderMyOnlineCard(activeBarbers, ctx)}
        <div class="day-strip">
            <div class="day-stat"><span class="status-dot status-dot-waiting"></span><span>${escapeHtml(t('status.waiting'))}</span><strong>${waiting}</strong></div>
            <div class="day-stat"><span class="status-dot status-dot-active"></span><span>${escapeHtml(t('status.in-service'))}</span><strong>${active}</strong></div>
            <div class="day-stat"><span class="status-dot status-dot-done"></span><span>${escapeHtml(t('status.completed'))}</span><strong>${done.length}</strong></div>
            <div class="day-stat day-stat-money"><span>${escapeHtml(t(isAdmin() ? 'cashier.moneyToday' : 'cashier.myMoneyToday'))}</span><strong>${money(sum(done, ticket => ticket.total))}</strong></div>
        </div>
        ${renderSlotBar(hours, ctx.pastFree)}
        ${closedDay ? `<p class="notice notice-slim">${icon('calendar')}<span>${escapeHtml(t('slots.closedDay'))}</span></p>` : ''}
        <div class="board" data-scroll-x>
            ${columnsHtml}
            ${isAdmin() ? `
                <button type="button" class="col col-ghost" data-action="add-barber">
                    <span class="col-ghost-icon">${icon('plus')}</span>
                    <span>${escapeHtml(t('cashier.addBarber'))}</span>
                </button>` : ''}
        </div>`;

    return { actions, body, after: cashierAfterRender };
}

// Working hours above the board, and the button that shows free times that are already over.
function renderSlotBar(hours, pastFree) {
    const hoursText = t('slots.hours', { open: I18N.formatTime(hours.open), close: closingLabel(hours.close) });
    const pastToggle = pastFree || state.showPast ? `
        <button type="button" class="btn btn-ghost btn-sm slot-past-toggle" data-action="toggle-past" aria-pressed="${state.showPast}">
            ${icon('clock')}
            <span>${escapeHtml(state.showPast ? t('slots.hidePast') : t('slots.showPast', { n: pastFree }))}</span>
        </button>` : '';
    const hoursPart = isAdmin()
        ? `<button type="button" class="btn btn-ghost btn-sm slot-bar-hours" data-action="open-hours" title="${escapeHtml(t('slots.editHours'))}">${icon('calendar')}<span>${escapeHtml(hoursText)}</span></button>`
        : `<span class="slot-bar-label">${icon('calendar')}<strong>${escapeHtml(hoursText)}</strong></span>`;
    return `
        <div class="slot-bar">
            ${hoursPart}
            <span class="spacer"></span>
            ${pastToggle}
        </div>`;
}

// Ready-made start times for "Add slot", so nothing has to be typed: halfway between the barber's
// slots, the barber's own steps after closing and before opening, plus every 5 minutes in "Other time". Slots that already
// exist, and on today times that are already over, are left out.
function addSlotChoices(hours, step, existing, isPast, deleted = []) {
    const open = toMinutes(hours.open);
    const close = closingMinutes(hours.close);
    const taken = new Set(existing);
    const usable = minutes => minutes >= 0 && minutes < 24 * 60 && !taken.has(minutes) && !isPast(minutes);
    const after = [];
    for (let minutes = open + Math.floor((close - open) / step) * step; minutes < 24 * 60 && after.length < 16; minutes += step) {
        if (usable(minutes)) after.push(minutes);
    }
    const before = [];
    for (let minutes = open - step; minutes >= Math.max(open - 180, 0) && before.length < 12; minutes -= step) {
        if (usable(minutes)) before.unshift(minutes);
    }
    // Halfway between two regular slots (rounded to 5 minutes), the next ones that are still to come.
    const between = [];
    const half = Math.max(5, Math.round(step / 2 / 5) * 5);
    if (half < step) {
        for (let minutes = open + half; minutes < close && between.length < 8; minutes += step) {
            if (usable(minutes)) between.push(minutes);
        }
    }
    const other = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += 5) {
        if (usable(minutes)) other.push(minutes);
    }
    // Regular slots deleted on this day come first, so they are easy to put back.
    const removed = deleted.filter(usable);
    return { removed, between, after, before, other };
}

// "Add slot": tap a start time; the new slot opens straight away, ready for the name, phone and service.
function renderAddSlot(barber, choices) {
    const id = Number(barber.id);
    if (state.addSlot !== id) {
        return `
            <button type="button" class="btn-add-slot" data-action="add-slot-open" data-barber="${id}" title="${escapeHtml(t('slots.addSlotTitle', { name: barber.name }))}">
                ${icon('plus')}<span>${escapeHtml(t('slots.addSlot'))}</span>
            </button>`;
    }
    const chips = list => `
        <div class="time-chips">
            ${list.map(minutes => `<button type="button" class="time-chip" data-action="add-slot-pick" data-barber="${id}" data-time="${fromMinutes(minutes)}">${timeLabel(fromMinutes(minutes))}</button>`).join('')}
        </div>`;
    return `
        <div class="add-slot-panel" role="group" aria-label="${escapeHtml(t('slots.addSlotTitle', { name: barber.name }))}">
            <div class="add-slot-head">
                <strong>${icon('clock')}<span>${escapeHtml(t('slots.pickStart'))}</span></strong>
                <button type="button" class="btn-icon btn-icon-sm" data-action="add-slot-cancel" aria-label="${escapeHtml(t('common.cancel'))}">${icon('x')}</button>
            </div>
            ${choices.removed.length ? `<span class="add-slot-group">${escapeHtml(t('slots.removedGroup'))}</span>${chips(choices.removed)}` : ''}
            ${choices.between.length ? `<span class="add-slot-group">${escapeHtml(t('slots.between'))}</span>${chips(choices.between)}` : ''}
            ${choices.after.length ? `<span class="add-slot-group">${escapeHtml(t('slots.afterClosing'))}</span>${chips(choices.after)}` : ''}
            ${choices.before.length ? `<span class="add-slot-group">${escapeHtml(t('slots.beforeOpening'))}</span>${chips(choices.before)}` : ''}
            ${choices.other.length ? `
                <label class="add-slot-other">
                    <span>${escapeHtml(t('slots.otherTime'))}</span>
                    <select data-add-slot-other data-barber="${id}">
                        <option value="">…</option>
                        ${choices.other.map(minutes => `<option value="${fromMinutes(minutes)}">${escapeHtml(I18N.formatTime(fromMinutes(minutes)))}</option>`).join('')}
                    </select>
                </label>` : `<p class="slot-form-hint">${escapeHtml(t('slots.noneLeft'))}</p>`}
        </div>`;
}

async function changeExtraSlots(barberId, change, keyFor = extraKey) {
    const id = Number(barberId);
    if (!Number.isInteger(id) || (!isAdmin() && !isMine(id))) {
        denyNotYours();
        return null;
    }
    const key = keyFor(id, state.boardDate);
    const row = await queryOne('SELECT value FROM app_options WHERE key = ?', [key]);
    const before = [...new Set(String(row?.value || '').split(',').map(toMinutes).filter(value => value != null))].sort((a, b) => a - b);
    const after = change(before);
    if (!after) return null;
    await runStatements([after.length
        ? setOption(key, after.slice(0, 60).map(fromMinutes).join(','))
        : { query: 'DELETE FROM app_options WHERE key = ?', params: [key] }]);
    return after;
}

// Adds the slot, then opens it with the client form (name, phone, service) ready to fill in.
async function addExtraSlot(barberId, time) {
    barberId = Number(barberId);
    if (!isValidTime(time)) return;
    const minutes = toMinutes(time);
    const [options, slotRows] = await Promise.all([loadBookingOptions(), api.dbQuery(BARBER_SLOT_QUERY.query)]);
    const hours = shopHours(options);
    const step = barberStep(hours, parseBarberSlots(slotRows), barberId);
    // A regular slot deleted earlier on this day: bring it back instead of adding a new one.
    const skipRow = await queryOne('SELECT value FROM app_options WHERE key = ?', [skipKey(barberId, state.boardDate)]);
    const skipped = String(skipRow?.value || '').split(',').map(toMinutes).filter(value => value != null);
    if (skipped.includes(minutes)) {
        const restored = await changeExtraSlots(barberId, before => before.filter(value => value !== minutes), skipKey);
        if (!restored) return;
        state.addSlot = null;
        toast(t('slots.slotAdded', { time: I18N.formatTime(fromMinutes(minutes)) }));
        await openSlotForm(barberId, fromMinutes(minutes));
        return;
    }
    const saved = await changeExtraSlots(barberId, before => {
        if (daySlots(hours, step, before, skipped).includes(minutes)) {
            toast(t('slots.slotExists', { time: I18N.formatTime(fromMinutes(minutes)) }), 'error');
            return null;
        }
        return [...before, minutes].sort((a, b) => a - b);
    });
    if (!saved) return;
    state.addSlot = null;
    toast(t('slots.slotAdded', { time: I18N.formatTime(fromMinutes(minutes)) }));
    await openSlotForm(barberId, fromMinutes(minutes));
}

// Deletes a regular (empty) slot on the day shown. The website stops offering it at once.
async function skipSlot(barberId, time) {
    const minutes = toMinutes(time);
    if (minutes == null) return;
    const saved = await changeExtraSlots(barberId, before => [...new Set([...before, minutes])].sort((a, b) => a - b), skipKey);
    if (!saved) return;
    if (state.slotForm && state.slotForm.barberId === Number(barberId) && !state.slotForm.ticketId && state.slotForm.time === time) state.slotForm = null;
    toast(t('slots.slotDeleted', { time: I18N.formatTime(time) }));
    await renderPage({ keepScroll: true });
}

async function removeExtraSlot(barberId, time) {
    const minutes = toMinutes(time);
    const saved = await changeExtraSlots(barberId, before => before.filter(value => value !== minutes));
    if (!saved) return;
    toast(t('slots.slotRemoved'));
    await renderPage({ keepScroll: true });
}

// Open / Closed: whether the website takes bookings for a barber. Saved as app_options
// "online.<barber id>" = "0" when closed; nothing (or "1") means open. The barber opens and
// closes themselves when they start and stop work; the owner can change anyone's.
function offlineBarbers(rows) {
    return new Set(rows
        .filter(row => String(row.value) === '0')
        .map(row => Number(String(row.key).slice('online.'.length)))
        .filter(Number.isInteger));
}

function renderOnlineButton(barber, online, editable) {
    const label = t(online ? 'online.on' : 'online.off');
    const className = `online-pill ${online ? 'is-on' : 'is-off'}`;
    if (!editable) return `<span class="${className}">${icon('globe')}${escapeHtml(label)}</span>`;
    return `
        <button type="button" class="${className}" data-action="toggle-online" data-barber="${barber.id}" data-online="${online ? '1' : '0'}"
            aria-pressed="${online}" title="${escapeHtml(t(online ? 'online.closeTitle' : 'online.openTitle', { name: barber.name }))}">
            ${icon('globe')}${escapeHtml(label)}
        </button>`;
}

// A barber who signs in sees their own status first, with one big button to change it.
function renderMyOnlineCard(barbers, ctx) {
    if (isAdmin()) return '';
    const mine = barbers.find(barber => isMine(barber.id));
    if (!mine) return '';
    const online = ctx.isOnline(mine.id);
    return `
        <div class="my-online ${online ? 'is-on' : 'is-off'}">
            <span class="my-online-dot" aria-hidden="true"></span>
            <div class="my-online-text">
                <strong>${escapeHtml(t(online ? 'online.youOn' : 'online.youOff'))}</strong>
                <span>${escapeHtml(t(online ? 'online.youOnText' : 'online.youOffText'))}</span>
            </div>
            <button type="button" class="btn ${online ? 'btn-outline' : 'btn-primary'}" data-action="toggle-online" data-barber="${mine.id}" data-online="${online ? '1' : '0'}">
                ${icon('globe')}<span>${escapeHtml(t(online ? 'online.goOff' : 'online.goOn'))}</span>
            </button>
        </div>`;
}

async function toggleOnline(barberId, wasOnline) {
    const id = Number(barberId);
    if (!Number.isInteger(id) || (!isAdmin() && !isMine(id))) {
        denyNotYours();
        return;
    }
    const barber = await queryOne('SELECT name FROM barbers WHERE id = ?', [id]);
    if (!barber) return;
    await runStatements([setOption(`online.${id}`, wasOnline ? '0' : '1')]);
    toast(t(wasOnline ? 'online.savedOff' : 'online.savedOn', { name: barber.name }));
    await renderPage({ keepScroll: true });
}

// "At work" / "Not at work" for the day on the board. The barber changes their own, the admin anyone's.
function renderWorkButton(barber, off, editable, date) {
    const label = t(off ? 'work.off' : 'work.at');
    const className = `work-pill ${off ? 'is-off' : 'is-on'}`;
    if (!editable) return `<span class="${className}"><span class="work-dot"></span>${escapeHtml(label)}</span>`;
    return `
        <button type="button" class="${className}" data-action="toggle-work" data-barber="${barber.id}" data-off="${off ? '1' : '0'}"
            aria-pressed="${!off}" title="${escapeHtml(t('work.toggleTitle', { date: I18N.formatDate(date, { weekday: true }) }))}">
            <span class="work-dot"></span>${escapeHtml(label)}
        </button>`;
}

async function toggleWork(barberId, wasOff) {
    const id = Number(barberId);
    if (!Number.isInteger(id) || (!isAdmin() && !isMine(id))) {
        denyNotYours();
        return;
    }
    const barber = await queryOne('SELECT name FROM barbers WHERE id = ?', [id]);
    if (!barber) return;
    const date = state.boardDate;
    const key = offKey(id, date);
    await runStatements([wasOff
        ? { query: 'DELETE FROM app_options WHERE key = ?', params: [key] }
        : setOption(key, '1')]);
    if (state.slotForm && state.slotForm.barberId === id && !state.slotForm.ticketId) state.slotForm = null;
    toast(t(wasOff ? 'work.savedOn' : 'work.savedOff', { name: barber.name, date: I18N.formatDate(date, { weekday: true }) }));
    await renderPage({ keepScroll: true });
}

// How far ahead the website takes bookings for one barber. The barber (or the owner) picks it;
// "Shop setting" follows Settings → Booking website.
function renderColumnDays(column, own, shopDays, editable) {
    const id = Number(column.barber.id);
    const shown = own ?? shopDays;
    if (!editable) {
        return `<div class="col-slot col-slot-readonly col-days">${icon('calendar')}<span>${escapeHtml(t('booking.daysAhead'))}: ${escapeHtml(daysAheadLabel(shown))}</span></div>`;
    }
    const choices = [...new Set([...DAYS_AHEAD_CHOICES, ...(own == null ? [] : [own])])].sort((a, b) => a - b);
    return `
        <label class="col-slot col-days">
            <span class="col-slot-label">${icon('calendar')}<span>${escapeHtml(t('booking.daysAhead'))}</span></span>
            <select data-barber-days="${id}" aria-label="${escapeHtml(t('days.barberLabel', { name: column.barber.name }))}">
                <option value="" ${own == null ? 'selected' : ''}>${escapeHtml(t('days.shopSetting', { days: daysAheadLabel(shopDays) }))}</option>
                ${choices.map(value => `<option value="${value}" ${own === value ? 'selected' : ''}>${escapeHtml(daysAheadLabel(value))}</option>`).join('')}
            </select>
        </label>`;
}

async function saveBarberDays(barberId, value) {
    const id = Number(barberId);
    if (!Number.isInteger(id) || (!isAdmin() && !isMine(id))) {
        denyNotYours();
        return;
    }
    const barber = await queryOne('SELECT name FROM barbers WHERE id = ?', [id]);
    if (!barber) return;
    const key = `days.barber.${id}`;
    const days = clampInt(value, 0, 60, null);
    await runStatements([days == null
        ? { query: 'DELETE FROM app_options WHERE key = ?', params: [key] }
        : setOption(key, String(days))]);
    toast(days == null
        ? t('days.savedShop', { name: barber.name })
        : t('days.saved', { name: barber.name, days: daysAheadLabel(days) }));
    await renderPage({ keepScroll: true });
}

// The time between clients of one barber, at the top of their column.
// The barber (or the admin) picks 10, 20, 30 minutes or types any other number.
function renderColumnSlot(column, step, editable) {
    const name = column.barber.name;
    if (!editable) {
        return `<div class="col-slot col-slot-readonly">${icon('clock')}<span>${escapeHtml(t('slots.everyMinutes', { n: step }))}</span></div>`;
    }
    const custom = !SLOT_PRESETS.includes(step);
    return `
        <div class="col-slot" role="group" aria-label="${escapeHtml(t('slots.everyLabel', { name }))}">
            <span class="col-slot-label">${icon('clock')}<span>${escapeHtml(t('slots.everyShort'))}</span></span>
            <div class="segmented col-slot-presets">
                ${SLOT_PRESETS.map(value => `
                    <button type="button" class="${value === step ? 'active' : ''}" data-action="slot-length" data-barber="${column.barber.id}" data-value="${value}" aria-pressed="${value === step}" title="${escapeHtml(t('slots.minutesShort', { n: value }))}">${escapeHtml(I18N.formatNumber(value))}</button>`).join('')}
            </div>
            <label class="col-slot-custom ${custom ? 'active' : ''}">
                <input type="number" min="5" max="240" step="1" inputmode="numeric" value="${custom ? step : ''}" data-slot-custom data-barber="${column.barber.id}" aria-label="${escapeHtml(t('slots.customLabel'))}">
                <span>${escapeHtml(t('slots.min'))}</span>
            </label>
        </div>`;
}

// After the board is drawn: focus a form that was just opened, and on today start each column at the current time.
function cashierAfterRender({ keepScroll }) {
    const panel = dom.page.querySelector('.add-slot-panel');
    if (panel && state.addSlotFocus) {
        state.addSlotFocus = false;
        panel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    const form = dom.page.querySelector('[data-form="slot"]');
    if (form && state.slotForm?.focus) {
        state.slotForm.focus = false;
        const input = form.querySelector('[name="name"]');
        if (input) input.focus({ preventScroll: true });
        form.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return;
    }
    if (keepScroll) return;
    dom.page.querySelectorAll('.col-body').forEach(body => {
        const target = body.querySelector('[data-now]');
        if (target) body.scrollTop = Math.max(target.offsetTop - 6, 0);
    });
}

// Rows of a column, sorted by time: free slots, and clients (in their slot, or at their own time).
// A slot is taken when a client's time is inside it (from its start up to the next slot).
function columnRows(column, slots, step, extra = []) {
    const withSlots = Boolean(column.barber && Number(column.barber.is_active));
    const added = new Set(extra);
    const rows = [];
    const clientTimes = [];
    column.tickets.forEach(ticket => {
        const minutes = toMinutes(ticket.time);
        if (minutes != null) clientTimes.push(minutes);
        rows.push({ kind: 'ticket', minutes: minutes == null ? -1 : minutes, ticket });
    });
    if (withSlots) {
        slots.forEach(minutes => {
            if (!clientTimes.some(time => time >= minutes && time < minutes + step)) {
                rows.push({ kind: 'free', minutes, extra: added.has(minutes) });
            }
        });
    }
    return rows.sort((a, b) => a.minutes - b.minutes
        || (a.kind === b.kind ? 0 : a.kind === 'ticket' ? -1 : 1)
        || (a.ticket && b.ticket ? a.ticket.id - b.ticket.id : 0));
}

function renderColumn(column, ctx) {
    const removed = column.barber && !Number(column.barber.is_active);
    const name = column.barber ? column.barber.name : t('cashier.anyBarber');
    const mine = column.barber && isMine(column.barber.id);
    // Admin: every column. Barber: only their own column (and taking clients who have no barber).
    const editable = isAdmin() || mine;
    const canAdd = Boolean(column.barber) && !removed && editable;
    const access = { editable, takeable: !column.barber && myBarberId() != null };
    const form = state.slotForm;
    const barberId = column.barber ? Number(column.barber.id) : null;
    const doneTickets = column.tickets.filter(ticket => ticket.status === 'completed');
    const waiting = column.tickets.filter(ticket => ticket.status === 'waiting').length;
    // Every barber has their own time between clients, so their own slots.
    // A barber who is not at work on this day has no free slots.
    const off = Boolean(column.barber && !removed && ctx.isOff(column.barber.id));
    const step = column.barber ? ctx.stepFor(column.barber.id) : ctx.hours.slot;
    const extra = column.barber && !off ? ctx.extraFor(column.barber.id) : [];
    const skip = column.barber && !off ? ctx.skipFor(column.barber.id) : [];
    const grid = column.barber && !off ? daySlots(ctx.hours, step, extra, skip) : [];

    let free = 0;
    let marked = false;
    // The first row that is not over yet; the column starts there on today.
    const markNow = (minutes, isTicket) => {
        if (marked || !ctx.today) return '';
        const current = isTicket ? minutes >= ctx.now - step : minutes + step > ctx.now;
        if (!current) return '';
        marked = true;
        return 'data-now';
    };

    const rowsHtml = columnRows(column, grid, step, extra).map(row => {
        if (row.kind === 'ticket') {
            const now = markNow(row.minutes, true);
            if (form && form.ticketId === row.ticket.id) return renderSlotForm(form, ctx, now);
            return renderTicket(row.ticket, access, now);
        }
        const time = fromMinutes(row.minutes);
        const past = ctx.isPast(row.minutes, step);
        if (form && !form.ticketId && form.barberId === barberId && form.time === time) {
            return renderSlotForm(form, ctx, markNow(row.minutes, false));
        }
        if (past) {
            ctx.pastFree += 1;
            if (!state.showPast) return '';
        } else {
            free += 1;
        }
        const now = past ? '' : markNow(row.minutes, false);
        const extraTag = row.extra ? `<span class="slot-extra-tag">${escapeHtml(t('slots.extraTag'))}</span>` : '';
        if (!canAdd) {
            return `
                <div class="slot slot-readonly ${past ? 'is-past' : ''}" ${now}>
                    <span class="slot-time">${timeLabel(time)}</span>
                    <span class="slot-free">${escapeHtml(t('slots.free'))}</span>
                    ${extraTag}
                </div>`;
        }
        const slotButton = `
            <button type="button" class="slot ${past ? 'is-past' : ''}" data-action="slot-add" data-barber="${barberId}" data-time="${time}" ${row.extra ? '' : now}
                aria-label="${escapeHtml(t('slots.addAt', { time: I18N.formatTime(time) }))}">
                <span class="slot-time">${timeLabel(time)}</span>
                <span class="slot-free">${escapeHtml(t('slots.free'))}</span>
                ${extraTag}
                <span class="slot-plus">${icon('plus')}<span>${escapeHtml(t('slots.add'))}</span></span>
            </button>`;
        // Every free slot can be deleted: one added by hand goes away, a regular one is skipped
        // on this day (and comes back with "Add slot").
        const removeLabel = t(row.extra ? 'slots.removeExtra' : 'slots.deleteSlot');
        return `
            <div class="slot-row" ${row.extra ? now : ''}>
                ${slotButton}
                <button type="button" class="btn-icon btn-icon-sm slot-remove" data-action="${row.extra ? 'remove-extra-slot' : 'skip-slot'}" data-barber="${barberId}" data-time="${time}"
                    aria-label="${escapeHtml(removeLabel)}" title="${escapeHtml(removeLabel)}">${icon('x')}</button>
            </div>`;
    }).join('');

    const emptyText = column.barber
        ? (off ? '' : grid.length ? t('slots.noneLeft') : t('slots.noHours'))
        : t('cashier.emptyColumn');
    const offNote = off ? `<p class="col-off-note">${icon('alert')}<span>${escapeHtml(t('work.offNote'))}</span></p>` : '';

    return `
        <section class="col ${column.barber ? '' : 'col-unassigned'} ${mine ? 'col-mine' : ''} ${editable ? '' : 'col-readonly'} ${off ? 'col-off' : ''}" data-col="${column.key}">
            <header class="col-head">
                <div class="col-id">
                    ${column.barber ? barberAvatar(column.barber) : `<span class="avatar avatar-muted">${icon('users')}</span>`}
                    <div class="col-name">
                        <h3>${escapeHtml(name)}</h3>
                        <div class="col-tags">
                            ${column.barber && !removed ? renderOnlineButton(column.barber, ctx.isOnline(column.barber.id), editable) : ''}
                            ${column.barber && !removed ? renderWorkButton(column.barber, off, editable, ctx.date) : ''}
                            ${mine ? `<span class="tag tag-mine">${escapeHtml(t('cashier.you'))}</span>` : ''}
                        </div>
                        ${removed ? `<span class="tag">${escapeHtml(t('cashier.removedBarber'))}</span>` : ''}
                        ${!column.barber ? `<span class="col-note">${escapeHtml(t('cashier.anyBarberNote'))}</span>` : ''}
                    </div>
                </div>
                ${editable ? `<div class="col-money">${money(sum(doneTickets, ticket => ticket.total))}</div>` : ''}
            </header>
            <div class="col-stats">
                <div class="stat-free"><strong>${column.barber && !removed && !off ? free : '–'}</strong><span>${escapeHtml(t('slots.free'))}</span></div>
                <div class="stat-waiting"><strong>${waiting}</strong><span>${escapeHtml(t('status.waiting'))}</span></div>
                <div class="stat-done"><strong>${doneTickets.length}</strong><span>${escapeHtml(t('status.completed'))}</span></div>
            </div>
            ${column.barber && !removed && !off ? renderColumnSlot(column, step, editable) : ''}
            ${column.barber && !removed ? renderColumnDays(column, ctx.daysFor(column.barber.id), ctx.hours.days, editable) : ''}
            ${column.barber && !removed && !off && editable
                ? renderAddSlot(column.barber, state.addSlot === barberId ? addSlotChoices(ctx.hours, step, grid, minutes => ctx.isPast(minutes, step), skip) : null)
                : ''}
            <div class="col-body" data-scroll-key="${column.key}">
                ${offNote}
                ${rowsHtml || (emptyText ? `<p class="col-empty">${escapeHtml(emptyText)}</p>` : '')}
            </div>
        </section>`;
}

// The barber's photo (small copy), or the first letter of their name.
function barberAvatar(barber, size = '') {
    const photo = safeImage(barber.thumb_data);
    return photo
        ? `<span class="avatar avatar-photo ${size}"><img src="${escapeHtml(photo)}" alt=""></span>`
        : `<span class="avatar ${size}">${escapeHtml(initials(barber.name))}</span>`;
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

function itemNames(items) {
    return items.map(item => `${item.name || t('client.removedItem')}${Number(item.quantity) > 1 ? ` ×${Number(item.quantity)}` : ''}`)
        .join(I18N.listSeparator());
}

function renderTicket(ticket, access = { editable: true, takeable: false }, nowMark = '') {
    const canEdit = access.editable;
    const services = ticket.items.filter(item => item.item_type === 'service');
    const products = ticket.items.filter(item => item.item_type === 'product');
    const name = String(ticket.customer_name || '').trim() || t('cashier.walkIn');
    const clock = ticket.time
        ? `<span class="ticket-clock">${timeLabel(ticket.time)}</span>`
        : `<span class="ticket-clock ticket-clock-none">${escapeHtml(t('slots.noTime'))}</span>`;
    const online = ticket.online_id ? `<span class="badge badge-online" title="${escapeHtml(t('booking.badgeTitle'))}">${icon('globe')}${escapeHtml(t('booking.badge'))}</span>` : '';

    // Finished clients are a short green row in their slot.
    if (ticket.status === 'completed') {
        const method = ticket.payment_method === 'card' ? 'card' : 'cash';
        return `
            <article class="ticket ticket-compact is-done" data-ticket="${ticket.id}" ${nowMark}>
                ${clock}
                <div class="ticket-compact-main">
                    <strong>${escapeHtml(name)}</strong>
                    ${ticket.items.length ? `<span>${escapeHtml(itemNames(ticket.items))}</span>` : ''}
                </div>
                <div class="ticket-compact-end">
                    <span class="ticket-compact-money" title="${escapeHtml(t(`pay.${method}`))}">${icon('check')}${money(ticket.total)}</span>
                    ${canEdit ? `<button type="button" class="btn-icon btn-icon-sm" data-action="edit-finished" data-id="${ticket.id}" aria-label="${escapeHtml(t('history.editLocked'))}" title="${escapeHtml(t('history.editLocked'))}">${icon('pencil')}</button>` : ''}
                </div>
            </article>`;
    }

    const isActive = ticket.status === 'in-service';
    const amounts = ticketMoney(ticket);
    const line = (kind, list) => {
        const label = t(kind === 'products' ? 'client.products' : 'client.services');
        return `
            <div class="ticket-line" title="${escapeHtml(label)}">
                <span class="line-icon" aria-label="${escapeHtml(label)}">${icon(kind === 'products' ? 'bag' : 'scissors')}</span>
                <div class="chips">${list.map(itemChip).join('')}</div>
            </div>`;
    };
    const serviceLine = services.length
        ? line('services', services)
        : canEdit
            ? `<div class="ticket-line"><span class="line-icon">${icon('scissors')}</span><div class="chips"><button type="button" class="chip chip-add" data-action="slot-edit" data-id="${ticket.id}">${icon('plus')}<span>${escapeHtml(t('cashier.addService'))}</span></button></div></div>`
            : '';

    const buttons = [];
    if (ticket.status === 'waiting' && (canEdit || access.takeable)) {
        buttons.push(`<button type="button" class="btn btn-outline btn-sm" data-action="take-client" data-id="${ticket.id}" title="${escapeHtml(t('cashier.take'))}">${icon('scissors')}<span>${escapeHtml(t('cashier.start'))}</span></button>`);
    }
    if (isActive && canEdit) {
        buttons.push(`<button type="button" class="btn-icon" data-action="back-to-waiting" data-id="${ticket.id}" aria-label="${escapeHtml(t('cashier.backToWaiting'))}" title="${escapeHtml(t('cashier.backToWaiting'))}">${icon('undo')}</button>`);
    }
    if (canEdit) {
        buttons.push(`<button type="button" class="btn ${isActive ? 'btn-light' : 'btn-primary'} btn-sm btn-done" data-action="done-client" data-id="${ticket.id}">${icon('check')}<span>${escapeHtml(t('done.button'))}</span></button>`);
    }

    return `
        <article class="ticket ${isActive ? 'is-active' : 'is-waiting'}" data-ticket="${ticket.id}" ${nowMark}>
            <div class="ticket-top">
                ${clock}
                ${statusBadge(ticket)}
                ${online}
                ${canEdit ? `<button type="button" class="btn-icon btn-icon-sm ticket-edit" data-action="slot-edit" data-id="${ticket.id}" aria-label="${escapeHtml(t('common.edit'))}" title="${escapeHtml(t('common.edit'))}">${icon('pencil')}</button>` : ''}
            </div>
            <div class="ticket-who">
                <strong>${escapeHtml(name)}</strong>
                ${ticket.customer_phone ? `<bdi dir="ltr">${escapeHtml(ticket.customer_phone)}</bdi>` : ''}
            </div>
            ${serviceLine}
            ${products.length ? line('products', products) : ''}
            <div class="ticket-foot">
                <div class="ticket-money">
                    <strong class="ticket-total">${money(ticket.total)}</strong>
                    ${amounts.entered != null ? `<small class="money-tag">${escapeHtml(t('slotForm.enteredTag'))}</small>` : ''}
                </div>
                ${buttons.length ? `<div class="ticket-actions">${buttons.join('')}</div>` : ''}
            </div>
        </article>`;
}

/* ------------------------------------------------------------------ */
/* Add or edit a client inside a slot (no pop-up)                      */
/* ------------------------------------------------------------------ */

let slotCustomers = [];
// Active services, from the last time the board was drawn.
let slotCatalog = [];
let slotSaving = false;

async function loadSlotCustomers() {
    slotCustomers = await api.dbQuery('SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY id DESC LIMIT 3000');
}

async function openSlotForm(barberId, time) {
    if (!isAdmin() && !isMine(barberId)) {
        denyNotYours();
        return;
    }
    if (!isValidTime(time)) return;
    await loadSlotCustomers();
    state.slotForm = {
        ticketId: null,
        barberId: Number(barberId),
        date: state.boardDate,
        time,
        name: '',
        phone: '',
        customerId: null,
        services: [],
        prices: {},
        extra: [],
        amount: '',
        products: 0,
        focus: true
    };
    await renderPage({ keepScroll: true });
}

async function openSlotEdit(id) {
    const ticket = await loadTicket(id);
    if (!ticket || !OPEN_STATUSES.includes(ticket.status)) {
        toast(t('client.notEditable'), 'error');
        await renderPage({ keepScroll: true });
        return;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        return;
    }
    await loadSlotCustomers();
    const services = ticket.items.filter(item => item.item_type === 'service');
    const prices = {};
    services.forEach(item => {
        prices[Number(item.item_id)] = Number(item.price || 0);
    });
    const amounts = ticketMoney(ticket);
    state.slotForm = {
        ticketId: ticket.id,
        barberId: ticket.barber_id == null ? null : Number(ticket.barber_id),
        date: ticket.date,
        time: String(ticket.time || '').slice(0, 5),
        name: ticket.customer_name || '',
        phone: ticket.customer_phone || '',
        customerId: ticket.customer_id ? Number(ticket.customer_id) : null,
        services: [...new Set(services.map(item => Number(item.item_id)))],
        prices,
        // Services that were removed from the catalog stay on the visit.
        extra: services.map(item => ({ id: Number(item.item_id), name: item.name || t('client.removedItem'), price: Number(item.price || 0) })),
        amount: amounts.entered == null ? '' : String(amounts.entered),
        products: amounts.products,
        focus: true
    };
    if (state.boardDate !== ticket.date) state.boardDate = ticket.date;
    await renderPage({ keepScroll: true });
}

function closeSlotForm() {
    state.slotForm = null;
    return renderPage({ keepScroll: true });
}

function slotServices(form, catalog) {
    const list = catalog.map(service => ({ id: Number(service.id), name: service.name, price: Number(service.price || 0) }));
    form.extra.forEach(item => {
        if (!list.some(service => service.id === item.id)) list.push(item);
    });
    return list;
}

function slotServicesTotal(form, catalog) {
    return sum(form.services, id => form.prices[id] ?? catalog.find(service => Number(service.id) === id)?.price ?? 0);
}

function slotSuggestionsHtml(form) {
    if (form.customerId) {
        const label = form.name || form.phone || t('cashier.walkIn');
        return `
            <span class="linked-pill">${icon('user')}<span>${escapeHtml(t('client.linked', { name: label }))}</span>
                <button type="button" data-slot-unlink aria-label="${escapeHtml(t('client.unlink'))}" title="${escapeHtml(t('client.unlink'))}">${icon('x')}</button>
            </span>`;
    }
    const name = form.name.trim().toLowerCase();
    const phone = digits(form.phone);
    if (name.length < 2 && phone.length < 3) return '';
    const matches = slotCustomers.filter(customer =>
        (name.length >= 2 && String(customer.name || '').toLowerCase().includes(name))
        || (phone.length >= 3 && digits(customer.phone).includes(phone))
    ).slice(0, 3);
    return matches.map(customer => `
        <button type="button" class="suggest" data-slot-customer="${customer.id}">
            ${icon('user')}<span>${escapeHtml(customer.name || t('cashier.walkIn'))}</span>
            ${customer.phone ? `<bdi dir="ltr">${escapeHtml(customer.phone)}</bdi>` : ''}
        </button>`).join('');
}

function renderSlotForm(form, ctx, nowMark = '') {
    ctx.formShown = true;
    const editing = form.ticketId != null;
    const services = slotServices(form, ctx.services);
    const selected = new Set(form.services);
    const servicesTotal = slotServicesTotal(form, ctx.services);
    const barberOptions = editing && isAdmin() ? `
        <label class="field"><span>${escapeHtml(t('client.barber'))}</span>
            <select name="barber">
                <option value="">${escapeHtml(t('cashier.anyBarber'))}</option>
                ${ctx.barbers.map(barber => `<option value="${barber.id}" ${Number(barber.id) === form.barberId ? 'selected' : ''}>${escapeHtml(barber.name)}</option>`).join('')}
            </select>
        </label>` : '';

    return `
        <form class="slot-form" data-form="slot" autocomplete="off" ${nowMark}>
            <div class="slot-form-head">
                <span class="ticket-clock">${form.time ? timeLabel(form.time) : escapeHtml(t('slots.noTime'))}</span>
                <strong>${escapeHtml(t(editing ? 'slotForm.edit' : 'slotForm.new'))}</strong>
                <button type="button" class="btn-icon btn-icon-sm" data-action="slot-cancel" aria-label="${escapeHtml(t('common.cancel'))}">${icon('x')}</button>
            </div>
            <input type="text" name="name" maxlength="80" autocomplete="off" placeholder="${escapeHtml(t('slotForm.namePh'))}" aria-label="${escapeHtml(t('client.name'))}" value="${escapeHtml(form.name)}">
            <input type="tel" name="phone" maxlength="30" inputmode="tel" dir="ltr" autocomplete="off" placeholder="${escapeHtml(t('slotForm.phonePh'))}" aria-label="${escapeHtml(t('client.phone'))}" value="${escapeHtml(form.phone)}">
            <div class="slot-suggestions" data-slot-suggestions>${slotSuggestionsHtml(form)}</div>
            <div class="slot-form-section">
                <span class="slot-form-label">${icon('scissors')}${escapeHtml(t('slotForm.service'))}</span>
                ${services.length ? `
                    <div class="svc-chips">
                        ${services.map(service => `
                            <button type="button" class="svc-chip ${selected.has(service.id) ? 'selected' : ''}" data-slot-svc="${service.id}" aria-pressed="${selected.has(service.id)}">
                                <span>${escapeHtml(service.name)}</span><small>${escapeHtml(I18N.formatNumber(form.prices[service.id] ?? service.price))}</small>
                            </button>`).join('')}
                    </div>` : `<p class="slot-form-hint">${escapeHtml(t('client.noServices'))}</p>`}
            </div>
            ${isAdmin() ? `
                <label class="slot-form-section">
                    <span class="slot-form-label">${icon('wallet')}${escapeHtml(t('slotForm.money'))}</span>
                    <span class="money-input">
                        <input type="number" name="amount" min="0" step="any" inputmode="decimal" value="${escapeHtml(form.amount)}" placeholder="${escapeHtml(I18N.formatNumber(servicesTotal))}" data-slot-amount>
                        <span>${escapeHtml(I18N.currency())}</span>
                    </span>
                    <small class="slot-form-hint">${escapeHtml(t('slotForm.moneyHint'))}</small>
                </label>` : ''}
            ${editing ? `
                <div class="slot-form-move ${barberOptions ? 'grid-2' : ''}">
                    <label class="field"><span>${escapeHtml(t('client.time'))}</span>
                        <input type="time" name="time" value="${escapeHtml(form.time)}">
                    </label>
                    ${barberOptions}
                </div>` : ''}
            ${form.products ? `<p class="slot-form-hint">${icon('bag')}<span>${escapeHtml(t('slotForm.productsKept'))}</span></p>` : ''}
            <div class="slot-form-actions">
                ${editing ? `<button type="button" class="btn btn-ghost-danger btn-sm" data-action="slot-remove" data-id="${form.ticketId}">${icon('trash')}<span>${escapeHtml(t('client.remove'))}</span></button>` : ''}
                <span class="spacer"></span>
                <button type="button" class="btn btn-ghost btn-sm" data-action="slot-cancel">${escapeHtml(t('common.cancel'))}</button>
                <button type="submit" class="btn btn-primary btn-sm">${icon(editing ? 'check' : 'plus')}<span>${escapeHtml(t(editing ? 'common.save' : 'client.addClient'))}</span></button>
            </div>
        </form>`;
}

// Typing in the slot form keeps its values in state, so a refresh of the board does not lose them.
function onSlotFormInput(element) {
    const form = state.slotForm;
    if (!form) return;
    const box = element.closest('[data-form="slot"]');
    if (element.name === 'name' || element.name === 'phone') {
        form[element.name] = element.value;
        const suggestions = box.querySelector('[data-slot-suggestions]');
        if (suggestions) suggestions.innerHTML = slotSuggestionsHtml(form);
    } else if (element.name === 'amount') {
        form.amount = element.value;
    } else if (element.name === 'time') {
        form.time = element.value;
    } else if (element.name === 'barber') {
        form.barberId = element.value ? Number(element.value) : null;
    }
}

function onSlotFormClick(event) {
    const form = state.slotForm;
    const box = event.target.closest('[data-form="slot"]');
    if (!form || !box) return false;
    const chip = event.target.closest('[data-slot-svc]');
    if (chip) {
        const id = Number(chip.dataset.slotSvc);
        if (form.services.includes(id)) form.services = form.services.filter(item => item !== id);
        else form.services.push(id);
        const selected = form.services.includes(id);
        chip.classList.toggle('selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
        const amount = box.querySelector('[data-slot-amount]');
        if (amount) amount.placeholder = I18N.formatNumber(slotServicesTotal(form, slotCatalog));
        return true;
    }
    const suggestion = event.target.closest('[data-slot-customer]');
    if (suggestion) {
        const customer = slotCustomers.find(item => Number(item.id) === Number(suggestion.dataset.slotCustomer));
        if (customer) {
            form.customerId = Number(customer.id);
            form.name = customer.name || '';
            form.phone = customer.phone || '';
            box.querySelector('[name="name"]').value = form.name;
            box.querySelector('[name="phone"]').value = form.phone;
            box.querySelector('[data-slot-suggestions]').innerHTML = slotSuggestionsHtml(form);
        }
        return true;
    }
    if (event.target.closest('[data-slot-unlink]')) {
        form.customerId = null;
        form.name = '';
        form.phone = '';
        box.querySelector('[name="name"]').value = '';
        box.querySelector('[name="phone"]').value = '';
        box.querySelector('[data-slot-suggestions]').innerHTML = '';
        box.querySelector('[name="name"]').focus();
        return true;
    }
    return false;
}

async function saveSlotForm() {
    const form = state.slotForm;
    if (!form || slotSaving) return;
    const name = form.name.trim();
    const phone = form.phone.trim();
    let amount = null;
    if (isAdmin() && String(form.amount).trim() !== '') {
        amount = parsePrice(form.amount);
        if (amount == null) {
            toast(t('slotForm.badMoney'), 'error');
            dom.page.querySelector('[data-slot-amount]')?.focus();
            return;
        }
    }

    slotSaving = true;
    try {
        const catalog = await api.dbQuery('SELECT id, price FROM services');
        let current = null;
        if (form.ticketId) {
            current = await loadTicket(form.ticketId);
            if (!current || !OPEN_STATUSES.includes(current.status) || !canManageTicket(current)) {
                toast(t('client.notEditable'), 'error');
                state.slotForm = null;
                await renderPage({ keepScroll: true });
                return;
            }
            // Only the admin types the money; a barber's change keeps it.
            if (!isAdmin()) amount = ticketMoney(current).entered;
        }

        const statements = [];
        let customerRef = null;
        if (form.customerId) {
            if (name || phone) {
                statements.push({
                    query: 'UPDATE customers SET name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    params: [name || null, phone || null, form.customerId]
                });
                customerRef = form.customerId;
            }
        } else if (name || phone) {
            const phoneDigits = digits(phone);
            const match = phoneDigits ? slotCustomers.find(customer => digits(customer.phone) === phoneDigits) : null;
            if (match) {
                customerRef = Number(match.id);
                if (name && !String(match.name || '').trim()) {
                    statements.push({ query: 'UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', params: [name, customerRef] });
                }
            } else {
                statements.push({ query: 'INSERT INTO customers (name, phone, total_visits, total_spent) VALUES (?, ?, 0, 0)', params: [name || null, phone || null] });
                customerRef = { lastIDFrom: statements.length - 1 };
            }
        }

        const priceOf = id => form.prices[id] ?? Number(catalog.find(service => Number(service.id) === id)?.price || 0);
        const services = form.services.map(id => ({ id, price: priceOf(id) }));
        const products = current ? ticketMoney(current).products : 0;
        const total = (amount ?? sum(services, item => item.price)) + products;

        let orderRef;
        let time = form.time;
        if (current) {
            time = isValidTime(form.time) ? form.time.slice(0, 5) : String(current.time || '').slice(0, 5);
            const barberId = isAdmin() ? form.barberId : Number(current.barber_id);
            const status = barberId ? current.status : 'waiting';
            statements.push({
                query: `UPDATE orders SET customer_id = ?, time = ?, total = ?, barber_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE id = ? AND status IN ('waiting', 'in-service')`,
                params: [customerRef, time, total, barberId, status, current.id]
            });
            statements.push({ query: "DELETE FROM order_items WHERE order_id = ? AND item_type = 'service'", params: [current.id] });
            orderRef = current.id;
        } else {
            statements.push({
                query: "INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, ?, 0, 'waiting', NULL, ?)",
                params: [customerRef, form.date, time, total, form.barberId]
            });
            orderRef = { lastIDFrom: statements.length - 1 };
        }
        services.forEach(item => {
            statements.push({
                query: "INSERT INTO order_items (order_id, item_type, item_id, quantity, price) VALUES (?, 'service', ?, 1, ?)",
                params: [orderRef, item.id, item.price]
            });
        });

        await runStatements(statements);
        state.slotForm = null;
        toast(current ? t('toast.clientSaved') : t('toast.clientAddedAt', { time: I18N.formatTime(time) }));
        await renderPage({ keepScroll: true });
    } catch (error) {
        handleError(error);
    } finally {
        slotSaving = false;
    }
}

async function removeOpenClient(id) {
    const ticket = await loadTicket(id);
    if (!ticket || !OPEN_STATUSES.includes(ticket.status)) {
        state.slotForm = null;
        await renderPage({ keepScroll: true });
        return;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        return;
    }
    if (!await confirmDialog(t('confirm.removeClient'), { okLabel: t('client.remove'), danger: true })) return;
    await runStatements([
        { query: 'DELETE FROM order_items WHERE order_id = ?', params: [id] },
        { query: 'DELETE FROM payments WHERE order_id = ?', params: [id] },
        { query: "DELETE FROM orders WHERE id = ? AND status IN ('waiting', 'in-service')", params: [id] }
    ]);
    state.slotForm = null;
    toast(t('toast.clientRemoved'));
    await renderPage({ keepScroll: true });
}

// A barber changes only their own time between clients; the admin can change anyone's.
async function saveSlotLength(barberId, value) {
    const id = Number(barberId);
    if (!Number.isInteger(id) || (!isAdmin() && !isMine(id))) {
        denyNotYours();
        return;
    }
    const minutes = clampInt(value, 5, 240, null);
    if (minutes == null) {
        toast(t('slots.badLength'), 'error');
        return;
    }
    const barber = await queryOne('SELECT name FROM barbers WHERE id = ?', [id]);
    if (!barber) return;
    await runStatements([setOption(`slot.barber.${id}`, String(minutes))]);
    toast(t('slots.savedFor', { name: barber.name, n: minutes }));
    await renderPage({ keepScroll: true });
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

// Online, the server checks the password, so barbers never see its hash.
async function checkHistoryPassword(password) {
    if (state.serverMode) return api.checkHistoryPassword(password);
    return XAuth.verifyPassword(password, await getHistoryPasswordHash());
}

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
// always = true asks every time (deleting from History, clearing history).
async function requireEditPassword({ always = false, text = t('lock.text'), okLabel = t('lock.unlock'), danger = false } = {}) {
    if (!always && editUnlocked()) {
        unlockEditing();
        return true;
    }
    return new Promise(resolve => {
        let unlocked = false;
        const entry = openModal({
            title: t('lock.title'),
            size: 'sm',
            autofocus: true,
            body: `
                <form class="stack lock-form" data-lock-form>
                    <div class="lock-hero">${icon('lock')}<p>${escapeHtml(text)}</p></div>
                    <label class="field"><span>${escapeHtml(t('lock.password'))}</span>
                        <input type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="100" data-lock-input>
                    </label>
                    <p class="field-error" data-lock-error hidden>${icon('alert')}<span>${escapeHtml(t('lock.wrong'))}</span></p>
                </form>`,
            footer: `
                <span class="spacer"></span>
                <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-lock-ok>${icon(danger ? 'trash' : 'unlock')}<span>${escapeHtml(okLabel)}</span></button>`,
            onClose: () => resolve(unlocked)
        });
        const input = entry.modal.querySelector('[data-lock-input]');
        const error = entry.modal.querySelector('[data-lock-error]');
        const okButton = entry.modal.querySelector('[data-lock-ok]');
        const check = async () => {
            if (okButton.disabled) return;
            okButton.disabled = true;
            let correct = false;
            try {
                correct = await checkHistoryPassword(input.value);
            } catch (checkError) {
                okButton.disabled = false;
                handleError(checkError);
                return;
            }
            okButton.disabled = false;
            if (correct) {
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
    await openFinishedModal(id);
}

// Deleting a finished client always asks for the password, even when editing is unlocked.
async function deleteFinishedClient(id) {
    const ticket = await loadTicket(id);
    if (!ticket || ticket.status !== 'completed') {
        toast(t('client.notEditable'), 'error');
        await renderPage({ keepScroll: true });
        return false;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        return false;
    }
    const name = String(ticket.customer_name || '').trim() || t('cashier.walkIn');
    const ok = await requireEditPassword({
        always: true,
        text: t('lock.deleteText', { name, amount: moneyText(ticket.total) }),
        okLabel: t('common.delete'),
        danger: true
    });
    if (!ok) return false;
    const current = await loadTicket(id);
    if (!current || current.status !== 'completed') {
        await renderPage({ keepScroll: true });
        return false;
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
        { query: 'DELETE FROM payments WHERE order_id = ?', params: [id] },
        { query: 'DELETE FROM order_items WHERE order_id = ?', params: [id] },
        { query: "DELETE FROM orders WHERE id = ? AND COALESCE(status, 'completed') = 'completed'", params: [id] }
    );
    await runStatements(statements);
    toast(t('toast.finishedDeleted'));
    await renderPage({ keepScroll: true });
    return true;
}

async function saveHistoryPassword(form) {
    const current = form.elements.current.value;
    const next = form.elements.next.value;
    const repeat = form.elements.repeat.value;
    if (!await checkHistoryPassword(current)) {
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

// The owner's sign-in password (username stays "admin").
async function saveAdminPassword(form) {
    const current = form.elements.current.value;
    const next = form.elements.next.value;
    if (next.length < 6) {
        toast(t('owner.tooShort'), 'error');
        form.elements.next.focus();
        return;
    }
    if (next !== form.elements.repeat.value) {
        toast(t('lock.mismatch'), 'error');
        form.elements.repeat.focus();
        return;
    }
    if (state.serverMode) {
        try {
            await api.changeAdminPassword(current, next);
        } catch (error) {
            if (error.status === 403) {
                toast(t('owner.wrongCurrent'), 'error');
                form.elements.current.focus();
                return;
            }
            throw error;
        }
    } else {
        if (!await verifyLocalAdmin(current)) {
            toast(t('owner.wrongCurrent'), 'error');
            form.elements.current.focus();
            return;
        }
        const hash = XAuth.hashPassword(next);
        await runStatements([
            { query: "UPDATE admins SET password_hash = ? WHERE username = 'admin'", params: [hash] },
            { query: "INSERT OR IGNORE INTO admins (username, password_hash) VALUES ('admin', ?)", params: [hash] }
        ]);
    }
    form.reset();
    toast(t('owner.changed'));
}

/* ------------------------------------------------------------------ */
/* Finished client form (after the password)                           */
/* ------------------------------------------------------------------ */

// Edits a paid client (opened from History or the board after the password).
async function openFinishedModal(ticketId) {
    const [services, products, categories, customers, allBarbers] = await queryMany([
        { query: 'SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name, price, stock, image_data, category_id FROM products WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name FROM categories ORDER BY name' },
        { query: 'SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY id DESC LIMIT 3000' },
        { query: 'SELECT id, name, is_active FROM barbers ORDER BY id' }
    ]);
    const ticket = await loadTicket(ticketId);
    if (!ticket || ticket.status !== 'completed') {
        toast(t('client.notEditable'), 'error');
        await renderPage({ keepScroll: true });
        return;
    }
    if (!canManageTicket(ticket)) {
        denyNotYours();
        await renderPage({ keepScroll: true });
        return;
    }

    // Active barbers, plus the client's own barber if that barber was removed.
    const barbers = allBarbers.filter(barber => Number(barber.is_active)
        || (ticket.barber_id != null && Number(barber.id) === Number(ticket.barber_id)));

    const draft = {
        id: ticket.id,
        method: ticket.payment_method === 'card' ? 'card' : 'cash',
        customerId: ticket.customer_id ? Number(ticket.customer_id) : null,
        // Money the admin typed for this visit (null = the service prices count).
        entered: ticketMoney(ticket).entered,
        services: new Map(),
        products: new Map()
    };

    // Keep items on the visit even if they were later removed from the catalog.
    ticket.items.forEach(item => {
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

    const selectedBarber = ticket.barber_id != null && barbers.some(barber => Number(barber.id) === Number(ticket.barber_id))
        ? String(ticket.barber_id) : '';
    const timeValue = String(ticket.time || '').slice(0, 5);
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
        : `<div class="inline-empty">${escapeHtml(t('client.noServices'))}</div>`;

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
        : `<div class="inline-empty">${escapeHtml(t('client.noProducts'))}</div>`;

    const optional = `<em>${escapeHtml(t('common.optional'))}</em>`;
    const barberField = isAdmin()
        ? `<select data-field="barber">
                <option value="">${escapeHtml(t('history.noBarber'))}</option>
                ${barbers.map(barber => `<option value="${barber.id}" ${String(barber.id) === selectedBarber ? 'selected' : ''}>${escapeHtml(barber.name)}${Number(barber.is_active) ? '' : ` (${escapeHtml(t('cashier.removedBarber'))})`}</option>`).join('')}
           </select>`
        : `<select data-field="barber" disabled>
                ${barbers.filter(barber => isMine(barber.id)).map(barber => `<option value="${barber.id}" selected>${escapeHtml(barber.name)}</option>`).join('')}
           </select>`;
    const body = `
        <div class="client-form">
            <p class="notice notice-unlocked">${icon('unlock')}<span>${escapeHtml(t('client.finishedNotice'))}</span></p>
            <section class="form-section">
                <h3 class="section-title">${icon('user')}${escapeHtml(t('client.who'))}</h3>
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('client.name'))} ${optional}</span>
                        <input type="text" data-field="name" maxlength="80" autocomplete="off" value="${escapeHtml(ticket.customer_name || '')}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('client.phone'))} ${optional}</span>
                        <input type="tel" data-field="phone" maxlength="30" inputmode="tel" dir="ltr" autocomplete="off" value="${escapeHtml(ticket.customer_phone || '')}">
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
                    <label class="field"><span>${escapeHtml(t('client.date'))}</span>
                        <input type="date" data-field="date" value="${escapeHtml(ticket.date)}">
                    </label>
                    <label class="field"><span>${escapeHtml(t('client.time'))} ${optional}</span>
                        <input type="time" data-field="time" value="${escapeHtml(timeValue)}">
                    </label>
                </div>
            </section>
            <section class="form-section">
                <h3 class="section-title">${icon('wallet')}${escapeHtml(t('pay.method'))}</h3>
                <div class="segmented segmented-lg" data-finish-method>
                    <button type="button" class="${draft.method === 'cash' ? 'active' : ''}" data-method="cash" aria-pressed="${draft.method === 'cash'}">${icon('cash')}${escapeHtml(t('pay.cash'))}</button>
                    <button type="button" class="${draft.method === 'card' ? 'active' : ''}" data-method="card" aria-pressed="${draft.method === 'card'}">${icon('card')}${escapeHtml(t('pay.card'))}</button>
                </div>
                ${isAdmin() ? `
                    <label class="field finished-money"><span>${escapeHtml(t('slotForm.money'))}</span>
                        <span class="money-input">
                            <input type="number" min="0" step="any" inputmode="decimal" data-field="amount" value="${draft.entered == null ? '' : escapeHtml(draft.entered)}">
                            <span>${escapeHtml(I18N.currency())}</span>
                        </span>
                        <small class="field-hint">${escapeHtml(t('slotForm.moneyHint'))}</small>
                    </label>` : ''}
            </section>
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
            <button type="button" class="btn btn-ghost-danger" data-finished-delete>${icon('trash')}<span>${escapeHtml(t('common.delete'))}</span></button>
            <button type="button" class="btn btn-ghost" data-finished-reopen>${icon('undo')}<span>${escapeHtml(t('cashier.undoPay'))}</span></button>
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" data-client-save>${icon('check')}<span>${escapeHtml(t('client.saveChanges'))}</span></button>
        </div>`;

    const entry = openModal({
        title: t('client.editFinishedTitle'),
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
    // The admin's typed money; a barber keeps what the admin typed.
    const enteredMoney = () => {
        if (!isAdmin()) return { value: draft.entered, valid: true };
        const text = field('amount').value.trim();
        if (text === '') return { value: null, valid: true };
        const value = parsePrice(text);
        return { value, valid: value != null };
    };

    const updateSummary = () => {
        const servicePrices = sum([...draft.services.values()], item => item.price * item.quantity);
        const productsTotal = sum([...draft.products.values()], item => item.price * item.quantity);
        const typed = enteredMoney().value;
        const servicesTotal = typed ?? servicePrices;
        if (isAdmin()) field('amount').placeholder = I18N.formatNumber(servicePrices);
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
        const label = customer ? (customer.name || customer.phone || t('cashier.walkIn')) : (ticket.customer_name || ticket.customer_phone || t('cashier.walkIn'));
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
        modal.querySelectorAll('[data-client-save], [data-finished-delete], [data-finished-reopen]').forEach(button => {
            button.disabled = value;
        });
    };

    const save = async () => {
        if (saving) return;
        const typed = enteredMoney();
        if (!typed.valid) {
            toast(t('slotForm.badMoney'), 'error');
            field('amount').focus();
            return;
        }
        const name = field('name').value.trim();
        const phone = field('phone').value.trim();
        const date = isValidDate(field('date').value) ? field('date').value : ticket.date;
        const time = isValidTime(field('time').value) ? field('time').value.slice(0, 5) : '';
        const barberValue = field('barber').value;
        const chosenBarber = isAdmin() ? (barberValue ? Number(barberValue) : null) : myBarberId();

        const items = [
            ...[...draft.services.entries()].map(([id, item]) => ({ type: 'service', id, ...item })),
            ...[...draft.products.entries()].map(([id, item]) => ({ type: 'product', id, ...item }))
        ];
        const servicePrices = sum(items.filter(item => item.type === 'service'), item => item.price * item.quantity);
        const productsTotal = sum(items.filter(item => item.type === 'product'), item => item.price * item.quantity);
        const total = (typed.value ?? servicePrices) + productsTotal;

        setSaving(true);
        try {
            const current = await loadTicket(draft.id);
            if (!current || !canManageTicket(current) || current.status !== 'completed') {
                toast(t('client.notEditable'), 'error');
                entry.close();
                await renderPage({ keepScroll: true });
                return;
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
                const match = phoneDigits ? customers.find(customer => digits(customer.phone) === phoneDigits) : null;
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

            await runStatements(statements);
            entry.close();
            toast(t('toast.finishedSaved'));
            if (['cashier', 'history'].includes(state.page)) await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        } finally {
            setSaving(false);
        }
    };

    const removeFinished = async () => {
        setSaving(true);
        try {
            if (await deleteFinishedClient(draft.id)) entry.close();
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
        const methodButton = event.target.closest('[data-finish-method] [data-method]');
        if (methodButton) {
            draft.method = methodButton.dataset.method === 'card' ? 'card' : 'cash';
            modal.querySelectorAll('[data-finish-method] [data-method]').forEach(button => {
                button.classList.toggle('active', button === methodButton);
                button.setAttribute('aria-pressed', String(button === methodButton));
            });
            return;
        }
        if (event.target.closest('[data-client-save]')) {
            save();
            return;
        }
        if (event.target.closest('[data-finished-delete]')) removeFinished();
        if (event.target.closest('[data-finished-reopen]')) reopenFinished();
    });

    modal.addEventListener('input', event => {
        if (event.target.matches('[data-field="name"], [data-field="phone"]')) renderSuggestions();
        if (event.target.matches('[data-product-search]')) filterProducts();
        if (event.target.matches('[data-field="amount"]')) updateSummary();
    });

    renderLinked();
    updateSummary();
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
/* Done: finish a client after "Are you sure?"                         */
/* ------------------------------------------------------------------ */

async function openDoneDialog(id) {
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
    const amounts = ticketMoney(ticket);
    const name = String(ticket.customer_name || '').trim() || t('cashier.walkIn');
    const who = [ticket.barber_name || t('cashier.anyBarber'), ticket.time ? I18N.formatTime(String(ticket.time).slice(0, 5)) : '']
        .filter(Boolean).join(' · ');
    const admin = isAdmin();

    const body = `
        <div class="pay done-dialog">
            <div class="pay-who">
                <span class="avatar">${escapeHtml(initials(name))}</span>
                <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(who)}</span></div>
            </div>
            ${ticket.items.length ? `
                <ul class="pay-items">
                    ${ticket.items.map(item => `
                        <li>
                            <span class="pay-item-icon">${icon(item.item_type === 'product' ? 'bag' : 'scissors')}</span>
                            <span class="pay-item-name">${escapeHtml(item.name || t('client.removedItem'))}${Number(item.quantity) > 1 ? ` <b>×${Number(item.quantity)}</b>` : ''}</span>
                            <span>${money(Number(item.price) * Number(item.quantity || 1))}</span>
                        </li>`).join('')}
                </ul>` : ''}
            ${admin ? `
                <label class="field"><span>${escapeHtml(t('slotForm.money'))}</span>
                    <span class="money-input">
                        <input type="number" min="0" step="any" inputmode="decimal" data-done-money value="${amounts.entered == null ? '' : escapeHtml(amounts.entered)}" placeholder="${escapeHtml(I18N.formatNumber(amounts.services))}">
                        <span>${escapeHtml(I18N.currency())}</span>
                    </span>
                    <small class="field-hint">${escapeHtml(t('slotForm.moneyHint'))}</small>
                </label>` : ''}
            <div class="pay-total"><span>${escapeHtml(t('client.total'))}</span><strong data-done-total></strong></div>
            <div class="field">
                <span>${escapeHtml(t('pay.method'))}</span>
                <div class="segmented segmented-lg" data-pay-method>
                    <button type="button" class="active" data-method="cash" aria-pressed="true">${icon('cash')}${escapeHtml(t('pay.cash'))}</button>
                    <button type="button" data-method="card" aria-pressed="false">${icon('card')}${escapeHtml(t('pay.card'))}</button>
                </div>
            </div>
            <p class="done-question">${icon('alert')}<span>${escapeHtml(t('done.question'))}</span></p>
        </div>`;

    const entry = openModal({
        title: t('done.title'),
        size: 'md',
        body,
        footer: `
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary btn-lg" data-done-confirm>${icon('check')}<span>${escapeHtml(t('done.yes'))}</span></button>`
    });
    const modal = entry.modal;
    const moneyInput = modal.querySelector('[data-done-money]');
    let method = 'cash';

    const servicesMoney = () => {
        if (!moneyInput) return { value: amounts.entered ?? amounts.services, valid: true };
        const text = moneyInput.value.trim();
        if (text === '') return { value: amounts.services, valid: true };
        const value = parsePrice(text);
        return { value: value ?? 0, valid: value != null };
    };
    const updateTotal = () => {
        modal.querySelector('[data-done-total]').innerHTML = money(servicesMoney().value + amounts.products);
    };

    modal.addEventListener('click', async event => {
        const methodButton = event.target.closest('[data-method]');
        if (methodButton) {
            method = methodButton.dataset.method === 'card' ? 'card' : 'cash';
            modal.querySelectorAll('[data-method]').forEach(button => {
                button.classList.toggle('active', button === methodButton);
                button.setAttribute('aria-pressed', String(button === methodButton));
            });
            return;
        }
        const confirmButton = event.target.closest('[data-done-confirm]');
        if (!confirmButton || confirmButton.disabled) return;
        const typed = servicesMoney();
        if (!typed.valid) {
            toast(t('slotForm.badMoney'), 'error');
            moneyInput.focus();
            return;
        }
        confirmButton.disabled = true;
        try {
            const current = await queryOne("SELECT COALESCE(status, 'completed') AS status FROM orders WHERE id = ?", [id]);
            if (!current || !OPEN_STATUSES.includes(current.status)) {
                entry.close();
                await renderPage({ keepScroll: true });
                return;
            }
            const total = typed.value + amounts.products;
            const statements = [
                {
                    query: "UPDATE orders SET status = 'completed', payment_method = ?, total = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    params: [method, total, id]
                },
                {
                    query: 'INSERT INTO payments (order_id, amount, method, received_amount, change_amount) VALUES (?, ?, ?, ?, 0)',
                    params: [id, total, method, total]
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
    if (moneyInput) moneyInput.addEventListener('input', updateTotal);
    updateTotal();
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

async function renderDashboard() {
    const { start, end } = periodRange(state.dashPeriod);
    const completed = "COALESCE(o.status, 'completed') = 'completed' AND o.date BETWEEN ? AND ?";
    // Money of each paid visit split into services and products. When the admin typed the money
    // received, the services part is that money (the order total without its products).
    const visitTotals = `
        SELECT order_id,
               SUM(CASE WHEN item_type = 'service' THEN price * quantity ELSE 0 END) AS svc,
               SUM(CASE WHEN item_type = 'service' THEN quantity ELSE 0 END) AS qty,
               SUM(CASE WHEN item_type = 'product' THEN price * quantity ELSE 0 END) AS prod
        FROM order_items GROUP BY order_id`;
    const [summaryRows, openRows, splitRows, barberRows, topProducts, topServices, salesRows, saleItemRows] = await queryMany([
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
            // Products bought by clients and products sold at the product cashier.
            query: `SELECT x.item_id, p.name, p.image_data, SUM(x.quantity) AS quantity, SUM(x.money) AS money FROM (
                        SELECT oi.item_id, oi.quantity, oi.price * oi.quantity AS money
                        FROM order_items oi JOIN orders o ON o.id = oi.order_id
                        WHERE oi.item_type = 'product' AND ${completed}
                        UNION ALL
                        SELECT i.product_id, i.quantity, i.price * i.quantity
                        FROM product_sale_items i JOIN product_sales ps ON ps.id = i.sale_id
                        WHERE ps.date BETWEEN ? AND ?
                    ) x LEFT JOIN products p ON p.id = x.item_id
                    GROUP BY x.item_id ORDER BY quantity DESC, money DESC LIMIT 5`,
            params: [start, end, start, end]
        },
        {
            // A visit's service money is shared between its services by their prices.
            query: `SELECT oi.item_id, s.name, SUM(oi.quantity) AS quantity,
                           SUM(CASE WHEN v.svc > 0 THEN (o.total - v.prod) * (oi.price * oi.quantity) / v.svc
                                    WHEN v.qty > 0 THEN (o.total - v.prod) * oi.quantity / v.qty ELSE 0 END) AS money
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    JOIN (${visitTotals}) v ON v.order_id = o.id
                    LEFT JOIN services s ON s.id = oi.item_id
                    WHERE oi.item_type = 'service' AND ${completed}
                    GROUP BY oi.item_id ORDER BY quantity DESC, money DESC LIMIT 5`,
            params: [start, end]
        },
        { query: 'SELECT COUNT(*) AS sales, COALESCE(SUM(total), 0) AS money FROM product_sales WHERE date BETWEEN ? AND ?', params: [start, end] },
        {
            query: `SELECT COALESCE(SUM(i.quantity), 0) AS quantity FROM product_sale_items i
                    JOIN product_sales ps ON ps.id = i.sale_id WHERE ps.date BETWEEN ? AND ?`,
            params: [start, end]
        }
    ]);

    const clients = Number(summaryRows[0]?.clients || 0);
    const clientsMoney = Number(summaryRows[0]?.money || 0);
    const salesMoney = Number(salesRows[0]?.money || 0);
    const total = clientsMoney + salesMoney;
    const open = Number(openRows[0]?.total || 0);
    const servicesRow = splitRows.find(row => row.item_type === 'service') || {};
    const productsRow = splitRows.find(row => row.item_type === 'product') || {};
    const clientProducts = Number(productsRow.money || 0);
    const servicesMoney = Math.max(clientsMoney - clientProducts, 0);
    const productsMoney = clientProducts + salesMoney;
    const productsSold = Number(productsRow.quantity || 0) + Number(saleItemRows[0]?.quantity || 0);
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
                <div class="kpi-sub">${escapeHtml(t('dash.productsSub', { n: productsSold }))}</div>
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
    // Product sales (no client) are only for the admin.
    const salesQueries = own ? [] : [
        {
            query: `SELECT id, date, time, total, payment_method FROM product_sales
                    WHERE date BETWEEN ? AND ? ORDER BY date DESC, time DESC, id DESC LIMIT ${limit}`,
            params: [start, end]
        },
        {
            query: `SELECT i.sale_id, i.quantity, p.name FROM product_sale_items i
                    JOIN product_sales ps ON ps.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id
                    WHERE ps.date BETWEEN ? AND ? ORDER BY i.id`,
            params: [start, end]
        },
        {
            query: `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE date BETWEEN ? AND ?
                    ORDER BY date DESC, time DESC, id DESC LIMIT ${limit}`,
            params: [start, end]
        }
    ];
    const [allBarbers, ticketRows, itemRows, saleRows = [], saleItemRows = [], expenseRows = []] = await queryMany([
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
        },
        ...salesQueries
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

    const salesMoney = sum(saleRows, sale => sale.total);
    const totalMoney = sum(tickets, ticket => ticket.total) + salesMoney;
    const expensesMoney = sum(expenseRows, expense => expense.amount);
    const saleItems = new Map();
    saleItemRows.forEach(item => {
        const list = saleItems.get(Number(item.sale_id)) || [];
        list.push(item);
        saleItems.set(Number(item.sale_id), list);
    });
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
            ${!own ? `<div class="day-stat"><span class="swatch swatch-products"></span><span>${escapeHtml(t('history.productSales'))}</span><strong>${money(salesMoney)}</strong></div>` : ''}
            <div class="day-stat day-stat-money"><span>${escapeHtml(t('dash.totalMoney'))}</span><strong>${money(totalMoney)}</strong></div>
            ${!own ? `
                <div class="day-stat"><span class="swatch swatch-expenses"></span><span>${escapeHtml(t('history.expenses'))}</span><strong>${money(expensesMoney)}</strong></div>
                <div class="day-stat day-stat-net"><span>${escapeHtml(t('history.afterExpenses'))}</span><strong>${money(totalMoney - expensesMoney)}</strong></div>` : ''}
        </div>
        ${ticketRows.length >= limit ? `<p class="notice">${escapeHtml(t('history.limited', { n: limit }))}</p>` : ''}
        ${columns.length || saleRows.length || expenseRows.length ? `
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
                                                    ${canManageTicket(ticket) ? `
                                                        <span class="hrow-buttons">
                                                            <button type="button" class="hrow-edit" data-action="edit-finished" data-id="${ticket.id}" title="${escapeHtml(t('history.editLocked'))}">${icon(editUnlocked() ? 'pencil' : 'lock')}<span>${escapeHtml(t('common.edit'))}</span></button>
                                                            <button type="button" class="hrow-edit hrow-delete" data-action="delete-finished" data-id="${ticket.id}" title="${escapeHtml(t('history.deleteLocked'))}" aria-label="${escapeHtml(t('history.deleteLocked'))}">${icon('trash')}</button>
                                                        </span>` : ''}
                                                </div>
                                            </li>`).join('')}
                                    </ol>` : `<p class="col-empty">${escapeHtml(t('history.empty'))}</p>`}
                            </div>
                        </section>`;
                }).join('')}
                ${!own ? renderSalesColumn(saleRows, saleItems, multiDay) : ''}
                ${!own ? renderExpensesColumn(expenseRows, multiDay) : ''}
            </div>` : `
            <div class="empty-hero">
                <span class="empty-hero-icon">${icon('history')}</span>
                <h2>${escapeHtml(t('history.noBarbersTitle'))}</h2>
                <p>${escapeHtml(t('history.noBarbersText'))}</p>
                <button type="button" class="btn btn-primary" data-action="go" data-page="barbers">${icon('users')}<span>${escapeHtml(t('nav.barbers'))}</span></button>
            </div>`}`;

    return { actions, body };
}

// History column with the products sold at the product cashier (admin only).
function renderSalesColumn(sales, itemsBySale, multiDay) {
    const earned = sum(sales, sale => sale.total);
    return `
        <section class="col hcol hcol-sales">
            <header class="col-head">
                <div class="col-id">
                    <span class="avatar avatar-products">${icon('bag')}</span>
                    <div class="col-name">
                        <h3>${escapeHtml(t('history.productSales'))}</h3>
                        <span class="col-note">${escapeHtml(t('history.productSalesNote'))}</span>
                    </div>
                </div>
            </header>
            <div class="hcol-totals">
                <div><span>${escapeHtml(t('history.earned'))}</span><strong>${money(earned)}</strong></div>
                <div><span>${escapeHtml(t('history.salesCount'))}</span><strong>${escapeHtml(I18N.formatNumber(sales.length))}</strong></div>
            </div>
            <div class="col-body" data-scroll-key="h-sales">
                ${sales.length ? `
                    <ol class="hlist">
                        ${sales.map(sale => `
                            <li class="hrow">
                                <div class="hrow-when">
                                    ${sale.time ? `<span>${timeLabel(sale.time)}</span>` : ''}
                                    ${multiDay ? `<small>${escapeHtml(I18N.formatDateShort(sale.date))}</small>` : ''}
                                </div>
                                <div class="hrow-main">
                                    <span class="hrow-items hrow-products">${icon('bag')}${escapeHtml(itemNames(itemsBySale.get(Number(sale.id)) || []) || t('client.removedItem'))}</span>
                                    <span class="hrow-phone">${escapeHtml(t(sale.payment_method === 'card' ? 'pay.card' : 'pay.cash'))}</span>
                                </div>
                                <div class="hrow-amount">
                                    ${money(sale.total)}
                                    <button type="button" class="hrow-edit hrow-delete" data-action="delete-sale" data-id="${sale.id}" title="${escapeHtml(t('history.deleteLocked'))}" aria-label="${escapeHtml(t('history.deleteLocked'))}">${icon('trash')}</button>
                                </div>
                            </li>`).join('')}
                    </ol>` : `<p class="col-empty">${escapeHtml(t('history.noSales'))}</p>`}
            </div>
        </section>`;
}

/* ------------------------------------------------------------------ */
/* Product cashier: products sold on their own, without a client       */
/* ------------------------------------------------------------------ */

// Products shown on the page, by id, from the last time it was drawn.
let sellProducts = new Map();

function cartLines() {
    return [...state.cart.entries()]
        .map(([id, quantity]) => ({ product: sellProducts.get(id), quantity }))
        .filter(line => line.product && line.quantity > 0);
}

function cartTotals(lines = cartLines()) {
    return {
        count: sum(lines, line => line.quantity),
        total: sum(lines, line => Number(line.product.price || 0) * line.quantity)
    };
}

function productThumb(product) {
    const image = safeImage(product?.image_data);
    return `<span class="rank-thumb">${image ? `<img src="${escapeHtml(image)}" alt="">` : icon('package')}</span>`;
}

async function renderSell() {
    const today = todayString();
    const [products, categories, summaryRows, byProduct, sales, saleItems] = await queryMany([
        { query: 'SELECT id, name, price, stock, image_data, category_id FROM products WHERE is_active = 1 ORDER BY name' },
        { query: 'SELECT id, name FROM categories ORDER BY name' },
        { query: 'SELECT COUNT(*) AS sales, COALESCE(SUM(total), 0) AS money FROM product_sales WHERE date = ?', params: [today] },
        {
            query: `SELECT i.product_id, p.name, p.image_data, SUM(i.quantity) AS quantity, SUM(i.price * i.quantity) AS money
                    FROM product_sale_items i JOIN product_sales ps ON ps.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id
                    WHERE ps.date = ? GROUP BY i.product_id ORDER BY quantity DESC, money DESC`,
            params: [today]
        },
        { query: 'SELECT id, time, total, payment_method FROM product_sales WHERE date = ? ORDER BY time DESC, id DESC LIMIT 50', params: [today] },
        {
            query: `SELECT i.sale_id, i.quantity, p.name FROM product_sale_items i
                    JOIN product_sales ps ON ps.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id
                    WHERE ps.date = ? ORDER BY i.id`,
            params: [today]
        }
    ]);

    sellProducts = new Map(products.map(product => [Number(product.id), product]));
    // Products removed from the catalog leave the sale.
    [...state.cart.keys()].forEach(id => {
        if (!sellProducts.has(id)) state.cart.delete(id);
    });
    const usedCategories = categories.filter(category => products.some(product => Number(product.category_id) === Number(category.id)));
    if (state.sellCategory !== 'all' && !usedCategories.some(category => String(category.id) === state.sellCategory)) state.sellCategory = 'all';

    const itemsBySale = new Map();
    saleItems.forEach(item => {
        const list = itemsBySale.get(Number(item.sale_id)) || [];
        list.push(item);
        itemsBySale.set(Number(item.sale_id), list);
    });
    const soldMoney = Number(summaryRows[0]?.money || 0);
    const soldCount = Number(summaryRows[0]?.sales || 0);
    const soldItems = sum(byProduct, row => row.quantity);

    const grid = products.length ? `
        <div class="filter-row sell-filters">
            <label class="search-field">${icon('search')}<input type="search" data-sell-search value="${escapeHtml(state.sellSearch)}" placeholder="${escapeHtml(t('client.searchProducts'))}" aria-label="${escapeHtml(t('client.searchProducts'))}"></label>
            ${usedCategories.length ? `
                <div class="filter-chips">
                    <button type="button" class="filter-chip ${state.sellCategory === 'all' ? 'active' : ''}" data-action="sell-category" data-value="all">${escapeHtml(t('catalog.all'))}</button>
                    ${usedCategories.map(category => `<button type="button" class="filter-chip ${state.sellCategory === String(category.id) ? 'active' : ''}" data-action="sell-category" data-value="${category.id}">${escapeHtml(category.name)}</button>`).join('')}
                </div>` : ''}
        </div>
        <div class="pick-grid sell-grid">
            ${products.map(product => {
                const quantity = state.cart.get(Number(product.id)) || 0;
                const image = safeImage(product.image_data);
                const stock = product.stock == null ? null : Number(product.stock);
                return `
                    <div class="pick ${quantity ? 'selected' : ''}" data-sell-prod="${product.id}" data-cat="${product.category_id || ''}" data-name="${escapeHtml(String(product.name || '').toLowerCase())}">
                        <button type="button" class="pick-main" data-action="sell-add" data-id="${product.id}">
                            <span class="pick-img">${image ? `<img src="${escapeHtml(image)}" alt="">` : icon('package')}</span>
                            <span class="pick-name">${escapeHtml(product.name || t('catalog.unnamedProduct'))}</span>
                            <span class="pick-price">${money(product.price)}</span>
                            ${stock == null ? '' : `<span class="pick-stock ${stock <= 0 ? 'out' : ''}">${escapeHtml(stock <= 0 ? t('catalog.outOfStock') : t('catalog.inStock', { n: stock }))}</span>`}
                        </button>
                        <div class="pick-qty">
                            <button type="button" data-action="sell-minus" data-id="${product.id}" aria-label="${escapeHtml(t('client.less'))}">${icon('minus')}</button>
                            <span data-qty>${quantity}</span>
                            <button type="button" data-action="sell-add" data-id="${product.id}" aria-label="${escapeHtml(t('client.more'))}">${icon('plus')}</button>
                        </div>
                    </div>`;
            }).join('')}
        </div>
        <p class="card-empty" data-sell-none hidden>${escapeHtml(t('catalog.noneInCategory'))}</p>` : `
        <div class="empty-hero">
            <span class="empty-hero-icon">${icon('bag')}</span>
            <h2>${escapeHtml(t('catalog.noProductsTitle'))}</h2>
            <p>${escapeHtml(t('sell.noProducts'))}</p>
            <button type="button" class="btn btn-primary" data-action="open-catalog-products">${icon('tag')}<span>${escapeHtml(t('client.openCatalog'))}</span></button>
        </div>`;

    const todayCard = `
        <section class="card sell-today">
            <h3 class="card-title">${icon('chart')}${escapeHtml(t('sell.today'))}</h3>
            <div class="sell-stats">
                <div class="sell-stat-money"><span>${escapeHtml(t('sell.todayMoney'))}</span><strong>${money(soldMoney)}</strong></div>
                <div><span>${escapeHtml(t('sell.todayItems'))}</span><strong>${escapeHtml(I18N.formatNumber(soldItems))}</strong></div>
                <div><span>${escapeHtml(t('sell.todaySales'))}</span><strong>${escapeHtml(I18N.formatNumber(soldCount))}</strong></div>
            </div>
            ${byProduct.length ? `
                <ol class="rank-list">
                    ${byProduct.map((row, index) => `
                        <li>
                            <span class="rank-num">${index + 1}</span>
                            ${productThumb(row)}
                            <span class="rank-name">${escapeHtml(row.name || t('client.removedItem'))}<small>${escapeHtml(t('dash.timesSold', { n: Number(row.quantity || 0) }))}</small></span>
                            <span class="rank-value">${money(row.money)}</span>
                        </li>`).join('')}
                </ol>
                <h4 class="sell-subtitle">${escapeHtml(t('sell.recent'))}</h4>
                <ul class="sale-list">
                    ${sales.map(sale => `
                        <li>
                            <span class="sale-time">${timeLabel(sale.time)}</span>
                            <span class="sale-items">${escapeHtml(itemNames(itemsBySale.get(Number(sale.id)) || []))}</span>
                            <span class="sale-money">${money(sale.total)}</span>
                            <button type="button" class="btn-icon btn-icon-sm sale-delete" data-action="delete-sale" data-id="${sale.id}" aria-label="${escapeHtml(t('history.deleteLocked'))}" title="${escapeHtml(t('history.deleteLocked'))}">${icon('trash')}</button>
                        </li>`).join('')}
                </ul>` : `<p class="card-empty">${escapeHtml(t('sell.noneToday'))}</p>`}
        </section>`;

    const body = `
        <div class="sell">
            <section class="sell-main">${grid}</section>
            <aside class="sell-side">
                <section class="card sell-cart" data-sell-cart>${sellCartHtml()}</section>
                ${todayCard}
            </aside>
            <div class="sell-bar" data-sell-bar>${sellBarHtml()}</div>
        </div>`;

    return { actions: '', body, after: filterSellGrid };
}

function sellCartHtml() {
    const lines = cartLines();
    const { count, total } = cartTotals(lines);
    return `
        <div class="sell-cart-head">
            <h3 class="card-title">${icon('bag')}${escapeHtml(t('sell.cart'))}</h3>
            ${lines.length ? `<button type="button" class="btn btn-ghost btn-sm" data-action="sell-clear">${icon('x')}<span>${escapeHtml(t('sell.clear'))}</span></button>` : ''}
        </div>
        ${lines.length ? `
            <ul class="sell-lines">
                ${lines.map(({ product, quantity }) => {
                    const stock = product.stock == null ? null : Number(product.stock);
                    return `
                        <li>
                            ${productThumb(product)}
                            <span class="sell-line-name">${escapeHtml(product.name || t('catalog.unnamedProduct'))}
                                <small>${money(product.price)}${stock != null && quantity > stock ? ` · <b class="sell-warn">${escapeHtml(t('sell.lowStock', { n: Math.max(stock, 0) }))}</b>` : ''}</small>
                            </span>
                            <span class="sell-qty">
                                <button type="button" data-action="sell-minus" data-id="${product.id}" aria-label="${escapeHtml(t('client.less'))}">${icon('minus')}</button>
                                <b>${quantity}</b>
                                <button type="button" data-action="sell-add" data-id="${product.id}" aria-label="${escapeHtml(t('client.more'))}">${icon('plus')}</button>
                            </span>
                            <span class="sell-line-total">${money(Number(product.price || 0) * quantity)}</span>
                        </li>`;
                }).join('')}
            </ul>` : `<p class="card-empty sell-empty">${icon('bag')}<span>${escapeHtml(t('sell.empty'))}</span></p>`}
        <div class="pay-total"><span>${escapeHtml(t('client.total'))}${count ? ` · ${escapeHtml(t('sell.items', { n: count }))}` : ''}</span><strong>${money(total)}</strong></div>
        <div class="segmented segmented-lg sell-method" role="group" aria-label="${escapeHtml(t('pay.method'))}">
            <button type="button" class="${state.sellMethod === 'cash' ? 'active' : ''}" data-action="sell-method" data-value="cash" aria-pressed="${state.sellMethod === 'cash'}">${icon('cash')}${escapeHtml(t('pay.cash'))}</button>
            <button type="button" class="${state.sellMethod === 'card' ? 'active' : ''}" data-action="sell-method" data-value="card" aria-pressed="${state.sellMethod === 'card'}">${icon('card')}${escapeHtml(t('pay.card'))}</button>
        </div>
        <button type="button" class="btn btn-primary btn-lg btn-block" data-action="sell-done" ${lines.length ? '' : 'disabled'}>${icon('check')}<span>${escapeHtml(t('done.button'))}</span></button>`;
}

// On small screens the total and Done stay at the bottom of the screen.
function sellBarHtml() {
    const { count, total } = cartTotals();
    return `
        <span class="sell-bar-count">${icon('bag')}<span>${escapeHtml(t('sell.items', { n: count }))}</span></span>
        <strong class="sell-bar-total">${money(total)}</strong>
        <button type="button" class="btn btn-primary" data-action="sell-done" ${count ? '' : 'disabled'}>${icon('check')}<span>${escapeHtml(t('done.button'))}</span></button>`;
}

function updateSellUi() {
    const cart = dom.page.querySelector('[data-sell-cart]');
    if (cart) cart.innerHTML = sellCartHtml();
    const bar = dom.page.querySelector('[data-sell-bar]');
    if (bar) bar.innerHTML = sellBarHtml();
    dom.page.querySelectorAll('[data-sell-prod]').forEach(tile => {
        const quantity = state.cart.get(Number(tile.dataset.sellProd)) || 0;
        tile.classList.toggle('selected', quantity > 0);
        tile.querySelector('[data-qty]').textContent = String(quantity);
    });
}

function filterSellGrid() {
    const search = state.sellSearch.trim().toLowerCase();
    let shown = 0;
    dom.page.querySelectorAll('[data-sell-prod]').forEach(tile => {
        const visible = (!search || tile.dataset.name.includes(search))
            && (state.sellCategory === 'all' || tile.dataset.cat === state.sellCategory);
        tile.hidden = !visible;
        if (visible) shown += 1;
    });
    const none = dom.page.querySelector('[data-sell-none]');
    if (none) none.hidden = shown > 0 || !dom.page.querySelector('[data-sell-prod]');
}

function changeCart(id, step) {
    if (!sellProducts.has(id)) return;
    const quantity = Math.max((state.cart.get(id) || 0) + step, 0);
    if (quantity) state.cart.set(id, Math.min(quantity, 999));
    else state.cart.delete(id);
    updateSellUi();
}

async function finishSale() {
    if (!isAdmin()) return;
    const lines = cartLines();
    if (!lines.length) return;
    if (lines.length * 2 + 1 > MAX_TRANSACTION_STATEMENTS) {
        toast(t('err.tooManyItems'), 'error');
        return;
    }
    const { count, total } = cartTotals(lines);
    const ok = await new Promise(resolve => {
        let accepted = false;
        const entry = openModal({
            title: t('sell.confirmTitle'),
            size: 'sm',
            body: `
                <div class="pay">
                    <ul class="pay-items">
                        ${lines.map(({ product, quantity }) => `
                            <li>
                                <span class="pay-item-icon">${icon('bag')}</span>
                                <span class="pay-item-name">${escapeHtml(product.name || t('catalog.unnamedProduct'))}${quantity > 1 ? ` <b>×${quantity}</b>` : ''}</span>
                                <span>${money(Number(product.price || 0) * quantity)}</span>
                            </li>`).join('')}
                    </ul>
                    <div class="pay-total"><span>${escapeHtml(t('client.total'))} · ${escapeHtml(t(state.sellMethod === 'card' ? 'pay.card' : 'pay.cash'))}</span><strong>${money(total)}</strong></div>
                    <p class="done-question">${icon('alert')}<span>${escapeHtml(t('sell.confirmText', { n: count }))}</span></p>
                </div>`,
            footer: `
                <span class="spacer"></span>
                <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
                <button type="button" class="btn btn-primary" data-confirm-ok>${icon('check')}<span>${escapeHtml(t('sell.yes'))}</span></button>`,
            onClose: () => resolve(accepted)
        });
        entry.modal.querySelector('[data-confirm-ok]').addEventListener('click', () => {
            accepted = true;
            entry.close();
        });
    });
    if (!ok) return;

    const statements = [{
        query: 'INSERT INTO product_sales (date, time, total, payment_method) VALUES (?, ?, ?, ?)',
        params: [todayString(), nowTime(), total, state.sellMethod === 'card' ? 'card' : 'cash']
    }];
    lines.forEach(({ product, quantity }) => {
        statements.push({
            query: 'INSERT INTO product_sale_items (sale_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
            params: [{ lastIDFrom: 0 }, Number(product.id), quantity, Number(product.price || 0)]
        });
        statements.push({
            query: 'UPDATE products SET stock = MAX(COALESCE(stock, 0) - ?, 0) WHERE id = ?',
            params: [quantity, Number(product.id)]
        });
    });
    await runStatements(statements);
    state.cart.clear();
    state.sellMethod = 'cash';
    toast(t('sell.saved', { amount: moneyText(total) }));
    await renderPage({ keepScroll: true });
}

// Deleting a sale always asks for the history password. Its products go back to stock.
async function deleteProductSale(id) {
    if (!isAdmin()) return;
    const [saleRows, items] = await queryMany([
        { query: 'SELECT id, total FROM product_sales WHERE id = ?', params: [id] },
        { query: 'SELECT product_id, quantity FROM product_sale_items WHERE sale_id = ?', params: [id] }
    ]);
    if (!saleRows[0]) {
        await renderPage({ keepScroll: true });
        return;
    }
    const ok = await requireEditPassword({
        always: true,
        text: t('lock.deleteSaleText', { amount: moneyText(saleRows[0].total) }),
        okLabel: t('common.delete'),
        danger: true
    });
    if (!ok) return;
    const statements = items.map(item => ({
        query: 'UPDATE products SET stock = COALESCE(stock, 0) + ? WHERE id = ?',
        params: [Number(item.quantity || 1), Number(item.product_id)]
    }));
    statements.push(
        { query: 'DELETE FROM product_sale_items WHERE sale_id = ?', params: [id] },
        { query: 'DELETE FROM product_sales WHERE id = ?', params: [id] }
    );
    await runStatements(statements);
    toast(t('sell.deleted'));
    await renderPage({ keepScroll: true });
}

/* ------------------------------------------------------------------ */
/* Expenses: what the shop paid (electricity, rent, ...). Owner only.  */
/* The owner types the name; nothing is added by itself. Changing an   */
/* amount later, and deleting, needs the history password.             */
/* ------------------------------------------------------------------ */

const EXPENSE_COLUMNS = 'id, name, amount, date, time';

// Times every 15 minutes, plus the exact time already chosen, so nothing has to be typed.
function expenseTimeOptions(selected) {
    const current = String(selected || '').slice(0, 5);
    const times = [];
    for (let minutes = 0; minutes < 24 * 60; minutes += 15) times.push(fromMinutes(minutes));
    if (isValidTime(current) && !times.includes(current)) times.push(current);
    times.sort();
    return times.map(time => `<option value="${time}" ${time === current ? 'selected' : ''}>${escapeHtml(I18N.formatTime(time))}</option>`).join('');
}

function expenseFields(expense = {}) {
    return `
        <label class="field expense-name-field"><span>${escapeHtml(t('expenses.name'))}</span>
            <input type="text" name="name" maxlength="80" required autocomplete="off" placeholder="${escapeHtml(t('expenses.namePh'))}" value="${escapeHtml(expense.name || '')}">
        </label>
        <label class="field"><span>${escapeHtml(t('expenses.amount'))} (${escapeHtml(I18N.currency())})</span>
            <input type="number" name="amount" min="0" step="any" inputmode="decimal" required value="${expense.amount == null ? '' : escapeHtml(expense.amount)}">
        </label>
        <label class="field"><span>${escapeHtml(t('expenses.date'))}</span>
            <input type="date" name="date" required value="${escapeHtml(expense.date || todayString())}">
        </label>
        <label class="field"><span>${escapeHtml(t('expenses.time'))}</span>
            <select name="time">${expenseTimeOptions(expense.time || nowTime())}</select>
        </label>`;
}

// Reads the fields; null (with a message) when something is missing.
function readExpenseFields(form) {
    const name = form.elements.name.value.trim();
    if (!name) {
        toast(t('expenses.needName'), 'error');
        form.elements.name.focus();
        return null;
    }
    const amount = parsePrice(form.elements.amount.value);
    if (amount == null || amount <= 0) {
        toast(t('expenses.needAmount'), 'error');
        form.elements.amount.focus();
        return null;
    }
    const date = isValidDate(form.elements.date.value) ? form.elements.date.value : todayString();
    const time = isValidTime(form.elements.time.value) ? form.elements.time.value.slice(0, 5) : nowTime();
    return { name, amount, date, time };
}

function expenseRow(expense, { showDate = true } = {}) {
    return `
        <li class="expense-row">
            <span class="expense-when">
                <strong>${timeLabel(expense.time)}</strong>
                ${showDate ? `<small>${escapeHtml(I18N.formatDateShort(expense.date))}</small>` : ''}
            </span>
            <span class="expense-what">${escapeHtml(expense.name)}</span>
            <span class="expense-amount">${money(expense.amount)}</span>
            <span class="expense-buttons">
                <button type="button" class="btn-icon btn-icon-sm" data-action="expense-edit" data-id="${expense.id}" aria-label="${escapeHtml(t('expenses.edit'))}" title="${escapeHtml(t('expenses.edit'))}">${icon('pencil')}</button>
                <button type="button" class="btn-icon btn-icon-sm sale-delete" data-action="expense-delete" data-id="${expense.id}" aria-label="${escapeHtml(t('history.deleteLocked'))}" title="${escapeHtml(t('history.deleteLocked'))}">${icon('trash')}</button>
            </span>
        </li>`;
}

async function renderExpenses() {
    const period = state.expensesPeriod;
    const { start, end } = periodRange(period, todayString());
    const [rows, totals] = await queryMany([
        {
            query: `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE date BETWEEN ? AND ?
                    ORDER BY date DESC, time DESC, id DESC LIMIT 1000`,
            params: [start, end]
        },
        { query: 'SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date BETWEEN ? AND ?', params: [start, end] }
    ]);
    const total = Number(totals[0]?.total || 0);
    const count = Number(totals[0]?.count || 0);
    const actions = segmented(periodOptions(), period, 'expenses-period', t('dash.period'));
    const body = `
        <div class="expenses">
            <section class="card expense-add">
                <h3 class="card-title">${icon('plus')}${escapeHtml(t('expenses.addTitle'))}</h3>
                <form class="expense-form" data-form="expense" autocomplete="off" novalidate>
                    ${expenseFields()}
                    <button type="submit" class="btn btn-primary expense-submit">${icon('check')}<span>${escapeHtml(t('expenses.add'))}</span></button>
                </form>
                <p class="field-hint">${icon('lock')}<span>${escapeHtml(t('expenses.hint'))}</span></p>
            </section>
            <section class="card expense-list-card">
                <div class="expense-head">
                    <h3 class="card-title">${icon('receipt')}${escapeHtml(periodLabel(period, todayString()))}</h3>
                    <div class="expense-total">
                        <span>${escapeHtml(t('expenses.total'))} · ${escapeHtml(t('expenses.count', { n: count }))}</span>
                        <strong>${money(total)}</strong>
                    </div>
                </div>
                ${rows.length
                    ? `<ul class="expense-list">${rows.map(row => expenseRow(row, { showDate: true })).join('')}</ul>`
                    : `<p class="card-empty">${escapeHtml(t('expenses.none'))}</p>`}
            </section>
        </div>`;
    return { actions, body };
}

async function addExpense(form) {
    const values = readExpenseFields(form);
    if (!values) return;
    await api.dbRun('INSERT INTO expenses (name, amount, date, time) VALUES (?, ?, ?, ?)', [values.name, values.amount, values.date, values.time]);
    toast(t('expenses.added', { name: values.name }));
    await renderPage({ keepScroll: true });
    dom.page.querySelector('[data-form="expense"] [name="name"]')?.focus({ preventScroll: true });
}

async function openExpenseEdit(id) {
    const expense = await queryOne(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ?`, [id]);
    if (!expense) {
        await renderPage({ keepScroll: true });
        return;
    }
    const entry = openModal({
        title: t('expenses.edit'),
        size: 'sm',
        body: `
            <form class="stack" data-expense-edit novalidate>
                ${expenseFields(expense)}
                <p class="field-hint">${icon('lock')}<span>${escapeHtml(t('expenses.lockText'))}</span></p>
            </form>`,
        footer: `
            <span class="spacer"></span>
            <button type="button" class="btn btn-ghost" data-modal-close>${escapeHtml(t('common.cancel'))}</button>
            <button type="button" class="btn btn-primary" data-expense-save>${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>`
    });
    const form = entry.modal.querySelector('[data-expense-edit]');
    const saveButton = entry.modal.querySelector('[data-expense-save]');
    const save = async () => {
        if (saveButton.disabled) return;
        const values = readExpenseFields(form);
        if (!values) return;
        saveButton.disabled = true;
        try {
            // A changed amount needs the history password.
            if (Number(values.amount) !== Number(expense.amount)) {
                const ok = await requireEditPassword({ text: t('expenses.lockText') });
                if (!ok) return;
            }
            await api.dbRun(
                'UPDATE expenses SET name = ?, amount = ?, date = ?, time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [values.name, values.amount, values.date, values.time, Number(expense.id)]
            );
            entry.close();
            toast(t('expenses.saved'));
            await renderPage({ keepScroll: true });
        } catch (error) {
            handleError(error);
        } finally {
            if (document.contains(saveButton)) saveButton.disabled = false;
        }
    };
    saveButton.addEventListener('click', save);
    form.addEventListener('submit', event => {
        event.preventDefault();
        save();
    });
}

async function deleteExpense(id) {
    const expense = await queryOne(`SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ?`, [id]);
    if (!expense) {
        await renderPage({ keepScroll: true });
        return;
    }
    const ok = await requireEditPassword({
        always: true,
        text: t('expenses.deleteText', { name: expense.name, amount: moneyText(expense.amount) }),
        okLabel: t('common.delete'),
        danger: true
    });
    if (!ok) return;
    await api.dbRun('DELETE FROM expenses WHERE id = ?', [Number(expense.id)]);
    toast(t('expenses.deleted'));
    await renderPage({ keepScroll: true });
}

// History column with the shop's expenses (owner only).
function renderExpensesColumn(expenses, multiDay) {
    const spent = sum(expenses, expense => expense.amount);
    return `
        <section class="col hcol hcol-expenses">
            <header class="col-head">
                <div class="col-id">
                    <span class="avatar avatar-expenses">${icon('receipt')}</span>
                    <div class="col-name">
                        <h3>${escapeHtml(t('history.expenses'))}</h3>
                        <span class="col-note">${escapeHtml(t('history.expensesNote'))}</span>
                    </div>
                </div>
            </header>
            <div class="hcol-totals">
                <div><span>${escapeHtml(t('history.spent'))}</span><strong>${money(spent)}</strong></div>
                <div><span>${escapeHtml(t('history.expenseCount'))}</span><strong>${escapeHtml(I18N.formatNumber(expenses.length))}</strong></div>
            </div>
            <div class="col-body" data-scroll-key="h-expenses">
                ${expenses.length ? `
                    <ol class="hlist">
                        ${expenses.map(expense => `
                            <li class="hrow">
                                <div class="hrow-when">
                                    ${expense.time ? `<span>${timeLabel(expense.time)}</span>` : ''}
                                    ${multiDay ? `<small>${escapeHtml(I18N.formatDateShort(expense.date))}</small>` : ''}
                                </div>
                                <div class="hrow-main">
                                    <strong>${escapeHtml(expense.name)}</strong>
                                </div>
                                <div class="hrow-amount">
                                    ${money(expense.amount)}
                                    <span class="hrow-buttons">
                                        <button type="button" class="hrow-edit" data-action="expense-edit" data-id="${expense.id}" title="${escapeHtml(t('expenses.edit'))}">${icon('pencil')}<span>${escapeHtml(t('common.edit'))}</span></button>
                                        <button type="button" class="hrow-edit hrow-delete" data-action="expense-delete" data-id="${expense.id}" title="${escapeHtml(t('history.deleteLocked'))}" aria-label="${escapeHtml(t('history.deleteLocked'))}">${icon('trash')}</button>
                                    </span>
                                </div>
                            </li>`).join('')}
                    </ol>` : `<p class="col-empty">${escapeHtml(t('history.noExpenses'))}</p>`}
            </div>
        </section>`;
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
        { query: 'SELECT b.id, b.name, p.thumb_data FROM barbers b LEFT JOIN barber_photos p ON p.barber_id = b.id WHERE b.is_active = 1 ORDER BY b.id' },
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
                                ${barberAvatar(barber, 'avatar-xl')}
                                <div class="barber-card-name">
                                    <h3>${escapeHtml(barber.name)}</h3>
                                    <span class="muted">${escapeHtml(t('barbers.column', { n: index + 1 }))}</span>
                                    <div class="barber-photo-actions">
                                        <label class="btn btn-outline btn-sm photo-pick">
                                            ${icon('image')}<span>${escapeHtml(t(barber.thumb_data ? 'photo.change' : 'photo.add'))}</span>
                                            <input type="file" accept="image/*" data-barber-photo="${barber.id}" hidden>
                                        </label>
                                        ${barber.thumb_data ? `<button type="button" class="btn btn-ghost-danger btn-sm" data-action="remove-photo" data-id="${barber.id}" data-name="${escapeHtml(barber.name)}">${icon('trash')}<span>${escapeHtml(t('photo.remove'))}</span></button>` : ''}
                                    </div>
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

// The barber's photo for the website (large) and the cashier (small).
async function saveBarberPhoto(barberId, file) {
    if (!isAdmin() || !file) return;
    const [image, thumb] = await Promise.all([readImageFile(file, 900), readImageFile(file, 160)]);
    if (!image || !thumb) return;
    await runStatements([{
        query: 'INSERT OR REPLACE INTO barber_photos (barber_id, image_data, thumb_data, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        params: [Number(barberId), image, thumb]
    }]);
    toast(t('photo.saved'));
    await renderPage({ keepScroll: true });
}

async function removeBarberPhoto(barberId, name) {
    if (!isAdmin()) return;
    if (!await confirmDialog(t('photo.confirmRemove', { name }), { okLabel: t('photo.remove'), danger: true })) return;
    await runStatements([{ query: 'DELETE FROM barber_photos WHERE barber_id = ?', params: [Number(barberId)] }]);
    toast(t('photo.removed'));
    await renderPage({ keepScroll: true });
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
    const [settingsBarbers, settingsSlotRows, siteRows, upcomingRows, socialRows] = await queryMany([
        { query: 'SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY id' },
        BARBER_SLOT_QUERY,
        { query: 'SELECT value FROM app_options WHERE key = ?', params: [SITE_OPEN_KEY] },
        {
            query: `SELECT COUNT(*) AS count FROM online_bookings ob JOIN orders o ON o.id = ob.order_id
                    WHERE o.status = 'waiting' AND o.date >= ?`,
            params: [todayString()]
        },
        { query: 'SELECT key, value FROM app_options WHERE key IN (?, ?)', params: [INSTAGRAM_KEY, WHATSAPP_KEY] }
    ]);
    const siteOpen = String(siteRows[0]?.value ?? '1') !== '0';
    const social = Object.fromEntries(socialRows.map(row => [row.key, row.value == null ? '' : String(row.value)]));

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
                        <input type="text" name="shop_name" maxlength="60" value="${escapeHtml(state.shopName || 'XOSHAWI BARBER')}">
                    </label>
                    <div class="grid-2">
                        <label class="field"><span>${escapeHtml(t('settings.phone'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="tel" name="phone" maxlength="30" dir="ltr" value="${escapeHtml(settings.phone || '')}">
                        </label>
                        <label class="field"><span>${escapeHtml(t('settings.address'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="text" name="address" maxlength="160" value="${escapeHtml(settings.address || '')}">
                        </label>
                    </div>
                    <div class="grid-2">
                        <label class="field"><span>${escapeHtml(t('settings.instagram'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="text" name="instagram" maxlength="120" dir="ltr" autocomplete="off" spellcheck="false" placeholder="@xbarber" value="${escapeHtml(social[INSTAGRAM_KEY] || '')}">
                        </label>
                        <label class="field"><span>${escapeHtml(t('settings.whatsapp'))} <em>${escapeHtml(t('common.optional'))}</em></span>
                            <input type="tel" name="whatsapp" maxlength="30" dir="ltr" autocomplete="off" placeholder="0750 123 4567" value="${escapeHtml(social[WHATSAPP_KEY] || '')}">
                        </label>
                    </div>
                    <p class="field-hint">${escapeHtml(t('settings.socialHint'))}</p>
                    <div><button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button></div>
                </form>
            </section>
            ${renderHoursCard(booking, settingsBarbers, parseBarberSlots(settingsSlotRows))}
            ${renderSiteCard(booking, siteOpen, Number(upcomingRows[0]?.count || 0))}
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
                <h3 class="card-title">${icon('key')}${escapeHtml(t('owner.title'))}</h3>
                <p class="card-text">${escapeHtml(t('owner.text'))}</p>
                <form class="stack" data-form="admin-password" autocomplete="off">
                    <input type="text" name="username" value="admin" autocomplete="username" hidden>
                    <label class="field"><span>${escapeHtml(t('owner.current'))}</span>
                        <input type="password" name="current" maxlength="100" autocomplete="current-password" required>
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
                <p class="card-text">${escapeHtml(t(state.serverMode ? 'settings.dataServer' : isLocal ? 'settings.dataLocal' : 'settings.dataShared'))}</p>
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
    return { actions: '', body, after: settingsAfterRender };
}

function settingsAfterRender() {
    if (!state.focusHours) return;
    state.focusHours = false;
    dom.page.querySelector('.hours-card')?.scrollIntoView({ block: 'start' });
}

// Instagram and WhatsApp for the website footer (Settings, Shop).
const INSTAGRAM_KEY = 'shop.instagram';
const WHATSAPP_KEY = 'shop.whatsapp';

// "@name", "name" or a link to the profile; the server turns it into the link.
function instagramName(value) {
    const text = String(value || '').trim();
    const match = /^(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(text)
        || /^@?([A-Za-z0-9._]{1,30})$/.exec(text);
    return match ? match[1] : '';
}

async function saveShop(form) {
    const shopName = form.elements.shop_name.value.trim() || 'XOSHAWI BARBER';
    const phone = form.elements.phone.value.trim();
    const address = form.elements.address.value.trim();
    const instagramText = form.elements.instagram.value.trim();
    const instagram = instagramName(instagramText);
    if (instagramText && !instagram) {
        toast(t('settings.badInstagram'), 'error');
        form.elements.instagram.focus();
        return;
    }
    const whatsapp = form.elements.whatsapp.value.trim();
    const whatsappDigits = whatsapp.replace(/\D+/g, '');
    if (whatsapp && (whatsappDigits.length < 7 || whatsappDigits.length > 15)) {
        toast(t('settings.badWhatsapp'), 'error');
        form.elements.whatsapp.focus();
        return;
    }
    await runStatements([
        {
            query: "INSERT INTO settings (shop_name, phone, address, currency) VALUES (?, ?, ?, 'IQD')",
            params: [shopName, phone || null, address || null]
        },
        setOption(INSTAGRAM_KEY, instagram ? `@${instagram}` : ''),
        setOption(WHATSAPP_KEY, whatsapp)
    ]);
    form.elements.instagram.value = instagram ? `@${instagram}` : '';
    state.shopName = shopName;
    applyStaticText();
    renderNav();
    toast(t('toast.saved'));
}

async function backupDatabase() {
    // The browser app (offline or online) downloads the backup file.
    if (window.webApi) {
        const result = await api.backupDatabase();
        toast(t('settings.backupDownloaded', { file: result }));
        return;
    }
    const path = await promptDialog({ title: t('settings.backup'), label: t('settings.backupPath'), placeholder: 'C:\\backup\\xbarber.db', okLabel: t('settings.backup'), maxLength: 400 });
    if (!path) return;
    await api.backupDatabase(path);
    toast(t('settings.backupSaved', { file: path }));
}

async function restoreDatabase() {
    if (!await confirmDialog(t('confirm.restore'), { okLabel: t('settings.restore'), danger: true })) return;
    if (window.webApi) {
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
    const ok = await requireEditPassword({ always: true, text: t('lock.clearText'), okLabel: t('settings.clearButton'), danger: true });
    if (!ok) return;
    const finished = "SELECT id FROM orders WHERE COALESCE(status, 'completed') IN ('completed', 'cancelled')";
    await runStatements([
        // Online bookings keep their last status so the website is not told they were cancelled.
        { query: `UPDATE online_bookings SET status = 'completed', order_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE order_id IN (${finished})`, params: [] },
        { query: `DELETE FROM payments WHERE order_id IN (${finished}) OR order_id NOT IN (SELECT id FROM orders)`, params: [] },
        { query: `DELETE FROM order_items WHERE order_id IN (${finished}) OR order_id NOT IN (SELECT id FROM orders)`, params: [] },
        { query: "DELETE FROM orders WHERE COALESCE(status, 'completed') IN ('completed', 'cancelled')", params: [] },
        { query: 'DELETE FROM product_sale_items', params: [] },
        { query: 'DELETE FROM product_sales', params: [] },
        { query: 'DELETE FROM expenses', params: [] },
        { query: "DELETE FROM appointments WHERE date < ? OR COALESCE(status, 'scheduled') IN ('completed', 'cancelled', 'transferred')", params: [todayString()] }
    ]);
    toast(t('settings.cleared'));
}

/* ------------------------------------------------------------------ */
/* Booking website                                                     */
/*                                                                     */
/* When the cashier runs online (server.js on the shop's VPS), the     */
/* booking website on the same server reads the same database. Free    */
/* times come straight from the cashier, and a booking becomes a       */
/* waiting client in the chosen barber's slot. See docs/WEBSITE.md.    */
/* ------------------------------------------------------------------ */

// Settings saved as app_options "booking.<name>". How slots are made: src/js/slots.js.
const BOOKING_DEFAULTS = {
    open: XSlots.DEFAULTS.open,
    close: XSlots.DEFAULTS.close,
    slot: String(XSlots.DEFAULTS.slot),
    days: String(XSlots.DEFAULTS.days),
    closed: ''
};
// "0" closes online booking for a while; anything else (or nothing) keeps it open.
const SITE_OPEN_KEY = 'site.open';
const BOOKING_WATCH_MS = 20000;
let bookingWatchTimer = null;
let bookingWatchLast = null;

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

// "12:00 AM" as a closing time reads as "Midnight".
function closingLabel(time) {
    return String(time).slice(0, 5) === '00:00' ? t('slots.midnight') : I18N.formatTime(time);
}

function websiteAddress() {
    return `${window.location.origin}/`;
}

// Settings card for the booking website. It only works when the cashier runs online on the server.
function renderSiteCard(options, siteOpen, upcoming) {
    if (!state.serverMode) {
        return `
            <section class="card card-wide site-card">
                <h3 class="card-title">${icon('globe')}${escapeHtml(t('site.title'))}</h3>
                <p class="card-text">${escapeHtml(t('site.localText'))}</p>
            </section>`;
    }
    const days = clampInt(options.days, 0, 60, 14);
    // From "today only" up to two months ahead. Each barber can also choose their own (on the board).
    const dayChoices = [...new Set([...DAYS_AHEAD_CHOICES, days])].sort((a, b) => a - b);
    const dayLabel = daysAheadLabel;
    const address = websiteAddress();
    return `
        <section class="card card-wide site-card">
            <div class="booking-head">
                <h3 class="card-title">${icon('globe')}${escapeHtml(t('site.title'))}</h3>
                <span class="booking-status" data-state="${siteOpen ? 'ok' : 'off'}"><span class="status-dot"></span>${escapeHtml(t(siteOpen ? 'site.statusOpen' : 'site.statusClosed'))}</span>
            </div>
            <p class="card-text">${escapeHtml(t('site.text'))}</p>
            <a class="site-link" href="${escapeHtml(address)}" target="_blank" rel="noopener">${icon('globe')}<bdi dir="ltr">${escapeHtml(address.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</bdi></a>
            <form class="stack" data-form="site" autocomplete="off">
                <label class="switch-row">
                    <input type="checkbox" name="open" ${siteOpen ? 'checked' : ''}>
                    <span class="switch" aria-hidden="true"></span>
                    <span class="switch-text"><strong>${escapeHtml(t('site.enable'))}</strong><small>${escapeHtml(t('site.enableHint'))}</small></span>
                </label>
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('booking.daysAhead'))}</span>
                        <select name="days">${dayChoices.map(value => `<option value="${value}" ${value === days ? 'selected' : ''}>${escapeHtml(dayLabel(value))}</option>`).join('')}</select>
                    </label>
                    <p class="field-hint booking-hours-hint">${icon('clock')}<span>${escapeHtml(t('booking.hoursHint'))}</span></p>
                </div>
                <div class="button-row booking-actions">
                    <button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button>
                    <span class="booking-count">${escapeHtml(t('site.upcoming', { n: upcoming }))}</span>
                </div>
            </form>
        </section>`;
}

async function saveSiteSettings(form) {
    await runStatements([
        setOption(SITE_OPEN_KEY, form.elements.open.checked ? '1' : '0'),
        ...bookingOptionStatements({ days: String(clampInt(form.elements.days.value, 0, 60, 14)) })
    ]);
    await loadBookingOptions();
    toast(t('toast.saved'));
    if (state.page === 'settings' && !modalStack.length) await renderPage({ keepScroll: true });
}

// Online cashier: bookings made on the website show up by themselves, with a message.
function startBookingWatch() {
    stopBookingWatch();
    if (!state.serverMode) return;
    bookingWatchLast = null;
    checkNewBookings().catch(error => console.warn('Could not check for new bookings:', error));
    bookingWatchTimer = setInterval(() => {
        checkNewBookings().catch(error => console.warn('Could not check for new bookings:', error));
    }, BOOKING_WATCH_MS);
}

function stopBookingWatch() {
    clearInterval(bookingWatchTimer);
    bookingWatchTimer = null;
}

async function checkNewBookings() {
    if (!state.signedIn || !state.serverMode) return;
    const latest = await queryOne('SELECT MAX(rowid) AS id FROM online_bookings');
    const latestId = Number(latest?.id || 0);
    if (bookingWatchLast == null) {
        bookingWatchLast = latestId;
        return;
    }
    if (latestId <= bookingWatchLast) return;
    // A barber hears only about their own bookings.
    const mine = isAdmin() ? '' : ' AND ob.barber_id = ?';
    const rows = await api.dbQuery(
        `SELECT ob.customer_name, ob.date, ob.time, b.name AS barber
         FROM online_bookings ob JOIN orders o ON o.id = ob.order_id LEFT JOIN barbers b ON b.id = ob.barber_id
         WHERE ob.rowid > ? AND ob.rowid <= ?${mine} ORDER BY ob.rowid LIMIT 50`,
        isAdmin() ? [bookingWatchLast, latestId] : [bookingWatchLast, latestId, myBarberId()]
    );
    bookingWatchLast = latestId;
    if (!rows.length) return;
    if (rows.length === 1) {
        const booking = rows[0];
        toast(t('booking.newOne', {
            name: booking.customer_name || t('cashier.walkIn'),
            barber: booking.barber || t('cashier.anyBarber'),
            when: `${I18N.formatDateShort(booking.date)} ${I18N.formatTime(booking.time)}`
        }));
    } else {
        toast(t('booking.newMany', { n: rows.length }));
    }
    if (!modalStack.length && !state.slotForm && state.addSlot == null && ['cashier', 'dashboard'].includes(state.page)) {
        renderPage({ keepScroll: true });
    }
}

// Shops that kept the old default closed at 10 PM; the shop is open until midnight.
async function migrateHoursToMidnight() {
    if (state.serverMode) return; // the server does this itself
    try {
        const done = await queryOne("SELECT name FROM app_migrations WHERE name = 'hours-midnight-v1'");
        if (done) return;
        const close = await queryOne("SELECT value FROM app_options WHERE key = 'booking.close'");
        const statements = [{ query: "INSERT OR IGNORE INTO app_migrations (name) VALUES ('hours-midnight-v1')", params: [] }];
        if (close && String(close.value) === '22:00') statements.push(setOption('booking.close', '00:00'));
        await runStatements(statements);
    } catch (error) {
        console.warn('Could not update the opening hours:', error);
    }
}

// Opening hours, time between clients and closed days. The cashier makes its time slots from
// these, and the website shows the same free times.
function renderHoursCard(options, barbers = [], barberSlots = new Map()) {
    const hours = shopHours(options);
    const barberRows = barbers.map(barber => {
        const step = barberStep(hours, barberSlots, barber.id);
        return `
            <div class="barber-time">
                <span class="avatar avatar-sm">${escapeHtml(initials(barber.name))}</span>
                <strong>${escapeHtml(barber.name)}</strong>
                <div class="hours-slot">
                    <div class="segmented" role="group" aria-label="${escapeHtml(t('slots.everyLabel', { name: barber.name }))}">
                        ${SLOT_PRESETS.map(value => `<button type="button" class="${value === step ? 'active' : ''}" data-set-slot="${value}" aria-pressed="${value === step}">${escapeHtml(I18N.formatNumber(value))}</button>`).join('')}
                    </div>
                    <span class="money-input hours-minutes">
                        <input type="number" min="5" max="240" step="1" inputmode="numeric" value="${step}" data-barber-slot="${barber.id}" aria-label="${escapeHtml(t('slots.everyLabel', { name: barber.name }))}">
                        <span>${escapeHtml(t('slots.min'))}</span>
                    </span>
                </div>
            </div>`;
    }).join('');
    // The week starts on Saturday in Iraq.
    const weekOrder = [6, 0, 1, 2, 3, 4, 5];
    return `
        <section class="card card-wide hours-card">
            <h3 class="card-title">${icon('clock')}${escapeHtml(t('hours.title'))}</h3>
            <p class="card-text">${escapeHtml(t('hours.text'))}</p>
            <form class="stack" data-form="hours" autocomplete="off">
                <div class="grid-2">
                    <label class="field"><span>${escapeHtml(t('booking.open'))}</span>
                        <select name="open">${hourChoices(hours.open, false)}</select>
                    </label>
                    <label class="field"><span>${escapeHtml(t('booking.close'))}</span>
                        <select name="close">${hourChoices(hours.close, true)}</select>
                    </label>
                </div>
                <div class="field">
                    <span>${escapeHtml(t('hours.perBarber'))}</span>
                    ${barberRows ? `<div class="barber-times">${barberRows}</div>` : `<p class="field-hint">${escapeHtml(t('hours.noBarbers'))}</p>`}
                    <small class="field-hint">${escapeHtml(t('hours.perBarberHint'))}</small>
                </div>
                <div class="field">
                    <span>${escapeHtml(t('booking.closedDays'))}</span>
                    <div class="day-checks">
                        ${weekOrder.map(day => `
                            <label class="day-check">
                                <input type="checkbox" name="closed" value="${day}" ${hours.closed.includes(day) ? 'checked' : ''}>
                                <span>${escapeHtml(I18N.weekdayName(day))}</span>
                            </label>`).join('')}
                    </div>
                </div>
                <div><button type="submit" class="btn btn-primary">${icon('check')}<span>${escapeHtml(t('common.save'))}</span></button></div>
            </form>
        </section>`;
}

// Ready-made opening and closing times every 30 minutes, so nothing has to be typed.
// Closing times end with midnight (12:00 AM).
function hourChoices(selected, closing) {
    const times = [];
    for (let minutes = closing ? 30 : 0; minutes < 24 * 60; minutes += 30) times.push(fromMinutes(minutes));
    if (closing) times.push('00:00');
    const current = String(selected || '').slice(0, 5);
    if (isValidTime(current) && !times.includes(current)) {
        times.push(current);
        times.sort((a, b) => (closing ? closingMinutes(a) - closingMinutes(b) : toMinutes(a) - toMinutes(b)));
    }
    return times.map(time => `<option value="${time}" ${time === current ? 'selected' : ''}>${escapeHtml(closing ? closingLabel(time) : I18N.formatTime(time))}</option>`).join('');
}

async function saveHours(form) {
    const open = isValidTime(form.elements.open.value) ? form.elements.open.value.slice(0, 5) : BOOKING_DEFAULTS.open;
    const close = isValidTime(form.elements.close.value) ? form.elements.close.value.slice(0, 5) : BOOKING_DEFAULTS.close;
    if (closingMinutes(close) <= toMinutes(open)) {
        toast(t('booking.badHours'), 'error');
        form.elements.close.focus();
        return false;
    }
    // Every barber's own time between clients.
    const barberStatements = [];
    for (const input of form.querySelectorAll('[data-barber-slot]')) {
        const minutes = clampInt(input.value, 5, 240, null);
        if (minutes == null) {
            toast(t('slots.badLength'), 'error');
            input.focus();
            return false;
        }
        barberStatements.push(setOption(`slot.barber.${Number(input.dataset.barberSlot)}`, String(minutes)));
    }
    await runStatements([
        ...bookingOptionStatements({
            open,
            close,
            closed: [...form.querySelectorAll('[name="closed"]:checked')].map(input => input.value).join(',')
        }),
        ...barberStatements
    ]);
    await loadBookingOptions();
    toast(t('toast.saved'));
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
        state.slotForm = null;
        state.addSlot = null;
        return renderPage();
    },
    'board-today': () => {
        state.boardDate = todayString();
        state.slotForm = null;
        state.addSlot = null;
        return renderPage();
    },
    'board-goto': element => {
        if (isValidDate(element.dataset.date)) state.boardDate = element.dataset.date;
        state.slotForm = null;
        state.addSlot = null;
        return renderPage();
    },
    'slot-add': element => openSlotForm(Number(element.dataset.barber), element.dataset.time),
    'slot-edit': element => openSlotEdit(Number(element.dataset.id)),
    'slot-cancel': () => closeSlotForm(),
    'slot-remove': element => removeOpenClient(Number(element.dataset.id)),
    'slot-length': element => saveSlotLength(element.dataset.barber, element.dataset.value),
    'toggle-work': element => toggleWork(element.dataset.barber, element.dataset.off === '1'),
    'toggle-online': element => toggleOnline(element.dataset.barber, element.dataset.online === '1'),
    'add-slot-open': element => {
        state.addSlot = Number(element.dataset.barber);
        state.addSlotFocus = true;
        return renderPage({ keepScroll: true });
    },
    'add-slot-pick': element => addExtraSlot(element.dataset.barber, element.dataset.time),
    'add-slot-cancel': () => {
        state.addSlot = null;
        return renderPage({ keepScroll: true });
    },
    'remove-extra-slot': element => removeExtraSlot(element.dataset.barber, element.dataset.time),
    'skip-slot': element => skipSlot(element.dataset.barber, element.dataset.time),
    'toggle-past': () => {
        state.showPast = !state.showPast;
        return renderPage({ keepScroll: true });
    },
    'open-hours': () => {
        state.focusHours = true;
        return go('settings');
    },
    'done-client': element => openDoneDialog(Number(element.dataset.id)),
    'take-client': element => takeClient(Number(element.dataset.id)),
    'back-to-waiting': element => backToWaiting(Number(element.dataset.id)),
    'undo-pay': element => undoPayment(Number(element.dataset.id)),
    'edit-finished': element => editFinished(Number(element.dataset.id)),
    'delete-finished': element => deleteFinishedClient(Number(element.dataset.id)),
    'lock-editing': () => {
        lockEditing();
        toast(t('history.locked'));
        return renderPage({ keepScroll: true });
    },
    'sell-add': element => changeCart(Number(element.dataset.id), 1),
    'sell-minus': element => changeCart(Number(element.dataset.id), -1),
    'sell-clear': () => {
        state.cart.clear();
        updateSellUi();
    },
    'sell-method': element => {
        state.sellMethod = element.dataset.value === 'card' ? 'card' : 'cash';
        updateSellUi();
    },
    'sell-category': element => {
        state.sellCategory = element.dataset.value || 'all';
        dom.page.querySelectorAll('[data-action="sell-category"]').forEach(button => {
            button.classList.toggle('active', button === element);
        });
        filterSellGrid();
    },
    'sell-done': () => finishSale(),
    'delete-sale': element => deleteProductSale(Number(element.dataset.id)),
    'expense-edit': element => openExpenseEdit(Number(element.dataset.id)),
    'expense-delete': element => deleteExpense(Number(element.dataset.id)),
    'expenses-period': element => {
        state.expensesPeriod = element.dataset.value;
        renderPage();
    },
    'open-catalog-products': () => {
        state.catalogTab = 'products';
        return go('catalog');
    },
    'barber-account': element => openAccountModal(Number(element.dataset.id)),
    'remove-photo': element => removeBarberPhoto(element.dataset.id, element.dataset.name || ''),
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

const busyActions = new Set([
    'take-client', 'back-to-waiting', 'undo-pay', 'done-client', 'slot-add', 'slot-edit', 'slot-remove', 'slot-length', 'toggle-work', 'toggle-online', 'remove-extra-slot', 'skip-slot', 'add-slot-pick',
    'edit-finished', 'delete-finished', 'delete-sale', 'expense-delete', 'sell-done', 'barber-account', 'clear-history', 'remove-photo'
]);

document.addEventListener('click', event => {
    const dateInput = event.target.closest('input[type="date"][data-date-input]');
    if (dateInput && typeof dateInput.showPicker === 'function') {
        try {
            dateInput.showPicker();
        } catch (error) {
            // Some browsers only open the picker from the native control itself.
        }
    }

    // Choosing a service or a saved client inside the slot form.
    if (onSlotFormClick(event)) return;

    // Quick choices for the time between clients in Settings.
    const preset = event.target.closest('[data-set-slot]');
    if (preset) {
        const row = preset.closest('.hours-slot');
        row.querySelector('input').value = preset.dataset.setSlot;
        row.querySelectorAll('[data-set-slot]').forEach(button => {
            button.classList.toggle('active', button === preset);
            button.setAttribute('aria-pressed', String(button === preset));
        });
        return;
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

document.addEventListener('input', event => {
    if (event.target.closest('[data-form="slot"]')) {
        onSlotFormInput(event.target);
        return;
    }
    if (event.target.matches('[data-sell-search]')) {
        state.sellSearch = event.target.value;
        filterSellGrid();
        return;
    }
    // Typing a number of minutes in Settings clears the quick choice that no longer matches.
    if (event.target.matches('[data-form="hours"] [data-barber-slot]')) {
        const value = Number(event.target.value);
        event.target.closest('.hours-slot').querySelectorAll('[data-set-slot]').forEach(button => {
            const active = Number(button.dataset.setSlot) === value;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }
});

document.addEventListener('change', event => {
    if (event.target.closest('[data-form="slot"]')) {
        onSlotFormInput(event.target);
        return;
    }
    if (event.target.matches('[data-barber-photo]')) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) saveBarberPhoto(event.target.dataset.barberPhoto, file).catch(handleError);
        return;
    }
    if (event.target.matches('[data-add-slot-other]')) {
        if (event.target.value) addExtraSlot(event.target.dataset.barber, event.target.value).catch(handleError);
        return;
    }
    if (event.target.matches('[data-barber-days]')) {
        saveBarberDays(event.target.dataset.barberDays, event.target.value).catch(handleError);
        return;
    }
    if (event.target.matches('[data-slot-custom]')) {
        if (event.target.value.trim() !== '') saveSlotLength(event.target.dataset.barber, event.target.value).catch(handleError);
        return;
    }
    const input = event.target.closest('[data-date-input]');
    if (!input || !isValidDate(input.value)) return;
    if (input.dataset.dateInput === 'board') {
        state.boardDate = input.value;
        state.slotForm = null;
        state.addSlot = null;
    } else if (input.dataset.dateInput === 'history') {
        state.historyDay = input.value;
        state.historyPeriod = 'day';
    }
    renderPage();
});

document.addEventListener('keydown', event => {
    // Enter in the "other minutes" box saves it.
    if (event.key === 'Enter' && event.target.matches('[data-slot-custom]')) {
        event.preventDefault();
        event.target.blur();
    }
});

document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.form === 'slot') {
        saveSlotForm().catch(handleError);
    } else if (form.dataset.form === 'add-barber') {
        addBarber(form.elements.name.value).catch(handleError);
    } else if (form.dataset.form === 'expense') {
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        button.disabled = true;
        addExpense(form)
            .catch(handleError)
            .finally(() => {
                if (document.contains(button)) button.disabled = false;
            });
    } else if (form.dataset.form === 'shop') {
        saveShop(form).catch(handleError);
    } else if (form.dataset.form === 'history-password') {
        saveHistoryPassword(form).catch(handleError);
    } else if (['hours', 'site', 'admin-password'].includes(form.dataset.form)) {
        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        const save = { hours: saveHours, site: saveSiteSettings, 'admin-password': saveAdminPassword }[form.dataset.form];
        save(form)
            .catch(handleError)
            .finally(() => {
                if (button && document.contains(button)) button.disabled = false;
            });
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modalStack.length && state.slotForm && event.target.closest?.('[data-form="slot"]')) {
        closeSlotForm().catch(handleError);
        return;
    }
    if (event.key !== 'Escape' || !modalStack.length) return;
    // The finished client form is not closed by Escape so typed details are never lost by accident.
    const top = modalStack[modalStack.length - 1];
    if (top.dismissible) top.close();
});

// The board refreshes by itself, but not while a form is open or a field is being typed in.
function autoRefresh() {
    if (!state.signedIn || modalStack.length || state.slotForm || state.addSlot != null || document.visibilityState !== 'visible') return;
    if (!['cashier', 'dashboard'].includes(state.page)) return;
    if (document.activeElement && document.activeElement.matches('input, select, textarea')) return;
    renderPage({ keepScroll: true });
}

setInterval(autoRefresh, REFRESH_INTERVAL_MS);
document.addEventListener('visibilitychange', autoRefresh);

dom.loginForm.addEventListener('submit', handleLogin);
I18N.apply();
applyStaticText();
renderLanguageSwitches();
