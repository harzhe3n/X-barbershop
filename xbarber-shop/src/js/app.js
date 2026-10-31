// XBARBER SHOP - Main Application Logic

const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const navLinks = document.querySelectorAll('.nav-link');
const pages = document.querySelectorAll('.page');

const api = window.electronAPI || window.webApi;
if (!api) throw new Error('XBARBER SHOP needs its desktop API or the hosted offline app; do not open it as a file.');
const languageStorageKey = 'xbarber-interface-language';
const soraniTranslations = {
    'XBARBER SHOP': 'XBARBER SHOP',
    'Visit History': 'مێژووی سەردان',
    'Overview': 'پوختەی گشتی',
    'Sales History': 'مێژووی فرۆشتن',
    'Print': 'چاپکردن',
    'Appointment List': 'لیستی وادەکان',
    'Choose a day, week, or month to preview appointments with customer contact details and arrival times.': 'ڕۆژ، هەفتە، یان مانگێک هەڵبژێرە بۆ بینینی وادەکان لەگەڵ ناو، ژمارەی تەلەفۆن و کاتی هاتن.',
    'Period': 'ماوە',
    'Day': 'ڕۆژ',
    'Week': 'هەفتە',
    'Month': 'مانگ',
    'Date to use': 'ڕێکەوت',
    'Show Appointments': 'پیشاندانی وادەکان',
    'Save as PDF': 'پاشەکەوتکردن وەک PDF',
    'Clear All History': 'سڕینەوەی هەموو مێژوو',
    'Permanently deletes sales/orders and past appointment history. Active and future appointments are kept.': 'مێژووی فرۆشتن و وادەکانی پێشوو بە هەمیشەیی دەسڕێتەوە. وادە چالاک و داهاتووەکان دەمێننەوە.',
    'Choose a day, week, or month to preview appointments.': 'ڕۆژ، هەفتە، یان مانگێک هەڵبژێرە بۆ بینینی وادەکان.',
    'No appointments in this period.': 'لەو ماوەیەدا هیچ وادەیەک نییە.',
    'Date': 'ڕێکەوت',
    'Arrival time': 'کاتی هاتن',
    'Status': 'بار',
    'Could not load appointments for printing.': 'نەتوانرا وادەکان بۆ چاپکردن بار بکرێن.',
    'Could not create PDF:': 'نەتوانرا PDF دروست بکرێت:',
    'Appointment PDF saved:': 'PDFی وادەکان پاشەکەوت کرا:',
    'History cleared. Upcoming appointments were kept.': 'مێژوو سڕایەوە. وادەکانی داهاتوو پارێزران.',
    'Could not clear history:': 'نەتوانرا مێژوو بسڕدرێتەوە:',
    'Delete all sales/orders and past appointment history? Active and future appointments will remain. This cannot be undone.': 'هەموو مێژووی فرۆشتن و وادەکانی پێشوو بسڕدرێتەوە؟ وادە چالاک و داهاتووەکان دەمێننەوە. ئەم کارە ناگەڕێتەوە.',
    'Swipe left or right to switch views': 'بۆ گۆڕینی دیمەنەکان بۆ چەپ یان ڕاست بسوڕێوە',
    'No completed orders yet.': 'هێشتا هیچ ئۆردەرێکی تەواوکراو نییە.',
    'Catalog': 'کاتالۆگ',
    'Customer List': 'لیستی کڕیارەکان',
    'All Orders': 'کۆی ئۆردەرەکان',
    'Select all': 'هەمووی هەڵبژێرە',
    'selected': 'هەڵبژێردراو',
    'Delete Selected': 'سڕینەوەی هەڵبژێردراوەکان',
    'Delete All History': 'سڕینەوەی هەموو مێژوو',
    'Delete selected history items? This cannot be undone.': 'دانە هەڵبژێردراوەکانی مێژوو بسڕدرێنەوە؟ ئەم کارە ناگەڕێتەوە.',
    'Delete all past visit history? Future appointments will remain. This cannot be undone.': 'هەموو مێژووی سەردانە پێشووەکان بسڕدرێنەوە؟ وادەکانی داهاتوو دەمێننەوە. ئەم کارە ناگەڕێتەوە.',
    'New Appointment': 'وادەی نوێ',
    'Add Appointment': 'زیادکردنی وادە',
    'Save Appointment': 'پاشەکەوتکردنی وادە',
    'Appointment saved successfully.': 'وادەکە بە سەرکەوتوویی پاشەکەوت کرا.',
    'Appointment deleted.': 'وادەکە سڕایەوە.',
    'No appointments for this date.': 'هیچ وادەیەک بۆ ئەم ڕێکەوتە نییە.',
    'Select a date to view appointments.': 'ڕێکەوتێک هەڵبژێرە بۆ بینینی وادەکان.',
    'No appointment history yet.': 'هێشتا مێژووی وادە نییە.',
    'Customer Name (Optional)': 'ناوی کڕیار (ئارەزوومەندانە)',
    'Phone Number (Optional)': 'ژمارەی تەلەفۆن (ئارەزوومەندانە)',
    'New customer or walk-in': 'کڕیاری نوێ یان کڕیاری بێ وادە',
    'No services available.': 'هیچ خزمەتگوزارییەک بەردەست نییە.',
    'No services available': 'هیچ خزمەتگوزارییەک بەردەست نییە',
    'No products available.': 'هیچ بەرهەمێک بەردەست نییە.',
    'No customers yet.': 'هێشتا کڕیار نییە.',
    'No items in the order.': 'هیچ دانەیەک لە ئۆردەرەکەدا نییە.',
    'Could not load appointments.': 'نەتوانرا وادەکان بار بکرێن.',
    'Could not save product:': 'نەتوانرا بەرهەم پاشەکەوت بکرێت:',
    'Enter a product name, a valid non-negative price, and a whole-number stock quantity.': 'ناوی بەرهەم، نرخێکی دروست و بێ نەرێنی، و ژمارەیەکی تەواوی کۆگا بنووسە.',
    'Remove this customer from active customers? Past appointments will remain in history.': 'ئەم کڕیارە لە لیستی چالاک بسڕدرێتەوە؟ وادەکانی پێشوو لە مێژوودا دەمێننەوە.',
    'Recorded Appointments': 'وادە تۆمارکراوەکان',
    'Completed Visits': 'سەردانی تەواوکراو',
    'Current Order': 'ئۆردەری ئێستا',
    'Order Summary': 'پوختەی ئۆردەر',
    'Complete Order': 'تەواوکردنی ئۆردەر',
    'Could not complete order.': 'نەتوانرا ئۆردەرەکە تەواو بکرێت.',
    'Payment Method': 'شێوازی پارەدان',
    'Cash Received': 'بڕی پارەی وەرگیراو',
    'Total Customers': 'کۆی کڕیارەکان',
    "Today's Appointments": 'وادەکانی ئەمڕۆ',
    'Sales Snapshot': 'پوختەی فرۆشتن',
    'Schedule Preview': 'پێشبینینی خشتەی کات',
    'Appointments and revenue are tracked live from the database.': 'وادەکان و داهات بە شێوەی ڕاستەوخۆ لە بنکەدراوەوە تۆمار دەکرێن.',
    'Reports are generated from the live orders and inventory tables.': 'ڕاپۆرتەکان لە ئۆردەر و کۆگای بەرهەمی ڕاستەقینەوە دروست دەکرێن.',
    'Service unavailable': 'خزمەتگوزاری بەردەست نییە',
    'Service sales:': 'فرۆشتنی خزمەتگوزاری:',
    'Business Summary': 'پوختەی کار',
    'Total Sales': 'کۆی فرۆشتن',
    "Today's Product Sales": 'فرۆشتنی بەرهەمەکانی ئەمڕۆ',
    "Today's Service Sales": 'فرۆشتنی خزمەتگوزارییەکانی ئەمڕۆ',
    "Today's Total Sales": 'کۆی فرۆشتنی ئەمڕۆ',
    'Items:': 'دانەکان:',
    'Order #': 'ئۆردەر #',
    'Barber:': 'باربەر:',
    'Payment:': 'پارەدان:',
    'Low Stock Items': 'بەرهەمە کەم‌کۆگاکان',
    'Add Customer': 'زیادکردنی کڕیار',
    'Customer Name': 'ناوی کڕیار',
    'No phone': 'ژمارەی تەلەفۆن نییە',
    'Add Service': 'زیادکردنی خزمەتگوزاری',
    'Add Product': 'زیادکردنی بەرهەم',
    'Product Name': 'ناوی بەرهەم',
    'Product Image': 'وێنەی بەرهەم',
    'Add Service': 'زیادکردنی خزمەتگوزاری',
    'Edit Service': 'دەستکاریکردنی خزمەتگوزاری',
    'Save Settings': 'پاشەکەوتکردنی ڕێکخستنەکان',
    'Settings saved.': 'ڕێکخستنەکان پاشەکەوت کران.',
    'Backup DB': 'هەڵگرتنی پاشەکەوتی بنکەدراوە',
    'Restore DB': 'گەڕاندنەوەی بنکەدراوە',
    'Database backup created.': 'پاشەکەوتی بنکەدراوە دروست کرا.',
    'Database restored.': 'بنکەدراوە گەڕێندرایەوە.',
    'Could not create backup:': 'نەتوانرا پاشەکەوت دروست بکرێت:',
    'Could not restore backup:': 'نەتوانرا پاشەکەوتەکە بگەڕێندرێتەوە:',
    'Could not reach the local server:': 'نەتوانرا پەیوەندی بە سێرڤەری ناوخۆیی بکرێت:',
    'Service saved.': 'خزمەتگوزاری پاشەکەوت کرا.',
    'Product saved.': 'بەرهەم پاشەکەوت کرا.',
    'Customer added.': 'کڕیار زیاد کرا.',
    'Order completed successfully.': 'ئۆردەرەکە بە سەرکەوتوویی تەواو کرا.',
    'Please choose a date, time, and service.': 'تکایە ڕێکەوت، کات و خزمەتگوزارییەک هەڵبژێرە.',
    'Add at least one item to the order.': 'لانیکەم یەک دانە زیاد بکە بۆ ئۆردەرەکە.',
    'Enter a customer name or phone number.': 'ناو یان ژمارەی تەلەفۆنی کڕیار بنووسە.',
    'Fill in all service fields.': 'هەموو خانەکانی خزمەتگوزاری پڕ بکەرەوە.',
    'Enter backup file path (e.g. C:/backup/xbarber.db):': 'شوێنی پاشەکەوتی بنکەدراوە بنووسە.',
    'Enter backup file path to restore:': 'شوێنی پاشەکەوتەکە بنووسە بۆ گەڕاندنەوە.',
    'Invalid login. Use admin / admin123': 'چوونەژوورەوە دروست نییە. admin / admin123 بەکاربهێنە.',
    'Dashboard': 'داشبۆرد',
    'Schedule': 'خشتەی کات',
    'Cashier': 'کاشێر',
    'Customers': 'کڕیارەکان',
    'Barbers': 'باربەرەکان',
    'Barber': 'باربەر',
    'Add Barber': 'زیادکردنی باربەر',
    'Enter a barber name.': 'ناوی باربەر بنووسە.',
    'Deactivate': 'ناچالاککردن',
    'Barber name': 'ناوی باربەر',
    'Customers:': 'کڕیارەکان:',
    'No barbers yet.': 'هێشتا باربەر نییە.',
    'No customers assigned.': 'هیچ کڕیارێک دیاری نەکراوە.',
    'Unassigned': 'دیارینەکراو',
    'Assign barbers': 'دیاریکردنی باربەرەکان',
    'Save Barbers': 'پاشەکەوتکردنی باربەرەکان',
    'Barber for this order': 'باربەری ئەم ئۆردەرە',
    'Select a barber': 'باربەرێک هەڵبژێرە',
    'Add a barber before completing an order.': 'پێش تەواوکردنی ئۆردەر باربەرێک زیاد بکە.',
    'Choose a barber for this order.': 'باربەرێک بۆ ئەم ئۆردەرە هەڵبژێرە.',
    'This barber will no longer be available for new assignments. Past orders and customer assignments will remain.': 'ئەم باربەرە بۆ دیاریکردنی نوێ بەردەست نابێت. ئۆردەر و دیاریکردنە پێشوەکان دەمێننەوە.',
    'History': 'مێژوو',
    'Services': 'خزمەتگوزارییەکان',
    'Products': 'بەرهەمەکان',
    'Reports': 'ڕاپۆرتەکان',
    'Settings': 'ڕێکخستنەکان',
    'Username': 'ناوی بەکارهێنەر',
    'Password': 'وشەی نهێنی',
    'LOGIN': 'چوونەژوورەوە',
    'Date:': 'ڕێکەوت:',
    'Date': 'ڕێکەوت',
    'Time': 'کات',
    'Saved Customer': 'کڕیاری پاشەکەوتکراو',
    'Service': 'خزمەتگوزاری',
    'Notes': 'تێبینی',
    'Cancel': 'هەڵوەشاندنەوە',
    'Delete': 'سڕینەوە',
    'Edit': 'دەستکاری',
    'Add': 'زیادکردن',
    'Save': 'پاشەکەوتکردن',
    'Schedule': 'خشتەی کات',
    'Visits:': 'ژمارەی سەردان:',
    'Spent:': 'خەرجکراو:',
    'Stock:': 'کۆگا:',
    'Subtotal:': 'کۆی لاوەکی:',
    'Discount:': 'داشکاندن:',
    'TOTAL:': 'کۆی گشتی:',
    'Total:': 'کۆی گشتی:',
    'Change:': 'ماوەی پارە:',
    'Completed': 'تەواوکراو',
    'scheduled': 'لە پلاندانایە',
    'waiting': 'چاوەڕوانە',
    'in-service': 'لە خزمەتگوزاریدایە',
    'completed': 'تەواوکراو',
    'cancelled': 'هەڵوەشێنراوەتەوە',
    'Cash': 'نەقد',
    'Card': 'کارتی بانکی',
    'Other': 'هیتر',
    'Name': 'ناو',
    'Price': 'نرخ',
    'Duration (minutes)': 'ماوە (خولەک)',
    'Stock': 'کۆگا',
    'Description': 'وەسف',
    'Shop Name': 'ناوی دووکان',
    'Phone': 'تەلەفۆن',
    'Address': 'ناونیشان',
    'Currency': 'دراو',
    'Language': 'زمان',
    'English': 'ئینگلیزی',
    'Business Summary': 'پوختەی کار',
    'completed': 'تەواوکراو',
    'walk-in': 'بێ وادە',
    'Walk-in': 'بێ وادە',
    'today': 'ئەمڕۆ',
    'In Service': 'لە خزمەتگوزاریدایە',
    'Waiting': 'چاوەڕوانە',
    'Scheduled': 'لە پلاندانایە',
    'Cancelled': 'هەڵوەشێنراوەتەوە',
    'Total Orders': 'کۆی ئۆردەرەکان',
    'Today': 'ئەمڕۆ',
    'Revenue': 'داهات',
    'Orders': 'ئۆردەرەکان',
    'Completed Clients': 'کڕیارە تەواوکراوەکان',
    'Remaining Clients': 'کڕیارە ماوەکان',
    'No services available.': 'هیچ خزمەتگوزارییەک بەردەست نییە.',
    'Ready to sell': 'ئامادەی فرۆشتن',
    'Description': 'وەسف',
    'Categories': 'پۆلەکان',
    'Category': 'پۆل',
    'Add Category': 'زیادکردنی پۆل',
    'Category name': 'ناوی پۆل',
    'Save Category': 'پاشەکەوتکردنی پۆل',
    'No categories yet.': 'هێشتا هیچ پۆلێک نییە.',
    'Uncategorized': 'بێ پۆل',
    'Delete this category? Products in it will become uncategorized.': 'ئەم پۆلە بسڕدرێتەوە؟ بەرهەمەکانی بێ پۆل دەبن.',
    'Database backup downloaded.': 'پاڵپشتی بنکەدراوە داگیرا.',
    'Database restored.': 'بنکەدراوە گەڕێندرایەوە.',
};
let interfaceLanguage = 'en';

const soraniEntries = Object.entries(soraniTranslations).sort((a, b) => b[0].length - a[0].length);
const englishEntries = soraniEntries.map(([english, sorani]) => [sorani, english]).sort((a, b) => b[0].length - a[0].length);

function translateUiText(text) {
    const entries = interfaceLanguage === 'ckb' ? soraniEntries : englishEntries;
    let translated = text;
    entries.forEach(([source, target]) => {
        if (source) translated = translated.split(source).join(target);
    });
    return translated;
}

function translateTextNode(node) {
    const value = node.nodeValue;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const core = value.slice(leading.length, value.length - trailing.length || undefined);
    const translated = translateUiText(core);
    if (translated !== core) node.nodeValue = `${leading}${translated}${trailing}`;
}

function translateSubtree(root) {
    if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root);
        return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateTextNode(walker.currentNode);
}

function applyInterfaceLanguage() {
    interfaceLanguage = localStorage.getItem(languageStorageKey) === 'ckb' ? 'ckb' : 'en';
    document.documentElement.lang = interfaceLanguage;
    document.documentElement.dir = interfaceLanguage === 'ckb' ? 'rtl' : 'ltr';
    document.body.dir = interfaceLanguage === 'ckb' ? 'rtl' : 'ltr';
    translateSubtree(document.body);

    const languageSelect = document.getElementById('interface-language');
    if (languageSelect) languageSelect.value = interfaceLanguage;

    const languageToggle = document.getElementById('language-toggle');
    if (languageToggle) {
        languageToggle.textContent = interfaceLanguage === 'ckb' ? 'EN' : 'کوردی';
        languageToggle.setAttribute('aria-label', interfaceLanguage === 'ckb' ? 'Switch language to English' : 'گۆڕینی زمان بۆ کوردی');
        languageToggle.onclick = () => setInterfaceLanguage(interfaceLanguage === 'ckb' ? 'en' : 'ckb');
    }

    if (document.getElementById('sidebar-toggle')) {
        setSidebarCollapsed(mainApp.classList.contains('sidebar-collapsed'));
    }
}

function setInterfaceLanguage(language) {
    localStorage.setItem(languageStorageKey, language === 'ckb' ? 'ckb' : 'en');
    applyInterfaceLanguage();
}

const languageObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'characterData') translateTextNode(mutation.target);
        mutation.addedNodes?.forEach(node => translateSubtree(node));
    });
});

const nativeAlert = window.alert.bind(window);
const nativeConfirm = window.confirm.bind(window);
const nativePrompt = window.prompt.bind(window);
window.alert = message => nativeAlert(translateUiText(String(message)));
window.confirm = message => nativeConfirm(translateUiText(String(message)));
window.prompt = (message, defaultValue) => nativePrompt(translateUiText(String(message)), defaultValue);

let currentUser = null;
let currentOrder = [];
let pendingScheduleCustomerId = null;
let historyAppointmentIds = [];
let selectedCashierBarberId = '';
let activePageName = 'dashboard';

document.addEventListener('DOMContentLoaded', function() {
    applyInterfaceLanguage();
    languageObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
    checkAuthStatus();
    setupEventListeners();
});

function checkAuthStatus() {
    showScreen('login');
}

function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    setupSidebarToggle();
    setupSwipeNavigation();

    document.querySelectorAll('[data-customer-view]').forEach(tab => {
        tab.addEventListener('click', () => {
            const showHistory = tab.dataset.customerView === 'history';
            document.querySelectorAll('[data-customer-view]').forEach(item => {
                const selected = item === tab;
                item.classList.toggle('active', selected);
                item.setAttribute('aria-selected', String(selected));
            });
            document.getElementById('customers-content').hidden = showHistory;
            document.getElementById('history-content').hidden = !showHistory;
            if (showHistory) loadHistory();
            else loadCustomers();
        });
    });

    document.querySelectorAll('[data-catalog-view]').forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.catalogView;
            document.querySelectorAll('[data-catalog-view]').forEach(item => {
                const selected = item === tab;
                item.classList.toggle('active', selected);
                item.setAttribute('aria-selected', String(selected));
            });
            document.getElementById('services-content').hidden = view !== 'services';
            document.getElementById('products-content').hidden = view !== 'products';
            document.getElementById('categories-content').hidden = view !== 'categories';
            if (view === 'products') loadProducts();
            else if (view === 'categories') loadCategories();
            else loadServices();
        });
    });

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            showPage(page);
            setActiveNav(this);
            if (window.matchMedia('(max-width: 900px)').matches) {
                setSidebarCollapsed(true);
            }
        });
    });
}

function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const compactLayout = window.matchMedia('(max-width: 900px)');

    setSidebarCollapsed(compactLayout.matches);
    const updateSidebarForLayout = event => setSidebarCollapsed(event.matches);
    if (compactLayout.addEventListener) {
        compactLayout.addEventListener('change', updateSidebarForLayout);
    } else {
        compactLayout.addListener(updateSidebarForLayout);
    }

    sidebarToggle.addEventListener('click', () => {
        setSidebarCollapsed(!mainApp.classList.contains('sidebar-collapsed'));
    });
    sidebarBackdrop.addEventListener('click', () => setSidebarCollapsed(true));
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !mainApp.classList.contains('sidebar-collapsed')) {
            setSidebarCollapsed(true);
            sidebarToggle.focus();
        }
    });
}

function setSidebarCollapsed(collapsed) {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const label = document.getElementById('sidebar-toggle-label');
    mainApp.classList.toggle('sidebar-collapsed', collapsed);
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggle.setAttribute(
        'aria-label',
        interfaceLanguage === 'ckb'
            ? (collapsed ? 'نیشاندانی پێڕست' : 'شاردنەوەی پێڕست')
            : (collapsed ? 'Show navigation menu' : 'Hide navigation menu')
    );
    label.textContent = interfaceLanguage === 'ckb'
        ? (collapsed ? 'پێڕست' : 'شاردنەوەی پێڕست')
        : (collapsed ? 'Show menu' : 'Hide menu');
}

function setupSwipeNavigation() {
    const mainContent = document.getElementById('main-content');
    let touchStart = null;
    const interactiveSelector = 'input, textarea, select, button, a, [contenteditable="true"], .modal';

    mainContent.addEventListener('touchstart', event => {
        if (event.touches.length !== 1 || event.target.closest(interactiveSelector)) {
            touchStart = null;
            return;
        }

        const touch = event.touches[0];
        touchStart = { x: touch.clientX, y: touch.clientY, target: event.target };
    }, { passive: true });

    mainContent.addEventListener('touchend', event => {
        if (!touchStart || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStart.x;
        const deltaY = touch.clientY - touchStart.y;
        const isHorizontalSwipe = Math.abs(deltaX) >= 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
        const endTarget = document.elementFromPoint(touch.clientX, touch.clientY);
        const touchesControl = touchStart.target.closest(interactiveSelector) || endTarget?.closest(interactiveSelector);
        touchStart = null;

        if (!isHorizontalSwipe || touchesControl) return;

        const isRtl = document.documentElement.dir === 'rtl';
        const forward = isRtl ? deltaX > 0 : deltaX < 0;
        const activePage = document.querySelector('.page.active');
        if (!activePage) return;

        if (activePage.id === 'customers-page' || activePage.id === 'catalog-page') {
            const tabSelector = activePage.id === 'customers-page' ? '[data-customer-view]' : '[data-catalog-view]';
            const tabs = [...activePage.querySelectorAll(tabSelector)];
            const activeIndex = tabs.findIndex(tab => tab.classList.contains('active'));
            const nextIndex = activeIndex + (forward ? 1 : -1);
            if (tabs[nextIndex]) tabs[nextIndex].click();
            return;
        }

        const pagesInNav = [...navLinks].map(link => link.dataset.page);
        const currentIndex = pagesInNav.indexOf(activePageName);
        const nextIndex = currentIndex + (forward ? 1 : -1);
        if (pagesInNav[nextIndex]) {
            document.querySelector(`[data-page="${pagesInNav[nextIndex]}"]`)?.click();
        }
    }, { passive: true });
}

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
        const signedIn = typeof api.login === 'function'
            ? await api.login(username, password)
            : username === 'admin' && password === 'admin123';
        if (!signedIn) {
            alert('Invalid login. Use admin / admin123');
            return;
        }
    } catch (error) {
        alert(`Could not sign in: ${error.message}`);
        return;
    }

    currentUser = { username };
    showScreen('main');
    showPage('dashboard');
}

function showScreen(screenName) {
    if (screenName === 'login') {
        loginScreen.classList.add('active');
        mainApp.classList.remove('active');
    } else {
        loginScreen.classList.remove('active');
        mainApp.classList.add('active');
    }
}

function showPage(pageName) {
    const targetPageName = ['history', 'services', 'products'].includes(pageName)
        ? ({ history: 'customers', services: 'catalog', products: 'catalog' })[pageName]
        : pageName;
    const navPages = [...navLinks].map(link => link.dataset.page);
    const previousIndex = navPages.indexOf(activePageName);
    const nextIndex = navPages.indexOf(targetPageName);
    const transitionDirection = nextIndex >= 0 && previousIndex >= 0 && nextIndex < previousIndex ? 'backward' : 'forward';
    pages.forEach(page => page.classList.remove('active', 'page-enter-forward', 'page-enter-backward'));

    const pageElement = document.getElementById(`${targetPageName}-page`);
    if (pageElement) {
        pageElement.classList.add(`page-enter-${transitionDirection}`);
        pageElement.classList.add('active');
        activePageName = targetPageName;
    }

    switch (pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'schedule':
            loadSchedule();
            break;
        case 'cashier':
            loadCashier();
            break;
        case 'sales-history':
            loadSalesHistory();
            break;
        case 'print':
            loadPrintSection();
            break;
        case 'customers':
            document.querySelector('[data-customer-view="customers"]').click();
            break;
        case 'barbers':
            loadBarbers();
            break;
        case 'catalog':
            document.querySelector('[data-catalog-view="services"]').click();
            break;
        case 'history':
            showPage('customers');
            document.querySelector('[data-customer-view="history"]').click();
            break;
        case 'services':
        case 'products':
            showPage('catalog');
            document.querySelector(`[data-catalog-view="${pageName}"]`).click();
            break;
        case 'settings':
            loadSettings();
            break;
        default:
            break;
    }
}

function setActiveNav(activeLink) {
    navLinks.forEach(link => link.classList.remove('active'));
    if (activeLink) activeLink.classList.add('active');
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadDashboard() {
    const content = document.getElementById('dashboard-content');
    const today = getLocalDateString();

    try {
        const [customerRow, appointmentRow, completedRow, orderRow, orderCountRow, lifetimeSalesRow, lifetimeOrderCountRow, lowStockRow, dailyProductSalesRow, dailyServiceSalesRow, lifetimeProductSalesRow, lifetimeServiceSalesRow] = await Promise.all([
            api.dbQuery('SELECT COUNT(*) AS total FROM customers WHERE is_active = 1'),
            api.dbQuery('SELECT COUNT(*) AS total FROM appointments WHERE date = ?', [today]),
            api.dbQuery('SELECT COUNT(*) AS total FROM appointments WHERE date = ? AND status = ?', [today, 'completed']),
            api.dbQuery("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE date = ? AND COALESCE(status, 'completed') != 'cancelled'", [today]),
            api.dbQuery("SELECT COUNT(*) AS total FROM orders WHERE date = ? AND COALESCE(status, 'completed') != 'cancelled'", [today]),
            api.dbQuery("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE COALESCE(status, 'completed') != 'cancelled'"),
            api.dbQuery("SELECT COUNT(*) AS total FROM orders WHERE COALESCE(status, 'completed') != 'cancelled'"),
            api.dbQuery('SELECT COUNT(*) AS total FROM products WHERE stock < 5 AND is_active = 1'),
            api.dbQuery("SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.date = ? AND COALESCE(o.status, 'completed') != 'cancelled' AND oi.item_type = ?", [today, 'product']),
            api.dbQuery("SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.date = ? AND COALESCE(o.status, 'completed') != 'cancelled' AND oi.item_type = ?", [today, 'service']),
            api.dbQuery("SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE COALESCE(o.status, 'completed') != 'cancelled' AND oi.item_type = ?", ['product']),
            api.dbQuery("SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE COALESCE(o.status, 'completed') != 'cancelled' AND oi.item_type = ?", ['service']),
        ]);

        content.innerHTML = `
            <div class="dashboard-grid">
                <div class="stat-card">
                    <h3>Total Customers</h3>
                    <div class="value">${Number(customerRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Today's Appointments</h3>
                    <div class="value">${Number(appointmentRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Completed</h3>
                    <div class="value">${Number(completedRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Revenue</h3>
                    <div class="value">${formatCurrency(orderRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Today's Product Sales</h3>
                    <div class="value">${formatCurrency(dailyProductSalesRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Today's Service Sales</h3>
                    <div class="value">${formatCurrency(dailyServiceSalesRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Today's Total Sales</h3>
                    <div class="value">${formatCurrency(Number(dailyProductSalesRow[0]?.total || 0) + Number(dailyServiceSalesRow[0]?.total || 0))}</div>
                </div>
                <div class="stat-card">
                    <h3>Orders</h3>
                    <div class="value">${Number(orderCountRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Sales</h3>
                    <div class="value">${formatCurrency(lifetimeSalesRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Product Sales</h3>
                    <div class="value">${formatCurrency(lifetimeProductSalesRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Total Service Sales</h3>
                    <div class="value">${formatCurrency(lifetimeServiceSalesRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>All Orders</h3>
                    <div class="value">${Number(lifetimeOrderCountRow[0]?.total || 0)}</div>
                </div>
                <div class="stat-card">
                    <h3>Low Stock Items</h3>
                    <div class="value">${Number(lowStockRow[0]?.total || 0)}</div>
                </div>
            </div>

            <div class="chart-container">
                <h3>Sales by Category</h3>
                <div class="chart-placeholder">
                    Products: ${formatCurrency(dailyProductSalesRow[0]?.total || 0)} ·
                    Services: ${formatCurrency(dailyServiceSalesRow[0]?.total || 0)} ·
                    Total: ${formatCurrency(Number(dailyProductSalesRow[0]?.total || 0) + Number(dailyServiceSalesRow[0]?.total || 0))}
                </div>
            </div>

            <div class="chart-container">
                <h3>Business Snapshot</h3>
                <div class="chart-placeholder">Live totals for appointments, sales, and inventory.</div>
            </div>
        `;
    } catch (error) {
        console.error('Dashboard failed:', error);
        content.innerHTML = '<p>Dashboard could not load.</p>';
    }
}

async function loadSchedule() {
    const content = document.getElementById('schedule-content');
    content.innerHTML = `
        <div class="schedule-controls">
            <div class="schedule-date-selector">
                <label for="schedule-date">Date:</label>
                <input type="date" id="schedule-date" value="${getLocalDateString()}">
            </div>
            <button class="btn btn-primary" id="add-appointment-btn">Add Appointment</button>
        </div>

        <div class="appointment-list" id="appointment-list"></div>

        <div id="appointment-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <h3>New Appointment</h3>
                <div class="form-group">
                    <label for="modal-date">Date</label>
                    <input type="date" id="modal-date">
                </div>
                <div class="form-group">
                    <label for="modal-time">Time</label>
                    <input type="time" id="modal-time">
                </div>
                <div class="form-group">
                    <label for="modal-existing-customer">Saved Customer</label>
                    <select id="modal-existing-customer">
                        <option value="">New customer or walk-in</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="modal-customer">Customer Name (Optional)</label>
                    <input type="text" id="modal-customer">
                </div>
                <div class="form-group">
                    <label for="modal-phone">Phone Number (Optional)</label>
                    <input type="text" id="modal-phone">
                </div>
                <div class="form-group">
                    <label for="modal-service">Service</label>
                    <select id="modal-service"></select>
                </div>
                <div class="form-group">
                    <label for="modal-notes">Notes</label>
                    <textarea id="modal-notes" rows="3"></textarea>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" id="save-appointment-btn">Save Appointment</button>
                    <button class="btn" id="cancel-appointment-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('schedule-date').addEventListener('change', loadAppointmentsForSelectedDate);
    document.getElementById('add-appointment-btn').addEventListener('click', openAppointmentModal);
    document.getElementById('modal-existing-customer').addEventListener('change', updateAppointmentCustomerFields);
    document.getElementById('cancel-appointment-btn').addEventListener('click', closeAppointmentModal);
    document.getElementById('save-appointment-btn').addEventListener('click', saveAppointment);
    document.getElementById('appointment-list').addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('[data-delete-appointment]');
        if (!deleteButton) return;

        const appointmentId = Number(deleteButton.dataset.deleteAppointment);
        if (!Number.isInteger(appointmentId)) return;

        if (!confirm('Delete appointment?')) return;

        const result = await api.dbRun('DELETE FROM appointments WHERE id = ?', [appointmentId]);
        if (result.changes > 0) {
            await loadAppointmentsForSelectedDate();
            alert('Appointment deleted.');
        }
    });

    document.getElementById('appointment-list').addEventListener('change', async (event) => {
        const target = event.target.closest('[data-status-id]');
        if (!target) return;

        const status = target.value;
        const appointmentId = Number(target.dataset.statusId);
        await api.dbRun('UPDATE appointments SET status = ? WHERE id = ?', [status, appointmentId]);
        await loadAppointmentsForSelectedDate();
    });

    await loadAppointmentServices();
    await loadAppointmentCustomers();
    await loadAppointmentsForSelectedDate();

    if (pendingScheduleCustomerId) {
        openAppointmentModal(pendingScheduleCustomerId);
        pendingScheduleCustomerId = null;
    }
}

async function loadAppointmentServices() {
    const select = document.getElementById('modal-service');
    if (!select) return;

    const services = await api.dbQuery('SELECT id, name FROM services WHERE is_active = 1 ORDER BY name');
    select.innerHTML = services.length 
        ? services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')
        : '<option value="">No services available</option>';
}

async function loadAppointmentCustomers() {
    const select = document.getElementById('modal-existing-customer');
    const customers = await api.dbQuery('SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY name');

    select.innerHTML = '<option value="">New customer or walk-in</option>' + customers.map(customer =>
        `<option value="${customer.id}">${escapeHtml(customer.name || 'Unnamed customer')}${customer.phone ? ` - ${escapeHtml(customer.phone)}` : ''}</option>`
    ).join('');
}

async function updateAppointmentCustomerFields() {
    const customerId = Number(document.getElementById('modal-existing-customer').value);
    const nameInput = document.getElementById('modal-customer');
    const phoneInput = document.getElementById('modal-phone');

    if (!customerId) {
        nameInput.value = '';
        phoneInput.value = '';
        nameInput.readOnly = false;
        phoneInput.readOnly = false;
        return;
    }

    const customer = (await api.dbQuery('SELECT id, name, phone FROM customers WHERE id = ? AND is_active = 1', [customerId]))[0];
    if (!customer) return;

    nameInput.value = customer.name || '';
    phoneInput.value = customer.phone || '';
    nameInput.readOnly = true;
    phoneInput.readOnly = true;
}

function openAppointmentModal(customerId = null) {
    const modal = document.getElementById('appointment-modal');
    const dateInput = document.getElementById('modal-date');
    const timeInput = document.getElementById('modal-time');

    modal.style.display = 'flex';
    dateInput.value = document.getElementById('schedule-date').value;
    timeInput.value = '09:00';
    document.getElementById('modal-existing-customer').value = customerId ? String(customerId) : '';
    updateAppointmentCustomerFields();
}

function closeAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    modal.style.display = 'none';
}

async function loadAppointmentsForSelectedDate() {
    const date = document.getElementById('schedule-date').value;
    const list = document.getElementById('appointment-list');

    if (!date) {
        list.innerHTML = '<p>Select a date to view appointments.</p>';
        return;
    }

    const appointments = await api.dbQuery(
        `SELECT a.id, a.time, a.status, s.name AS service_name,
                COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN customers c ON c.id = a.customer_id
         WHERE a.date = ? ORDER BY a.time`,
        [date]
    );

    if (!appointments.length) {
        list.innerHTML = '<p>No appointments for this date.</p>';
        return;
    }

    const statusOptions = ['scheduled', 'waiting', 'in-service', 'completed', 'cancelled'];
    list.innerHTML = appointments.map((appointment) => {
        const selectedStatus = appointment.status || 'scheduled';
        const optionMarkup = statusOptions.map(option => 
            `<option value="${option}" ${option === selectedStatus ? 'selected' : ''}>${option}</option>`
        ).join('');

        return `
            <div class="appointment-item">
                <div>
                    <div class="appointment-time">${escapeHtml(appointment.time)}</div>
                    <div>${escapeHtml(appointment.customer_name)}</div>
                    <div>${escapeHtml(appointment.service_name || 'Service')}</div>
                </div>
                <div class="appointment-actions">
                    <select class="status-select" data-status-id="${appointment.id}">${optionMarkup}</select>
                    <button class="btn btn-danger btn-sm" data-delete-appointment="${appointment.id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveAppointment() {
    const date = document.getElementById('modal-date').value;
    const time = document.getElementById('modal-time').value;
    const customerName = document.getElementById('modal-customer').value.trim();
    const phone = document.getElementById('modal-phone').value.trim();
    const savedCustomerId = Number(document.getElementById('modal-existing-customer').value);
    const serviceId = Number(document.getElementById('modal-service').value);
    const notes = document.getElementById('modal-notes').value.trim();

    if (!date || !time || !serviceId) {
        alert('Please choose a date, time, and service.');
        return;
    }

    let customerId = null;
    if (savedCustomerId) {
        customerId = savedCustomerId;
    } else if (customerName || phone) {
        const result = await api.dbRun('INSERT INTO customers (name, phone) VALUES (?, ?)', [customerName || null, phone || null]);
        customerId = result.lastID;
    }

    await api.dbRun(
        'INSERT INTO appointments (customer_id, date, time, service_id, notes, status) VALUES (?, ?, ?, ?, ?, ?)',
        [customerId, date, time, serviceId, notes || null, 'scheduled']
    );

    document.getElementById('schedule-date').value = date;
    closeAppointmentModal();
    await loadAppointmentsForSelectedDate();
    alert('Appointment saved successfully.');
}

async function loadCashier() {
    const content = document.getElementById('cashier-content');
    const [services, products, barbers] = await Promise.all([
        api.dbQuery('SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT id, name, price, stock FROM products WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY name')
    ]);
    if (!barbers.some(barber => String(barber.id) === selectedCashierBarberId)) {
        selectedCashierBarberId = '';
    }

    content.innerHTML = `
        <div class="cashier-header">
            <h3>Current Order</h3>
            <div class="order-info">Ready to sell</div>
        </div>

        <div class="form-group">
            <label for="cashier-barber">Barber for this order</label>
            <select id="cashier-barber" required>
                <option value="">${barbers.length ? 'Select a barber' : 'No barbers yet.'}</option>
                ${barbers.map(barber => `<option value="${barber.id}" ${String(barber.id) === selectedCashierBarberId ? 'selected' : ''}>${escapeHtml(barber.name)}</option>`).join('')}
            </select>
        </div>

        <div class="cashier-section">
            <h3>Services</h3>
            <div class="item-list" id="cashier-services-list">
                ${services.map(service => `
                    <div class="item-row">
                        <div class="item-name">${escapeHtml(service.name)}</div>
                        <div class="item-price">${formatCurrency(service.price)}</div>
                        <button class="btn btn-sm btn-primary" data-add-item="service-${service.id}" data-name="${escapeHtml(service.name)}" data-price="${service.price}">Add</button>
                    </div>
                `).join('') || '<p>No services available.</p>'}
            </div>
        </div>

        <div class="cashier-section">
            <h3>Products</h3>
            <div class="item-list" id="cashier-products-list">
                ${products.map(product => `
                    <div class="item-row">
                        <div class="item-name">${escapeHtml(product.name)}</div>
                        <div class="item-price">${formatCurrency(product.price)}</div>
                        <button class="btn btn-sm btn-primary" data-add-item="product-${product.id}" data-name="${escapeHtml(product.name)}" data-price="${product.price}">Add</button>
                    </div>
                `).join('') || '<p>No products available.</p>'}
            </div>
        </div>

        <div class="total-section">
            <h3>Order Summary</h3>
            <div id="cashier-order-items"></div>
            <div class="total-row">
                <span>Subtotal:</span>
                <span id="cashier-subtotal">${formatCurrency(0)}</span>
            </div>
            <div class="total-row">
                <span>Discount:</span>
                <span>${formatCurrency(0)}</span>
            </div>
            <div class="total-row total">
                <span>Total:</span>
                <span id="cashier-total">${formatCurrency(0)}</span>
            </div>
        </div>

        <div class="form-group">
            <label for="payment-method">Payment Method</label>
            <select id="payment-method">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
            </select>
        </div>

        <div id="cash-payment-section" style="display:none;">
            <div class="form-group">
                <label for="cash-received">Cash Received</label>
                <input type="number" id="cash-received" step="0.01" value="0">
            </div>
            <div class="total-row">
                <span>Change:</span>
                <span id="change-amount">${formatCurrency(0)}</span>
            </div>
        </div>

        <button class="btn btn-primary" id="complete-order-btn">Complete Order</button>
    `;

    document.getElementById('cashier-content').addEventListener('click', handleCashierActions);
    document.getElementById('cashier-barber').addEventListener('change', event => {
        selectedCashierBarberId = event.target.value;
    });
    const paymentMethod = document.getElementById('payment-method');
    const updateCashPaymentVisibility = () => {
        document.getElementById('cash-payment-section').style.display = paymentMethod.value === 'cash' ? 'block' : 'none';
    };
    paymentMethod.addEventListener('change', updateCashPaymentVisibility);
    updateCashPaymentVisibility();
    document.getElementById('cash-received').addEventListener('input', function() {
        const total = calculateCurrentOrderTotal();
        const received = Number(this.value || 0);
        document.getElementById('change-amount').textContent = formatCurrency(Math.max(received - total, 0));
    });
    document.getElementById('complete-order-btn').addEventListener('click', completeOrder);

    currentOrder = [];
    renderCashierOrder();
}

function handleCashierActions(event) {
    const addButton = event.target.closest('[data-add-item]');
    if (!addButton) return;

    const rawKey = addButton.dataset.addItem;
    const [type, id] = rawKey.split('-');
    const name = addButton.dataset.name;
    const price = Number(addButton.dataset.price);

    const existing = currentOrder.find(item => item.type === type && item.id === Number(id));
    if (existing) {
        existing.quantity += 1;
    } else {
        currentOrder.push({ type, itemType: type, id: Number(id), name, price, quantity: 1 });
    }

    renderCashierOrder();
}

function renderCashierOrder() {
    const orderItems = document.getElementById('cashier-order-items');
    const subtotal = calculateCurrentOrderTotal();

    if (!orderItems) return;

    if (!currentOrder.length) {
        orderItems.innerHTML = '<p>No items in the order.</p>';
    } else {
        orderItems.innerHTML = currentOrder.map((item) => `
            <div class="item-row">
                <div class="item-name">${escapeHtml(item.name)} (${item.quantity})</div>
                <div class="item-price">${formatCurrency(item.price * item.quantity)}</div>
                <div class="quantity-controls">
                    <button class="quantity-btn" data-cashier-adjust="minus-${item.itemType}-${item.id}">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn" data-cashier-adjust="plus-${item.itemType}-${item.id}">+</button>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('cashier-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('cashier-total').textContent = formatCurrency(subtotal);

    const cashReceived = Number(document.getElementById('cash-received')?.value || 0);
    const change = Math.max(cashReceived - subtotal, 0);
    const changeNode = document.getElementById('change-amount');
    if (changeNode) {
        changeNode.textContent = formatCurrency(change);
    }

    const container = document.getElementById('cashier-content');
    if (container) {
        container.querySelectorAll('[data-cashier-adjust]').forEach((button) => {
            button.onclick = () => {
                const [mode, itemType, idText] = button.dataset.cashierAdjust.split('-');
                const itemId = Number(idText);
                const item = currentOrder.find(entry => entry.itemType === itemType && entry.id === itemId);
                if (!item) return;

                if (mode === 'plus') item.quantity += 1;
                if (mode === 'minus') item.quantity = Math.max(0, item.quantity - 1);

                if (item.quantity === 0) {
                    currentOrder = currentOrder.filter(entry => !(entry.itemType === itemType && entry.id === itemId));
                }

                renderCashierOrder();
            };
        });
    }
}

function calculateCurrentOrderTotal() {
    return currentOrder.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
}

async function completeOrder() {
    const total = calculateCurrentOrderTotal();
    const barberId = Number(document.getElementById('cashier-barber')?.value);
    if (!currentOrder.length) {
        alert('Add at least one item to the order.');
        return;
    }

    if (!Number.isInteger(barberId) || barberId < 1) {
        alert('Choose a barber for this order.');
        return;
    }

    const paymentMethod = document.getElementById('payment-method').value;
    const cashReceived = Number(document.getElementById('cash-received')?.value || 0);
    const date = getLocalDateString();
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });

    try {
        const statements = [{
            query: 'INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            params: [null, date, time, total, 0, 'completed', paymentMethod, barberId]
        }];
        for (const item of currentOrder) {
            statements.push({
                query: 'INSERT INTO order_items (order_id, item_type, item_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
                params: [{ lastIDFrom: 0 }, item.itemType, item.id, item.quantity, item.price]
            });
            if (item.itemType === 'product') {
                statements.push({
                    query: 'UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?',
                    params: [item.quantity, item.id]
                });
            }
        }

        const receivedAmount = paymentMethod === 'cash' ? cashReceived : total;
        const changeAmount = paymentMethod === 'cash' ? Math.max(receivedAmount - total, 0) : 0;

        statements.push({
            query: 'INSERT INTO payments (order_id, amount, method, received_amount, change_amount) VALUES (?, ?, ?, ?, ?)',
            params: [{ lastIDFrom: 0 }, total, paymentMethod, receivedAmount, changeAmount]
        });
        await api.runTransaction(statements);

        currentOrder = [];
        renderCashierOrder();
        alert('Order completed successfully.');
    } catch (error) {
        console.error('Order failed:', error);
        alert('Could not complete order.');
    }
}

async function loadSalesHistory() {
    const content = document.getElementById('sales-history-content');
    try {
        const orders = await api.dbQuery(
            `SELECT o.id, o.date, o.time, o.total, o.payment_method,
                    COALESCE(b.name, 'Unassigned') AS barber_name,
                    COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name,
                    GROUP_CONCAT(oi.quantity || ' x ' || COALESCE(s.name, p.name, 'Item unavailable'), ', ') AS items
             FROM orders o
             LEFT JOIN barbers b ON b.id = o.barber_id
             LEFT JOIN customers c ON c.id = o.customer_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN services s ON oi.item_type = 'service' AND s.id = oi.item_id
             LEFT JOIN products p ON oi.item_type = 'product' AND p.id = oi.item_id
             WHERE COALESCE(o.status, 'completed') != 'cancelled'
             GROUP BY o.id
             ORDER BY o.date DESC, o.time DESC
             LIMIT 200`
        );

        content.innerHTML = orders.length ? `
            <div class="appointment-list">
                ${orders.map(order => `
                    <div class="appointment-item">
                        <div>
                            <div class="appointment-time">Order #${Number(order.id)} · ${escapeHtml(order.date)} ${escapeHtml(order.time)}</div>
                            <div>${escapeHtml(order.customer_name)} · Barber: ${escapeHtml(order.barber_name)}</div>
                            <div>${escapeHtml(order.items || 'No item details available')}</div>
                            <div>Payment: ${escapeHtml(order.payment_method || 'Unknown')}</div>
                        </div>
                        <div class="item-price">${formatCurrency(order.total)}</div>
                    </div>
                `).join('')}
            </div>
        ` : '<p>No completed orders yet.</p>';
    } catch (error) {
        console.error('Could not load sales history:', error);
        content.innerHTML = '<p>Sales history could not be loaded. Please try again.</p>';
    }
}

function getPrintDateRange(period, anchorDate) {
    const [year, month, day] = anchorDate.split('-').map(Number);
    const start = new Date(year, month - 1, day);
    const end = new Date(year, month - 1, day);
    if (period === 'week') {
        const daysSinceMonday = (start.getDay() + 6) % 7;
        start.setDate(start.getDate() - daysSinceMonday);
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
    } else if (period === 'month') {
        start.setDate(1);
        end.setMonth(end.getMonth() + 1, 0);
    }
    return { startDate: getLocalDateString(start), endDate: getLocalDateString(end) };
}

async function loadPrintSection() {
    const content = document.getElementById('print-content');
    content.innerHTML = `
        <section class="print-panel">
            <h3>Appointment List</h3>
            <p>Choose a day, week, or month to preview appointments with customer contact details and arrival times.</p>
            <div class="print-filters">
                <div class="form-group">
                    <label for="print-period">Period</label>
                    <select id="print-period">
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="print-date">Date to use</label>
                    <input type="date" id="print-date" value="${getLocalDateString()}">
                </div>
                <button type="button" class="btn btn-primary" id="show-print-appointments">Show Appointments</button>
                <button type="button" class="btn" id="save-appointments-pdf" disabled>Save as PDF</button>
            </div>
            <p id="print-range-label" class="print-range-label"></p>
            <div id="print-appointments-preview"></div>
        </section>
        <section class="history-danger-zone">
            <div>
                <h3>Clear All History</h3>
                <p>Permanently deletes sales/orders and past appointment history. Active and future appointments are kept.</p>
            </div>
            <button type="button" class="btn btn-danger" id="clear-all-history">Clear All History</button>
        </section>
    `;

    document.getElementById('show-print-appointments').addEventListener('click', renderPrintAppointments);
    document.getElementById('print-period').addEventListener('change', renderPrintAppointments);
    document.getElementById('print-date').addEventListener('change', renderPrintAppointments);
    document.getElementById('save-appointments-pdf').addEventListener('click', exportPrintAppointments);
    document.getElementById('clear-all-history').addEventListener('click', clearAllHistory);
    await renderPrintAppointments();
}

async function renderPrintAppointments() {
    const period = document.getElementById('print-period');
    const date = document.getElementById('print-date');
    const preview = document.getElementById('print-appointments-preview');
    const saveButton = document.getElementById('save-appointments-pdf');
    if (!period || !date || !preview || !saveButton) return;
    if (!date.value) {
        alert('Choose a date to use.');
        return;
    }

    const { startDate, endDate } = getPrintDateRange(period.value, date.value);
    const rangeLabel = period.value === 'day'
        ? startDate
        : `${startDate} - ${endDate}`;
    document.getElementById('print-range-label').textContent = `${period.options[period.selectedIndex].text}: ${rangeLabel}`;
    try {
        const appointments = await api.dbQuery(
            `SELECT a.date, a.time,
                    COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name,
                    COALESCE(c.phone, '') AS phone,
                    COALESCE(s.name, 'Service unavailable') AS service_name,
                    COALESCE(a.status, 'scheduled') AS status
             FROM appointments a
             LEFT JOIN customers c ON c.id = a.customer_id
             LEFT JOIN services s ON s.id = a.service_id
             WHERE a.date BETWEEN ? AND ?
             ORDER BY a.date, a.time
             LIMIT 2000`,
            [startDate, endDate]
        );
        preview.innerHTML = appointments.length ? `
            <div class="table-scroll">
                <table class="print-appointments-table">
                    <thead><tr><th>Date</th><th>Arrival time</th><th>Customer</th><th>Phone</th><th>Service</th><th>Status</th></tr></thead>
                    <tbody>${appointments.map(appointment => `
                        <tr>
                            <td>${escapeHtml(appointment.date)}</td>
                            <td>${escapeHtml(appointment.time)}</td>
                            <td>${escapeHtml(appointment.customer_name)}</td>
                            <td>${escapeHtml(appointment.phone || '—')}</td>
                            <td>${escapeHtml(appointment.service_name)}</td>
                            <td>${escapeHtml(appointment.status)}</td>
                        </tr>
                    `).join('')}</tbody>
                </table>
            </div>
            <p class="print-result-count">${appointments.length} appointment${appointments.length === 1 ? '' : 's'}</p>
        ` : '<p>No appointments in this period.</p>';
        saveButton.disabled = false;
        saveButton.dataset.rangeLabel = rangeLabel;
        saveButton.dataset.appointments = JSON.stringify(appointments);
    } catch (error) {
        console.error('Could not load appointments for printing:', error);
        preview.innerHTML = '<p>Could not load appointments for printing.</p>';
        saveButton.disabled = true;
        delete saveButton.dataset.appointments;
    }
}

async function exportPrintAppointments() {
    const button = document.getElementById('save-appointments-pdf');
    if (!button?.dataset.appointments) return;
    try {
        const appointments = JSON.parse(button.dataset.appointments);
        const result = await api.exportSchedulePdf(appointments, button.dataset.rangeLabel || 'appointments');
        if (!result.canceled && result.filePath) {
            alert(`Appointment PDF saved: ${result.filePath}`);
        }
    } catch (error) {
        console.error('Could not create appointment PDF:', error);
        alert(`Could not create PDF: ${error.message}`);
    }
}

async function clearAllHistory() {
    if (!confirm('Delete all sales/orders and past appointment history? Active and future appointments will remain. This cannot be undone.')) return;
    try {
        await api.clearHistory(getLocalDateString());
        await loadPrintSection();
        alert('History cleared. Upcoming appointments were kept.');
    } catch (error) {
        console.error('Could not clear history:', error);
        alert(`Could not clear history: ${error.message}`);
    }
}

async function loadCustomers() {
    const content = document.getElementById('customers-content');

    const [customers, barbers, assignments] = await Promise.all([
        api.dbQuery('SELECT id, name, phone, total_visits, total_spent FROM customers WHERE is_active = 1 ORDER BY created_at DESC LIMIT 50'),
        api.dbQuery('SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT cb.customer_id, cb.barber_id, b.name AS barber_name FROM customer_barbers cb JOIN barbers b ON b.id = cb.barber_id ORDER BY b.name')
    ]);
    const assignmentsByCustomer = new Map();
    assignments.forEach(assignment => {
        const assigned = assignmentsByCustomer.get(Number(assignment.customer_id)) || [];
        assigned.push(Number(assignment.barber_id));
        assignmentsByCustomer.set(Number(assignment.customer_id), assigned);
    });
    const barberOptions = barbers.map(barber => `<option value="${barber.id}">${escapeHtml(barber.name)}</option>`).join('');

    content.innerHTML = `
        <div class="form-group">
            <label for="customer-name">Customer Name</label>
            <input type="text" id="customer-name">
        </div>
        <div class="form-group">
            <label for="customer-phone">Phone</label>
            <input type="text" id="customer-phone">
        </div>
        <div class="form-group">
            <label for="new-customer-barbers">Assign barbers</label>
            <select id="new-customer-barbers" multiple size="3">${barberOptions}</select>
        </div>
        <div class="form-group">
            <button class="btn btn-primary" id="save-customer-btn">Add Customer</button>
        </div>

        <div class="customer-list">
            ${customers.length ? customers.map(customer => `
                <div class="appointment-item customer-record">
                    <div>
                        <div class="appointment-time">${escapeHtml(customer.name || 'Walk-in')}</div>
                        <div>${escapeHtml(customer.phone || 'No phone')}</div>
                        <div>${escapeHtml((assignments
                            .filter(assignment => Number(assignment.customer_id) === Number(customer.id))
                            .map(assignment => assignment.barber_name)
                            .join(', ')) || 'Unassigned')}</div>
                        <div>Visits: ${customer.total_visits || 0} | Spent: ${formatCurrency(customer.total_spent || 0)}</div>
                    </div>
                    <div class="appointment-actions">
                        <button class="btn btn-primary btn-sm" data-schedule-customer="${customer.id}">Schedule</button>
                        <button class="btn btn-danger btn-sm" data-delete-customer="${customer.id}">Delete</button>
                    </div>
                    <div class="form-group customer-barber-assignment">
                        <label for="customer-barbers-${customer.id}">Assign barbers</label>
                        <select id="customer-barbers-${customer.id}" multiple size="3" data-customer-barbers="${customer.id}">
                            ${barbers.map(barber => `<option value="${barber.id}" ${assignmentsByCustomer.get(Number(customer.id))?.includes(Number(barber.id)) ? 'selected' : ''}>${escapeHtml(barber.name)}</option>`).join('')}
                        </select>
                        <button class="btn btn-sm" data-save-customer-barbers="${customer.id}">Save Barbers</button>
                    </div>
                </div>
            `).join('') : '<p>No customers yet.</p>'}
        </div>
    `;

    document.getElementById('save-customer-btn').addEventListener('click', async () => {
        const name = document.getElementById('customer-name').value.trim();
        const phone = document.getElementById('customer-phone').value.trim();
        const barberIds = [...document.getElementById('new-customer-barbers').selectedOptions]
            .map(option => Number(option.value));

        if (!name && !phone) {
            alert('Enter a customer name or phone number.');
            return;
        }

        const result = await api.dbRun('INSERT INTO customers (name, phone, total_visits, total_spent) VALUES (?, ?, 0, 0)', [name || null, phone || null]);
        for (const barberId of barberIds) {
            await api.dbRun('INSERT INTO customer_barbers (customer_id, barber_id) VALUES (?, ?)', [result.lastID, barberId]);
        }
        await loadCustomers();
        alert('Customer added.');
    });

    content.onclick = async (event) => {
        const saveBarbersButton = event.target.closest('[data-save-customer-barbers]');
        if (saveBarbersButton) {
            const customerId = Number(saveBarbersButton.dataset.saveCustomerBarbers);
            const select = content.querySelector(`[data-customer-barbers="${customerId}"]`);
            const barberIds = [...select.selectedOptions].map(option => Number(option.value));
            try {
                await api.dbRun('DELETE FROM customer_barbers WHERE customer_id = ?', [customerId]);
                for (const barberId of barberIds) {
                    await api.dbRun('INSERT INTO customer_barbers (customer_id, barber_id) VALUES (?, ?)', [customerId, barberId]);
                }
                await loadCustomers();
            } catch (error) {
                console.error('Could not assign customer to barbers:', error);
                alert(`Could not assign customer to barbers: ${error.message}`);
            }
            return;
        }

        const deleteButton = event.target.closest('[data-delete-customer]');
        if (deleteButton) {
            const customerId = Number(deleteButton.dataset.deleteCustomer);
            if (!Number.isInteger(customerId) || !confirm('Remove this customer from active customers? Past appointments will remain in history.')) return;

            try {
                const result = await api.dbRun('UPDATE customers SET is_active = 0 WHERE id = ?', [customerId]);
                if (result.changes > 0) await loadCustomers();
            } catch (error) {
                console.error('Could not remove customer:', error);
                alert(`Could not remove customer: ${error.message}`);
            }
            return;
        }

        const scheduleButton = event.target.closest('[data-schedule-customer]');
        if (!scheduleButton) return;

        pendingScheduleCustomerId = Number(scheduleButton.dataset.scheduleCustomer);
        showPage('schedule');
        setActiveNav(document.querySelector('[data-page="schedule"]'));
    };
}

async function loadBarbers() {
    const content = document.getElementById('barbers-content');
    const [barbers, assignments] = await Promise.all([
        api.dbQuery('SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT cb.barber_id, c.name AS customer_name FROM customer_barbers cb JOIN customers c ON c.id = cb.customer_id WHERE c.is_active = 1 ORDER BY c.name')
    ]);
    const customersByBarber = new Map();
    assignments.forEach(assignment => {
        const customers = customersByBarber.get(Number(assignment.barber_id)) || [];
        customers.push(assignment.customer_name || 'Walk-in');
        customersByBarber.set(Number(assignment.barber_id), customers);
    });

    content.innerHTML = `
        <div class="form-group">
            <label for="barber-name">Barber name</label>
            <input type="text" id="barber-name">
        </div>
        <div class="form-group">
            <button class="btn btn-primary" id="add-barber-btn">Add Barber</button>
        </div>
        <div class="customer-list">
            ${barbers.length ? barbers.map(barber => {
                const customers = customersByBarber.get(Number(barber.id)) || [];
                return `
                    <div class="appointment-item">
                        <div>
                            <div class="appointment-time">${escapeHtml(barber.name)}</div>
                            <div>Customers: ${customers.length ? escapeHtml(customers.join(', ')) : 'No customers assigned.'}</div>
                        </div>
                        <button class="btn btn-danger btn-sm" data-deactivate-barber="${barber.id}">Deactivate</button>
                    </div>
                `;
            }).join('') : '<p>No barbers yet.</p>'}
        </div>
    `;

    document.getElementById('add-barber-btn').addEventListener('click', async () => {
        const name = document.getElementById('barber-name').value.trim();
        if (!name) {
            alert('Enter a barber name.');
            return;
        }

        try {
            await api.dbRun('INSERT INTO barbers (name) VALUES (?)', [name]);
            await loadBarbers();
        } catch (error) {
            console.error('Could not add barber:', error);
            alert(`Could not add barber: ${error.message}`);
        }
    });

    content.onclick = async event => {
        const deactivateButton = event.target.closest('[data-deactivate-barber]');
        if (!deactivateButton) return;
        const barberId = Number(deactivateButton.dataset.deactivateBarber);
        if (!Number.isInteger(barberId) || !confirm('This barber will no longer be available for new assignments. Past orders and customer assignments will remain.')) return;

        try {
            await api.dbRun('UPDATE barbers SET is_active = 0 WHERE id = ?', [barberId]);
            await loadBarbers();
        } catch (error) {
            console.error('Could not deactivate barber:', error);
            alert(`Could not deactivate barber: ${error.message}`);
        }
    };
}

async function loadHistory() {
    const content = document.getElementById('history-content');
    const today = getLocalDateString();
    const appointments = await api.dbQuery(
        `SELECT a.id, a.date, a.time, a.status,
                COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name,
                c.phone, s.name AS service_name
         FROM appointments a
         LEFT JOIN customers c ON c.id = a.customer_id
         LEFT JOIN services s ON s.id = a.service_id
         WHERE a.date < ? OR (a.date = ? AND a.status IN ('completed', 'cancelled'))
         ORDER BY a.date DESC, a.time DESC`,
        [today, today]
    );
    historyAppointmentIds = appointments.map(appointment => Number(appointment.id));
    const completedVisits = appointments.filter(appointment => appointment.status === 'completed').length;

    content.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card">
                <h3>Recorded Appointments</h3>
                <div class="value">${appointments.length}</div>
            </div>
            <div class="stat-card">
                <h3>Completed Visits</h3>
                <div class="value">${completedVisits}</div>
            </div>
        </div>
        <div class="history-toolbar">
            <label class="history-select-all">
                <input type="checkbox" id="select-all-history" ${appointments.length ? '' : 'disabled'}>
                <span>Select all</span>
            </label>
            <span id="history-selection-count">0 selected</span>
            <div class="history-actions">
                <button type="button" class="btn btn-danger btn-sm" id="delete-selected-history" disabled>Delete Selected</button>
                <button type="button" class="btn btn-danger btn-sm" id="delete-all-history" ${appointments.length ? '' : 'disabled'}>Delete All History</button>
            </div>
        </div>
        <div class="appointment-list">
            ${appointments.length ? appointments.map(appointment => `
                <div class="appointment-item history-item">
                    <label class="history-row-select" aria-label="Select ${escapeHtml(appointment.customer_name)} visit">
                        <input type="checkbox" data-history-selection="${appointment.id}">
                    </label>
                    <div>
                        <div class="appointment-time">${escapeHtml(appointment.date)} at ${escapeHtml(appointment.time)}</div>
                        <div>${escapeHtml(appointment.customer_name)}${appointment.phone ? ` · ${escapeHtml(appointment.phone)}` : ''}</div>
                        <div>${escapeHtml(appointment.service_name || 'Service unavailable')}</div>
                    </div>
                    <span class="appointment-status status-${String(appointment.status || 'scheduled').replace(/[^a-z-]/g, '-')}" >${escapeHtml((appointment.status || 'scheduled').replace('-', ' '))}</span>
                </div>
            `).join('') : '<p>No appointment history yet.</p>'}
        </div>
    `;

    content.onchange = event => {
        if (event.target.id === 'select-all-history') {
            content.querySelectorAll('[data-history-selection]').forEach(checkbox => {
                checkbox.checked = event.target.checked;
            });
        }
        if (event.target.id === 'select-all-history' || event.target.matches('[data-history-selection]')) {
            updateHistorySelection();
        }
    };

    content.onclick = async event => {
        const selectedIds = [...content.querySelectorAll('[data-history-selection]:checked')]
            .map(checkbox => Number(checkbox.dataset.historySelection));

        if (event.target.closest('#delete-selected-history')) {
            if (!selectedIds.length || !confirm('Delete selected history items? This cannot be undone.')) return;
            await deleteHistoryAppointments(selectedIds);
        } else if (event.target.closest('#delete-all-history')) {
            if (!historyAppointmentIds.length || !confirm('Delete all past visit history? Future appointments will remain. This cannot be undone.')) return;
            await deleteHistoryAppointments(historyAppointmentIds);
        }
    };

    updateHistorySelection();
}

function updateHistorySelection() {
    const content = document.getElementById('history-content');
    if (!content) return;

    const checkboxes = [...content.querySelectorAll('[data-history-selection]')];
    const selectedCount = checkboxes.filter(checkbox => checkbox.checked).length;
    const selectAll = document.getElementById('select-all-history');
    const selectedLabel = document.getElementById('history-selection-count');
    const deleteSelectedButton = document.getElementById('delete-selected-history');

    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    }
    if (selectedLabel) selectedLabel.textContent = `${selectedCount} selected`;
    if (deleteSelectedButton) deleteSelectedButton.disabled = selectedCount === 0;
}

async function deleteHistoryAppointments(appointmentIds) {
    try {
        await Promise.all(appointmentIds.map(appointmentId =>
            api.dbRun('DELETE FROM appointments WHERE id = ?', [appointmentId])
        ));
        await loadHistory();
    } catch (error) {
        console.error('Could not delete visit history:', error);
        alert(`Could not delete visit history: ${error.message}`);
    }
}

async function loadServices() {
    const content = document.getElementById('services-content');
    const services = await api.dbQuery('SELECT id, name, price, duration FROM services WHERE is_active = 1 ORDER BY name');

    content.innerHTML = `
        <div class="form-group">
            <button class="btn btn-primary" id="add-service-btn">Add Service</button>
        </div>

        <div class="service-list">
            ${services.map(service => `
                <div class="service-item">
                    <div class="service-name">${escapeHtml(service.name)}</div>
                    <div class="service-price">${formatCurrency(service.price)}</div>
                    <div class="service-duration">${service.duration} min</div>
                    <div class="service-actions">
                        <button class="btn btn-sm" data-edit-service="${service.id}">Edit</button>
                        <button class="btn btn-sm btn-danger" data-delete-service="${service.id}">Delete</button>
                    </div>
                </div>
            `).join('') || '<p>No services available.</p>'}
        </div>

        <div id="service-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <h3 id="service-modal-title">Add Service</h3>
                <div class="form-group">
                    <label for="service-name">Name</label>
                    <input type="text" id="service-name">
                </div>
                <div class="form-group">
                    <label for="service-price">Price</label>
                    <input type="number" id="service-price" step="0.01">
                </div>
                <div class="form-group">
                    <label for="service-duration">Duration (minutes)</label>
                    <input type="number" id="service-duration">
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" id="save-service-btn">Save</button>
                    <button class="btn" id="cancel-service-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('add-service-btn').addEventListener('click', () => openServiceModal());
    document.getElementById('cancel-service-btn').addEventListener('click', closeServiceModal);
    document.getElementById('save-service-btn').addEventListener('click', saveService);

    document.querySelectorAll('[data-delete-service]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = Number(button.dataset.deleteService);
            await api.dbRun('UPDATE services SET is_active = 0 WHERE id = ?', [id]);
            await loadServices();
        });
    });

    document.querySelectorAll('[data-edit-service]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = Number(button.dataset.editService);
            const service = (await api.dbQuery('SELECT id, name, price, duration FROM services WHERE id = ?', [id]))[0];
            if (!service) return;
            openServiceModal(service);
        });
    });
}

function openServiceModal(service = null) {
    const modal = document.getElementById('service-modal');
    const title = document.getElementById('service-modal-title');
    const nameInput = document.getElementById('service-name');
    const priceInput = document.getElementById('service-price');
    const durationInput = document.getElementById('service-duration');

    modal.style.display = 'flex';
    title.textContent = service ? 'Edit Service' : 'Add Service';
    nameInput.value = service?.name || '';
    priceInput.value = service?.price || '';
    durationInput.value = service?.duration || '';
    localStorage.setItem('editingServiceId', service ? String(service.id) : '');
}

function closeServiceModal() {
    document.getElementById('service-modal').style.display = 'none';
    localStorage.removeItem('editingServiceId');
}

async function saveService() {
    const name = document.getElementById('service-name').value.trim();
    const price = Number(document.getElementById('service-price').value);
    const duration = Number(document.getElementById('service-duration').value);
    const id = localStorage.getItem('editingServiceId');

    if (!name || !price || !duration) {
        alert('Fill in all service fields.');
        return;
    }

    if (id) {
        await api.dbRun('UPDATE services SET name = ?, price = ?, duration = ? WHERE id = ?', [name, price, duration, Number(id)]);
    } else {
        await api.dbRun('INSERT INTO services (name, price, duration, is_active) VALUES (?, ?, ?, 1)', [name, price, duration]);
    }

    closeServiceModal();
    await loadServices();
    alert('Service saved.');
}

async function loadProducts() {
    const content = document.getElementById('products-content');
    const [products, categories] = await Promise.all([
        api.dbQuery('SELECT p.id, p.name, p.price, p.stock, p.description, p.category_id, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 ORDER BY p.name'),
        api.dbQuery('SELECT id, name FROM categories ORDER BY name')
    ]);

    content.innerHTML = `
        <div class="form-group">
            <button class="btn btn-primary" id="add-product-btn">Add Product</button>
        </div>

        <div class="product-list">
            ${products.map(product => `
                <div class="product-item">
                    <div class="product-image-placeholder">[Image]</div>
                    <div class="product-info">
                        <div class="product-name">${escapeHtml(product.name)}</div>
                        <div class="product-price">${formatCurrency(product.price)}</div>
                        <div class="product-stock">Stock: ${product.stock}</div>
                        <div class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</div>
                    </div>
                    <div class="product-actions">
                        <button class="btn btn-sm" data-edit-product="${product.id}">Edit</button>
                        <button class="btn btn-sm btn-danger" data-delete-product="${product.id}">Delete</button>
                    </div>
                </div>
            `).join('') || '<p>No products available.</p>'}
        </div>

        <div id="product-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <h3 id="product-modal-title">Add Product</h3>
                <div class="form-group">
                    <label for="product-name">Product Name</label>
                    <input type="text" id="product-name">
                </div>
                <div class="form-group">
                    <label for="product-price">Price</label>
                    <input type="number" id="product-price" step="0.01">
                </div>
                <div class="form-group">
                    <label for="product-stock">Stock</label>
                    <input type="number" id="product-stock">
                </div>
                <div class="form-group">
                    <label for="product-description">Description</label>
                    <textarea id="product-description" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label for="product-category">Category</label>
                    <select id="product-category">
                        <option value="">Uncategorized</option>
                        ${categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="btn-group">
                    <button class="btn btn-primary" id="save-product-btn">Save</button>
                    <button class="btn" id="cancel-product-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('add-product-btn').addEventListener('click', () => openProductModal());
    document.getElementById('cancel-product-btn').addEventListener('click', closeProductModal);
    document.getElementById('save-product-btn').addEventListener('click', saveProduct);

    document.querySelectorAll('[data-delete-product]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = Number(button.dataset.deleteProduct);
            await api.dbRun('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
            await loadProducts();
        });
    });

    document.querySelectorAll('[data-edit-product]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = Number(button.dataset.editProduct);
            const product = (await api.dbQuery('SELECT id, name, price, stock, description, category_id FROM products WHERE id = ?', [id]))[0];
            if (!product) return;
            openProductModal(product);
        });
    });
}

function openProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('product-modal-title');
    document.getElementById('product-name').value = product?.name || '';
    document.getElementById('product-price').value = product?.price || '';
    document.getElementById('product-stock').value = product?.stock || '';
    document.getElementById('product-description').value = product?.description || '';
    document.getElementById('product-category').value = product?.category_id || '';
    title.textContent = product ? 'Edit Product' : 'Add Product';
    localStorage.setItem('editingProductId', product ? String(product.id) : '');
    modal.style.display = 'flex';
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
    localStorage.removeItem('editingProductId');
}

async function saveProduct() {
    const name = document.getElementById('product-name').value.trim();
    const priceValue = document.getElementById('product-price').value.trim();
    const stockValue = document.getElementById('product-stock').value.trim();
    const price = Number(priceValue);
    const stock = Number(stockValue);
    const description = document.getElementById('product-description').value.trim();
    const categoryValue = document.getElementById('product-category').value;
    const categoryId = categoryValue ? Number(categoryValue) : null;
    const productId = localStorage.getItem('editingProductId');

    if (!name || priceValue === '' || !Number.isFinite(price) || price < 0 || stockValue === '' || !Number.isInteger(stock) || stock < 0) {
        alert('Enter a product name, a valid non-negative price, and a whole-number stock quantity.');
        return;
    }

    try {
        if (productId) {
            await api.dbRun('UPDATE products SET name = ?, price = ?, stock = ?, description = ?, category_id = ? WHERE id = ?', [name, price, stock, description, categoryId, Number(productId)]);
        } else {
            await api.dbRun('INSERT INTO products (name, price, stock, description, category_id, is_active) VALUES (?, ?, ?, ?, ?, 1)', [name, price, stock, description, categoryId]);
        }

        closeProductModal();
        await loadProducts();
        alert('Product saved.');
    } catch (error) {
        console.error('Could not save product:', error);
        alert(`Could not save product: ${error.message}`);
    }
}

async function loadCategories() {
    const content = document.getElementById('categories-content');
    const categories = await api.dbQuery('SELECT id, name FROM categories ORDER BY name');
    content.innerHTML = `
        <div class="form-group">
            <label for="category-name">Category name</label>
            <input type="text" id="category-name" maxlength="80">
            <button type="button" class="btn btn-primary" id="save-category-btn">Add Category</button>
        </div>
        <div class="product-list">
            ${categories.map(category => `
                <div class="product-item">
                    <div class="product-info"><div class="product-name">${escapeHtml(category.name)}</div></div>
                    <div class="product-actions">
                        <button type="button" class="btn btn-sm btn-danger" data-delete-category="${category.id}">Delete</button>
                    </div>
                </div>
            `).join('') || '<p>No categories yet.</p>'}
        </div>
    `;

    document.getElementById('save-category-btn').addEventListener('click', async () => {
        const name = document.getElementById('category-name').value.trim();
        if (!name) {
            alert('Enter a category name.');
            return;
        }
        try {
            await api.dbRun('INSERT INTO categories (name) VALUES (?)', [name]);
            await loadCategories();
            await loadProducts();
        } catch (error) {
            alert(`Could not save category: ${error.message}`);
        }
    });

    content.querySelectorAll('[data-delete-category]').forEach(button => {
        button.addEventListener('click', async () => {
            if (!confirm('Delete this category? Products in it will become uncategorized.')) return;
            const id = Number(button.dataset.deleteCategory);
            try {
                await api.runTransaction([
                    { query: 'UPDATE products SET category_id = NULL WHERE category_id = ?', params: [id] },
                    { query: 'DELETE FROM categories WHERE id = ?', params: [id] }
                ]);
                await loadCategories();
                await loadProducts();
            } catch (error) {
                alert(`Could not delete category: ${error.message}`);
            }
        });
    });
}

async function loadSettings() {
    const content = document.getElementById('settings-content');
    const settings = (await api.dbQuery('SELECT shop_name, phone, address, currency FROM settings ORDER BY id DESC LIMIT 1'))[0] || {
        shop_name: 'XBARBER SHOP',
        phone: '',
        address: '',
        currency: 'USD',
    };

    content.innerHTML = `
        <div class="form-group">
            <label for="interface-language">Language</label>
            <select id="interface-language">
                <option value="en">English</option>
                <option value="ckb">کوردی (سۆرانی)</option>
            </select>
        </div>
        <div class="form-group">
            <label for="shop-name">Shop Name</label>
            <input type="text" id="shop-name" value="${escapeHtml(settings.shop_name || 'XBARBER SHOP')}">
        </div>
        <div class="form-group">
            <label for="shop-phone">Phone</label>
            <input type="text" id="shop-phone" value="${escapeHtml(settings.phone || '')}">
        </div>
        <div class="form-group">
            <label for="shop-address">Address</label>
            <textarea id="shop-address" rows="3">${escapeHtml(settings.address || '')}</textarea>
        </div>
        <div class="form-group">
            <label for="shop-currency">Currency</label>
            <select id="shop-currency">
                <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD</option>
                <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                <option value="IQD" ${settings.currency === 'IQD' ? 'selected' : ''}>IQD</option>
            </select>
        </div>
        <div class="btn-group">
            <button class="btn btn-primary" id="save-settings-btn">Save Settings</button>
            <button class="btn" id="backup-db-btn">Backup DB</button>
        </div>
        <div class="btn-group">
            <button class="btn btn-danger" id="restore-db-btn">Restore DB</button>
        </div>
    `;

    const languageSelect = document.getElementById('interface-language');
    languageSelect.value = interfaceLanguage;
    languageSelect.addEventListener('change', () => setInterfaceLanguage(languageSelect.value));

    document.getElementById('save-settings-btn').addEventListener('click', async () => {
        const shopName = document.getElementById('shop-name').value.trim() || 'XBARBER SHOP';
        const phone = document.getElementById('shop-phone').value.trim();
        const address = document.getElementById('shop-address').value.trim();
        const currency = document.getElementById('shop-currency').value;

        await api.dbRun(
            'INSERT INTO settings (shop_name, phone, address, currency) VALUES (?, ?, ?, ?)',
            [shopName, phone, address, currency]
        );

        alert('Settings saved.');
    });

    document.getElementById('backup-db-btn').addEventListener('click', async () => {
        if (window.webApi) {
            try {
                const isLocalDatabase = await api.isLocalDatabase();
                const backupPath = await api.backupDatabase();
                alert(isLocalDatabase
                    ? `Database backup downloaded: ${backupPath}`
                    : `Database backup created. ${backupPath}`);
            } catch (error) {
                alert(`Could not create backup: ${error.message}`);
            }
            return;
        }

        const path = prompt('Enter backup file path (e.g. C:/backup/xbarber.db):');
        if (!path) return;
        await api.backupDatabase(path);
        alert('Database backup created.');
    });

    document.getElementById('restore-db-btn').addEventListener('click', async () => {
        if (window.webApi) {
            try {
                const isLocalDatabase = await api.isLocalDatabase();
                if (isLocalDatabase) {
                    const result = await api.restoreDatabase();
                    if (result.canceled) return;
                } else {
                    const path = prompt('Enter backup file path to restore:');
                    if (!path) return;
                    await api.restoreDatabase(path);
                }
                alert('Database restored.');
                showPage(activePageName);
            } catch (error) {
                alert(`Could not restore backup: ${error.message}`);
            }
            return;
        }

        const path = prompt('Enter backup file path to restore:');
        if (!path) return;
        await api.restoreDatabase(path);
        alert('Database restored.');
    });
}