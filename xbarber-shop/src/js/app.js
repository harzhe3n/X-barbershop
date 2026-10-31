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
    'Appointments & Cashier': 'وادەکان و کاشێر',
    'Appointments and cashier': 'وادەکان و کاشێر',
    'Daily workspace': 'شوێنی کاری ڕۆژانە',
    'Appointments': 'وادەکان',
    'View date': 'بینینی ڕێکەوت',
    'New appointment': 'وادەی نوێ',
    'Manage bookings, update their details, and move customers straight into checkout.': 'وادەکان بەڕێوەببە، وردەکارییان دەستکاری بکە، و ڕاستەوخۆ کڕیارەکان بنێرە بۆ کاشێر.',
    'Tap Edit to update any booking detail': 'دەستکاری بکە بۆ نوێکردنەوەی هەر وردەکارییەکی وادە',
    'Edit details': 'دەستکاریکردنی وردەکارییەکان',
    'Main Service': 'خزمەتگوزاریی سەرەکی',
    'Appointment Status': 'باری وادە',
    'Additional Services (Optional)': 'خزمەتگوزاریی زیادە (ئارەزوومەندانە)',
    'Notes (Optional)': 'تێبینی (ئارەزوومەندانە)',
    'Edit Appointment': 'دەستکاریکردنی وادە',
    'Save Changes': 'پاشەکەوتکردنی گۆڕانکارییەکان',
    'Appointment updated successfully.': 'وادەکە بە سەرکەوتوویی نوێکرایەوە.',
    'Could not save appointment:': 'نەتوانرا وادەکە پاشەکەوت بکرێت:',
    'Appointment could not be found.': 'وادەکە نەدۆزرایەوە.',
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
let selectedCashierAppointmentId = null;
let selectedCashierCustomerId = null;
let selectedCashierAppointmentServices = [];
let appointmentServices = [];
let draftProductImageData = null;
let activePageName = 'dashboard';
let activeWorkspaceTab = 'appointments';
let editingAppointmentId = null;

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

    document.querySelectorAll('[data-workspace-view]').forEach(tab => {
        tab.addEventListener('click', () => selectWorkspaceTab(tab.dataset.workspaceView));
    });

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
    const targetPageName = ['history', 'services', 'products', 'schedule', 'cashier'].includes(pageName)
        ? ({ history: 'customers', services: 'catalog', products: 'catalog', schedule: 'workspace', cashier: 'workspace' })[pageName]
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
        case 'workspace':
        case 'schedule':
        case 'cashier':
            if (pageName === 'schedule') activeWorkspaceTab = 'appointments';
            if (pageName === 'cashier') activeWorkspaceTab = 'cashier';
            loadWorkspace();
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

function selectWorkspaceTab(tabName) {
    activeWorkspaceTab = tabName === 'cashier' ? 'cashier' : 'appointments';
    document.querySelectorAll('[data-workspace-view]').forEach(tab => {
        const selected = tab.dataset.workspaceView === activeWorkspaceTab;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
    });
    document.getElementById('schedule-content').hidden = activeWorkspaceTab !== 'appointments';
    document.getElementById('cashier-content').hidden = activeWorkspaceTab !== 'cashier';
}

async function loadWorkspace() {
    selectWorkspaceTab(activeWorkspaceTab);
    await loadSchedule();
    await loadCashier();
    selectWorkspaceTab(activeWorkspaceTab);
}

function setActiveNav(activeLink) {
    navLinks.forEach(link => link.classList.remove('active'));
    if (activeLink) activeLink.classList.add('active');
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IQD' }).format(Number(value || 0));
}

function readImageFile(file) {
    if (!file) return Promise.resolve(null);
    if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose an image file.'));
    if (file.size > 12 * 1024 * 1024) return Promise.reject(new Error('Choose an image smaller than 12 MB.'));

    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d');
            if (!context) {
                reject(new Error('Could not prepare this image.'));
                return;
            }
            try {
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            } catch (error) {
                reject(error);
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('This image could not be opened. Try a JPEG or PNG image.'));
        };
        image.src = url;
    });
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
        <section class="appointments-hero">
            <div>
                <span class="appointments-eyebrow">Daily workspace</span>
                <h3>Appointments</h3>
                <p>Manage bookings, update their details, and move customers straight into checkout.</p>
            </div>
            <button type="button" class="btn btn-primary" id="add-appointment-btn">+ New appointment</button>
        </section>
        <div class="schedule-controls appointments-toolbar">
            <div class="schedule-date-selector">
                <label for="schedule-date">View date</label>
                <input type="date" id="schedule-date" value="${getLocalDateString()}">
            </div>
            <span class="appointments-day-label" id="appointments-day-label"></span>
        </div>

        <div class="appointment-list" id="appointment-list"></div>

        <div id="appointment-modal" class="modal" style="display:none;">
            <div class="modal-content">
                <h3 id="appointment-modal-title">New Appointment</h3>
                <div class="appointment-form-grid">
                    <div class="form-group">
                        <label for="modal-date">Date</label>
                        <input type="date" id="modal-date" required>
                    </div>
                    <div class="form-group">
                        <label for="modal-time">Time</label>
                        <input type="time" id="modal-time" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="modal-existing-customer">Saved Customer</label>
                    <select id="modal-existing-customer">
                        <option value="">New customer or walk-in</option>
                    </select>
                </div>
                <div class="appointment-form-grid">
                    <div class="form-group">
                        <label for="modal-customer">Customer Name (Optional)</label>
                        <input type="text" id="modal-customer">
                    </div>
                    <div class="form-group">
                        <label for="modal-phone">Phone Number (Optional)</label>
                        <input type="text" id="modal-phone" inputmode="tel">
                    </div>
                </div>
                <div class="appointment-form-grid">
                    <div class="form-group">
                        <label for="modal-service">Main Service</label>
                        <select id="modal-service" required></select>
                    </div>
                    <div class="form-group">
                        <label for="modal-status">Appointment Status</label>
                        <select id="modal-status">
                            <option value="scheduled">scheduled</option>
                            <option value="waiting">waiting</option>
                            <option value="in-service">in-service</option>
                            <option value="completed">completed</option>
                            <option value="cancelled">cancelled</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <fieldset class="appointment-additional-services">
                        <legend>Additional Services (Optional)</legend>
                        <div id="modal-additional-services" class="appointment-service-checkboxes"></div>
                    </fieldset>
                </div>
                <div class="form-group">
                    <label for="modal-notes">Notes (Optional)</label>
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
    document.getElementById('add-appointment-btn').addEventListener('click', () => openAppointmentModal());
    document.getElementById('modal-existing-customer').addEventListener('change', updateAppointmentCustomerFields);
    document.getElementById('cancel-appointment-btn').addEventListener('click', closeAppointmentModal);
    document.getElementById('save-appointment-btn').addEventListener('click', saveAppointment);
    document.getElementById('appointment-list').addEventListener('click', async (event) => {
        const editButton = event.target.closest('[data-edit-appointment]');
        if (editButton) {
            await openAppointmentModal(null, Number(editButton.dataset.editAppointment));
            return;
        }
        const deleteButton = event.target.closest('[data-delete-appointment]');
        if (!deleteButton) return;

        const appointmentId = Number(deleteButton.dataset.deleteAppointment);
        if (!Number.isInteger(appointmentId)) return;

        if (!confirm('Delete appointment?')) return;

        const result = await api.dbRun('DELETE FROM appointments WHERE id = ?', [appointmentId]);
        if (result.changes > 0) {
            if (selectedCashierAppointmentId === appointmentId) {
                selectedCashierAppointmentId = null;
                selectedCashierCustomerId = null;
                if (selectedCashierAppointmentServices.length) {
                    currentOrder = currentOrder.filter(item => !selectedCashierAppointmentServices.includes(item));
                    selectedCashierAppointmentServices = [];
                    renderCashierOrder();
                }
            }
            await loadAppointmentsForSelectedDate();
            if (!currentOrder.length) await loadCashier();
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
        if (!currentOrder.length) await loadCashier();
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

    const services = await api.dbQuery('SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name');
    appointmentServices = services;
    select.innerHTML = services.length
        ? services.map(service => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join('')
        : '<option value="">No services available</option>';
    document.getElementById('modal-additional-services').innerHTML = services.map(service =>
        `<label><input type="checkbox" value="${service.id}"> ${escapeHtml(service.name)}</label>`
    ).join('');
}

async function loadAppointmentCustomers() {
    const select = document.getElementById('modal-existing-customer');
    const customers = await api.dbQuery('SELECT id, name, phone, is_active FROM customers ORDER BY name');

    select.innerHTML = '<option value="">New customer or walk-in</option>' + customers.map(customer =>
        `<option value="${customer.id}">${escapeHtml(customer.name || 'Unnamed customer')}${customer.phone ? ` - ${escapeHtml(customer.phone)}` : ''}${Number(customer.is_active) ? '' : ' (inactive)'}</option>`
    ).join('');
}

async function updateAppointmentCustomerFields() {
    const customerId = Number(document.getElementById('modal-existing-customer').value);
    const nameInput = document.getElementById('modal-customer');
    const phoneInput = document.getElementById('modal-phone');

    if (!customerId) {
        nameInput.value = '';
        phoneInput.value = '';
        return;
    }

    const customer = (await api.dbQuery('SELECT id, name, phone FROM customers WHERE id = ?', [customerId]))[0];
    if (!customer) return;

    nameInput.value = customer.name || '';
    phoneInput.value = customer.phone || '';
}

async function openAppointmentModal(customerId = null, appointmentId = null) {
    const modal = document.getElementById('appointment-modal');
    editingAppointmentId = appointmentId;
    document.getElementById('appointment-modal-title').textContent = appointmentId ? 'Edit Appointment' : 'New Appointment';
    document.getElementById('save-appointment-btn').textContent = appointmentId ? 'Save Changes' : 'Save Appointment';
    document.getElementById('modal-date').value = document.getElementById('schedule-date').value;
    document.getElementById('modal-time').value = '09:00';
    document.getElementById('modal-existing-customer').value = customerId ? String(customerId) : '';
    document.getElementById('modal-customer').value = '';
    document.getElementById('modal-phone').value = '';
    document.getElementById('modal-notes').value = '';
    document.getElementById('modal-service').selectedIndex = 0;
    document.getElementById('modal-status').value = 'scheduled';
    document.querySelectorAll('#modal-additional-services input[type="checkbox"]').forEach(input => { input.checked = false; });

    if (customerId) await updateAppointmentCustomerFields();
    if (appointmentId) {
        const appointment = (await api.dbQuery(
            'SELECT id, date, time, customer_id, service_id, additional_services, notes, status FROM appointments WHERE id = ?',
            [appointmentId]
        ))[0];
        if (!appointment) {
            alert('Appointment could not be found.');
            return;
        }
        document.getElementById('modal-date').value = appointment.date;
        document.getElementById('modal-time').value = appointment.time;
        document.getElementById('modal-existing-customer').value = appointment.customer_id ? String(appointment.customer_id) : '';
        if (appointment.customer_id) await updateAppointmentCustomerFields();
        document.getElementById('modal-service').value = String(appointment.service_id);
        document.getElementById('modal-notes').value = appointment.notes || '';
        document.getElementById('modal-status').value = appointment.status || 'scheduled';
        let additionalServices = [];
        try {
            additionalServices = JSON.parse(appointment.additional_services || '[]');
        } catch (error) {
            console.warn('Ignoring invalid appointment additional-services data:', error);
        }
        const additionalIds = new Set(additionalServices.map(Number));
        document.querySelectorAll('#modal-additional-services input[type="checkbox"]').forEach(input => {
            input.checked = additionalIds.has(Number(input.value)) && Number(input.value) !== Number(appointment.service_id);
        });
    }

    modal.style.display = 'flex';
}

function closeAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    modal.style.display = 'none';
    editingAppointmentId = null;
}

async function loadAppointmentsForSelectedDate() {
    const date = document.getElementById('schedule-date').value;
    const list = document.getElementById('appointment-list');
    const dayLabel = document.getElementById('appointments-day-label');
    if (dayLabel) dayLabel.textContent = date ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }) : '';

    if (!date) {
        list.innerHTML = '<p>Select a date to view appointments.</p>';
        return;
    }

    const appointments = await api.dbQuery(
        `SELECT a.id, a.date, a.time, a.status, a.notes, a.additional_services,
                a.service_id, a.customer_id, s.name AS service_name,
                COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name, c.phone AS customer_phone
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
    list.innerHTML = `
        <div class="appointments-list-heading">
            <div><strong>${appointments.length}</strong> appointment${appointments.length === 1 ? '' : 's'}</div>
            <span>Tap Edit to update any booking detail</span>
        </div>
        ${appointments.map((appointment) => {
        const selectedStatus = appointment.status || 'scheduled';
        const optionMarkup = statusOptions.map(option => 
            `<option value="${option}" ${option === selectedStatus ? 'selected' : ''}>${option}</option>`
        ).join('');
        let additionalServiceNames = [];
        try {
            const ids = JSON.parse(appointment.additional_services || '[]').map(Number);
            additionalServiceNames = ids
                .filter(id => id !== Number(appointment.service_id))
                .map(id => appointmentServices.find(service => Number(service.id) === id)?.name)
                .filter(Boolean);
        } catch (error) {
            console.warn('Ignoring invalid appointment additional-services data:', error);
        }

        return `
            <article class="appointment-item appointment-card">
                <div class="appointment-card-time">
                    <strong>${escapeHtml(appointment.time)}</strong>
                    <span>${escapeHtml(appointment.date)}</span>
                </div>
                <div class="appointment-card-details">
                    <strong>${escapeHtml(appointment.customer_name)}</strong>
                    ${appointment.customer_phone ? `<span>${escapeHtml(appointment.customer_phone)}</span>` : '<span>Walk-in / no phone</span>'}
                    <span>${escapeHtml(appointment.service_name || 'Service unavailable')}${additionalServiceNames.length ? ` · + ${escapeHtml(additionalServiceNames.join(', '))}` : ''}</span>
                    ${appointment.notes ? `<span class="appointment-card-notes">${escapeHtml(appointment.notes)}</span>` : ''}
                </div>
                <div class="appointment-card-controls">
                    <label class="visually-hidden" for="appointment-status-${appointment.id}">Status</label>
                    <select class="status-select" id="appointment-status-${appointment.id}" data-status-id="${appointment.id}">${optionMarkup}</select>
                    <button type="button" class="btn btn-primary btn-sm" data-edit-appointment="${appointment.id}">Edit details</button>
                    <button type="button" class="btn btn-danger btn-sm" data-delete-appointment="${appointment.id}">Delete</button>
                </div>
            </article>
        `;
    }).join('')}
    `;
}

async function saveAppointment() {
    const date = document.getElementById('modal-date').value;
    const time = document.getElementById('modal-time').value;
    const customerName = document.getElementById('modal-customer').value.trim();
    const phone = document.getElementById('modal-phone').value.trim();
    const savedCustomerId = Number(document.getElementById('modal-existing-customer').value);
    const serviceId = Number(document.getElementById('modal-service').value);
    const notes = document.getElementById('modal-notes').value.trim();
    const status = document.getElementById('modal-status').value;
    const additionalServices = [...document.querySelectorAll('#modal-additional-services input[type="checkbox"]:checked')]
        .map(input => Number(input.value))
        .filter(id => id !== serviceId);

    if (!date || !time || !serviceId) {
        alert('Please choose a date, time, and service.');
        return;
    }

    try {
        const statements = [];
        let customerRef = null;
        if (savedCustomerId) {
            statements.push({
                query: 'UPDATE customers SET name = ?, phone = ? WHERE id = ?',
                params: [customerName || null, phone || null, savedCustomerId]
            });
            customerRef = savedCustomerId;
        } else if (customerName || phone) {
            statements.push({
                query: 'INSERT INTO customers (name, phone) VALUES (?, ?)',
                params: [customerName || null, phone || null]
            });
            customerRef = { lastIDFrom: statements.length - 1 };
        }

        const appointmentParams = [customerRef, date, time, serviceId, additionalServices.length ? JSON.stringify(additionalServices) : null, notes || null, status];
        if (editingAppointmentId) {
            statements.push({
                query: 'UPDATE appointments SET customer_id = ?, date = ?, time = ?, service_id = ?, additional_services = ?, notes = ?, status = ? WHERE id = ?',
                params: [...appointmentParams, editingAppointmentId]
            });
        } else {
            statements.push({
                query: 'INSERT INTO appointments (customer_id, date, time, service_id, additional_services, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                params: appointmentParams
            });
        }
        await api.runTransaction(statements);
        await loadAppointmentCustomers();

        const editedId = editingAppointmentId;
        if (editedId && selectedCashierAppointmentId === editedId) {
            selectedCashierAppointmentId = null;
            selectedCashierCustomerId = null;
            if (selectedCashierAppointmentServices.length) {
                currentOrder = currentOrder.filter(item => !selectedCashierAppointmentServices.includes(item));
                selectedCashierAppointmentServices = [];
                renderCashierOrder();
            }
        }
        document.getElementById('schedule-date').value = date;
        closeAppointmentModal();
        await loadAppointmentsForSelectedDate();
        if (!currentOrder.length) await loadCashier();
        alert(editedId ? 'Appointment updated successfully.' : 'Appointment saved successfully.');
    } catch (error) {
        console.error('Could not save appointment:', error);
        alert(`Could not save appointment: ${error.message}`);
    }
}

async function loadCashier() {
    const content = document.getElementById('cashier-content');
    const [services, products, barbers, appointments] = await Promise.all([
        api.dbQuery('SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT id, name, price, stock, image_data FROM products WHERE is_active = 1 ORDER BY name'),
        api.dbQuery('SELECT id, name FROM barbers WHERE is_active = 1 ORDER BY name'),
        api.dbQuery(
            `SELECT a.id, a.time, a.customer_id, a.service_id, a.additional_services,
                    COALESCE(NULLIF(c.name, ''), 'Walk-in') AS customer_name,
                    s.name AS service_name, s.price AS service_price
             FROM appointments a
             LEFT JOIN customers c ON c.id = a.customer_id
             LEFT JOIN services s ON s.id = a.service_id
             WHERE a.date = ? AND COALESCE(a.status, 'scheduled') IN ('scheduled', 'waiting', 'in-service')
             ORDER BY a.time`,
            [getLocalDateString()]
        )
    ]);
    if (!barbers.some(barber => String(barber.id) === selectedCashierBarberId)) {
        selectedCashierBarberId = '';
    }
    selectedCashierAppointmentId = null;
    selectedCashierCustomerId = null;
    selectedCashierAppointmentServices = [];

    content.innerHTML = `
        <div class="cashier-header">
            <h3>Current Order</h3>
            <div class="order-info">Ready to sell</div>
        </div>

        <section class="cashier-appointment-panel">
            <label for="cashier-appointment">Today's appointment (optional)</label>
            <select id="cashier-appointment">
                <option value="">Walk-in / no appointment</option>
                ${appointments.map(appointment => `
                    <option value="${appointment.id}">
                        ${escapeHtml(appointment.time)} · ${escapeHtml(appointment.customer_name)}
                        ${appointment.service_name ? ` · ${escapeHtml(appointment.service_name)}` : ''}
                    </option>
                `).join('')}
            </select>
            <p>Selecting an appointment adds its service to the order and links the customer.</p>
        </section>

        <div class="form-group">
            <label for="cashier-barber">Barber (optional)</label>
            <select id="cashier-barber">
                <option value="">${barbers.length ? 'No barber assigned' : 'No barbers yet.'}</option>
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
                        <div class="cashier-product-image">${product.image_data
                            ? `<img src="${escapeHtml(product.image_data)}" alt="">`
                            : '<span aria-hidden="true">P</span>'}</div>
                        <div class="item-name">${escapeHtml(product.name)}</div>
                        <div class="item-price">${formatCurrency(product.price)}</div>
                        <button class="btn btn-sm btn-primary" data-add-item="product-${product.id}" data-name="${escapeHtml(product.name)}" data-price="${product.price}" data-image="${product.image_data ? escapeHtml(product.image_data) : ''}">Add</button>
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

    content.onclick = handleCashierActions;
    document.getElementById('cashier-barber').addEventListener('change', event => {
        selectedCashierBarberId = event.target.value;
    });
    document.getElementById('cashier-appointment').addEventListener('change', event => {
        const appointment = appointments.find(item => String(item.id) === event.target.value);
        if (selectedCashierAppointmentServices.length) {
            selectedCashierAppointmentServices.forEach(item => {
                if (item.quantity > 1) item.quantity -= 1;
                else currentOrder = currentOrder.filter(orderItem => orderItem !== item);
            });
            selectedCashierAppointmentServices = [];
        }
        if (!appointment) {
            selectedCashierAppointmentId = null;
            selectedCashierCustomerId = null;
            renderCashierOrder();
            return;
        }

        selectedCashierAppointmentId = Number(appointment.id);
        selectedCashierCustomerId = appointment.customer_id ? Number(appointment.customer_id) : null;
        const service = services.find(item => Number(item.id) === Number(appointment.service_id))
            || (appointment.service_name
                ? { id: appointment.service_id, name: appointment.service_name, price: appointment.service_price }
                : null);
        if (service) {
            selectedCashierAppointmentServices = [];
            const appointmentServiceIds = [service.id];
            try {
                appointmentServiceIds.push(...JSON.parse(appointment.additional_services || '[]'));
            } catch (error) {
                console.warn('Ignoring invalid appointment additional-services data:', error);
            }
            appointmentServiceIds.map(Number).filter((id, index, ids) => ids.indexOf(id) === index).forEach(serviceId => {
                const selectedService = services.find(item => Number(item.id) === serviceId)
                    || (Number(service.id) === serviceId ? service : null);
                if (!selectedService || currentOrder.some(item => item.itemType === 'service' && item.id === serviceId)) return;
                const orderItem = {
                    type: 'service',
                    itemType: 'service',
                    id: serviceId,
                    name: selectedService.name,
                    price: Number(selectedService.price),
                    quantity: 1
                };
                currentOrder.push(orderItem);
                selectedCashierAppointmentServices.push(orderItem);
            });
        }
        renderCashierOrder();
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
        currentOrder.push({
            type,
            itemType: type,
            id: Number(id),
            name,
            price,
            imageData: addButton.dataset.image || null,
            quantity: 1
        });
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
    const barberValue = document.getElementById('cashier-barber')?.value || '';
    const barberId = barberValue ? Number(barberValue) : null;
    if (!currentOrder.length) {
        alert('Add at least one item to the order.');
        return;
    }

    const paymentMethod = document.getElementById('payment-method').value;
    const cashReceived = Number(document.getElementById('cash-received')?.value || 0);
    const date = getLocalDateString();
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });

    try {
        const statements = [{
            query: 'INSERT INTO orders (customer_id, date, time, total, discount, status, payment_method, barber_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            params: [selectedCashierCustomerId, date, time, total, 0, 'completed', paymentMethod, barberId]
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
        if (selectedCashierCustomerId) {
            statements.push({
                query: 'UPDATE customers SET total_visits = COALESCE(total_visits, 0) + 1, total_spent = COALESCE(total_spent, 0) + ? WHERE id = ?',
                params: [total, selectedCashierCustomerId]
            });
        }
        if (selectedCashierAppointmentId) {
            statements.push({
                query: "UPDATE appointments SET status = 'completed' WHERE id = ? AND status <> 'cancelled'",
                params: [selectedCashierAppointmentId]
            });
        }
        await api.runTransaction(statements);

        currentOrder = [];
        await loadCashier();
        if (document.getElementById('schedule-date')) await loadAppointmentsForSelectedDate();
        alert('Order completed successfully.');
    } catch (error) {
        console.error('Order failed:', error);
        alert('Could not complete order.');
    }
}

async function loadSalesHistory() {
    const content = document.getElementById('sales-history-content');
    try {
        const [barberStats, orders] = await Promise.all([
            api.dbQuery(
                `SELECT b.id AS barber_id, COALESCE(b.name, 'Unassigned') AS barber_name,
                        COUNT(o.id) AS clients_finished, COALESCE(SUM(o.total), 0) AS earned
                 FROM orders o
                 LEFT JOIN barbers b ON b.id = o.barber_id
                 WHERE COALESCE(o.status, 'completed') != 'cancelled'
                 GROUP BY b.id, b.name
                 ORDER BY barber_name`
            ),
            api.dbQuery(
            `SELECT o.id, o.date, o.time, o.total, o.payment_method,
                    o.barber_id, COALESCE(b.name, 'Unassigned') AS barber_name,
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
            )
        ]);

        const ordersByBarber = new Map();
        orders.forEach(order => {
            const key = order.barber_id == null ? 'unassigned' : String(order.barber_id);
            const group = ordersByBarber.get(key) || [];
            group.push(order);
            ordersByBarber.set(key, group);
        });

        content.innerHTML = barberStats.length ? `
            <div class="barber-history-list">
                ${barberStats.map(barber => {
                    const key = barber.barber_id == null ? 'unassigned' : String(barber.barber_id);
                    const barberOrders = ordersByBarber.get(key) || [];
                    const initials = barber.barber_name.trim().slice(0, 1).toUpperCase();
                    return `
                        <section class="barber-history-card">
                            <header class="barber-history-header">
                                <div class="barber-history-identity">
                                    <span class="barber-history-avatar">${escapeHtml(initials || 'B')}</span>
                                    <div>
                                        <h3>${escapeHtml(barber.barber_name)}</h3>
                                        <p>${Number(barber.clients_finished)} completed client${Number(barber.clients_finished) === 1 ? '' : 's'}</p>
                                    </div>
                                </div>
                                <div class="barber-history-earned">
                                    <span>Money earned</span>
                                    <strong>${formatCurrency(barber.earned)}</strong>
                                </div>
                            </header>
                            <div class="barber-history-orders">
                                ${barberOrders.map(order => `
                                    <article class="barber-history-order">
                                        <div class="barber-history-order-main">
                                            <strong>${escapeHtml(order.customer_name)}</strong>
                                            <span>${escapeHtml(order.date)} · ${escapeHtml(order.time)}</span>
                                            <span>${escapeHtml(order.items || 'No item details available')}</span>
                                        </div>
                                        <div class="barber-history-order-total">
                                            <strong>${formatCurrency(order.total)}</strong>
                                            <span>${escapeHtml(order.payment_method || 'Unknown')} · #${Number(order.id)}</span>
                        </div>
                                    </article>
                                `).join('')}
                                ${!barberOrders.length ? '<p class="barber-history-empty">No recent order details.</p>' : ''}
                            </div>
                        </section>
                    `;
                }).join('')}
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
        api.dbQuery('SELECT id, name, phone, image_data, total_visits, total_spent FROM customers WHERE is_active = 1 ORDER BY created_at DESC LIMIT 50'),
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
        <section class="customer-create-panel">
            <h3>Add a customer</h3>
            <div class="customer-create-fields">
                <div class="form-group">
                    <label for="customer-name">Name (optional)</label>
                    <input type="text" id="customer-name">
                </div>
                <div class="form-group">
                    <label for="customer-phone">Phone (optional)</label>
                    <input type="text" id="customer-phone">
                </div>
                <div class="form-group">
                    <label for="customer-photo">Photo (optional)</label>
                    <input type="file" id="customer-photo" accept="image/*">
                    <div id="customer-photo-preview" class="photo-preview" hidden></div>
                </div>
                <div class="form-group">
                    <label for="new-customer-barbers">Assign barbers (optional)</label>
                    <select id="new-customer-barbers" multiple size="3">${barberOptions}</select>
                </div>
            </div>
            <button class="btn btn-primary" id="save-customer-btn">Add Customer</button>
        </section>

        <div class="customer-list">
            ${customers.length ? customers.map(customer => `
                <div class="appointment-item customer-record">
                    <div class="customer-avatar">
                        ${customer.image_data
                            ? `<img src="${escapeHtml(customer.image_data)}" alt="${escapeHtml(customer.name || 'Customer photo')}">`
                            : `<span aria-hidden="true">${escapeHtml((customer.name || 'C').trim().slice(0, 1).toUpperCase())}</span>`}
                    </div>
                    <div>
                        <div class="appointment-time">${escapeHtml(customer.name || `Customer #${customer.id}`)}</div>
                        ${customer.phone ? `<div>${escapeHtml(customer.phone)}</div>` : ''}
                        <div>${escapeHtml((assignments
                            .filter(assignment => Number(assignment.customer_id) === Number(customer.id))
                            .map(assignment => assignment.barber_name)
                            .join(', ')) || 'Unassigned')}</div>
                        <div>Visits: ${customer.total_visits || 0} | Spent: ${formatCurrency(customer.total_spent || 0)}</div>
                    </div>
                    <div class="appointment-actions">
                        <label class="btn btn-sm customer-photo-button" for="customer-photo-${customer.id}">${customer.image_data ? 'Change photo' : 'Add photo'}</label>
                        <input class="visually-hidden" type="file" id="customer-photo-${customer.id}" accept="image/*" data-customer-photo="${customer.id}">
                        ${customer.image_data ? `<button class="btn btn-sm" data-clear-customer-photo="${customer.id}">Remove photo</button>` : ''}
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
        const imageFile = document.getElementById('customer-photo').files?.[0];
        const barberIds = [...document.getElementById('new-customer-barbers').selectedOptions]
            .map(option => Number(option.value));

        let imageData;
        try {
            imageData = await readImageFile(imageFile);
        } catch (error) {
            alert(error.message);
            return;
        }

        const statements = [{
            query: 'INSERT INTO customers (name, phone, image_data, total_visits, total_spent) VALUES (?, ?, ?, 0, 0)',
            params: [name || null, phone || null, imageData]
        }];
        barberIds.forEach(barberId => statements.push({
            query: 'INSERT INTO customer_barbers (customer_id, barber_id) VALUES (?, ?)',
            params: [{ lastIDFrom: 0 }, barberId]
        }));
        try {
            await api.runTransaction(statements);
        } catch (error) {
            console.error('Could not add customer:', error);
            alert(`Could not add customer: ${error.message}`);
            return;
        }
        await loadCustomers();
        alert('Customer added.');
    });
    document.getElementById('customer-photo').addEventListener('change', async event => {
        const preview = document.getElementById('customer-photo-preview');
        try {
            const imageData = await readImageFile(event.target.files?.[0]);
            preview.hidden = !imageData;
            preview.innerHTML = imageData ? `<img src="${escapeHtml(imageData)}" alt="Customer photo preview">` : '';
        } catch (error) {
            alert(error.message);
            event.target.value = '';
        }
    });
    content.onchange = async event => {
        const input = event.target.closest('[data-customer-photo]');
        if (!input || !input.files?.[0]) return;
        const customerId = Number(input.dataset.customerPhoto);
        try {
            const imageData = await readImageFile(input.files[0]);
            await api.dbRun('UPDATE customers SET image_data = ? WHERE id = ?', [imageData, customerId]);
            await loadCustomers();
        } catch (error) {
            console.error('Could not update customer photo:', error);
            alert(`Could not update customer photo: ${error.message}`);
        }
    };

    content.onclick = async (event) => {
        const clearPhotoButton = event.target.closest('[data-clear-customer-photo]');
        if (clearPhotoButton) {
            const customerId = Number(clearPhotoButton.dataset.clearCustomerPhoto);
            try {
                await api.dbRun('UPDATE customers SET image_data = NULL WHERE id = ?', [customerId]);
                await loadCustomers();
            } catch (error) {
                alert(`Could not remove customer photo: ${error.message}`);
            }
            return;
        }
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
        showPage('workspace');
        selectWorkspaceTab('appointments');
        setActiveNav(document.querySelector('[data-page="workspace"]'));
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
        api.dbQuery('SELECT p.id, p.name, p.price, p.stock, p.description, p.category_id, p.image_data, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 ORDER BY p.name'),
        api.dbQuery('SELECT id, name FROM categories ORDER BY name')
    ]);

    content.innerHTML = `
        <div class="form-group">
            <button class="btn btn-primary" id="add-product-btn">Add Product</button>
        </div>

        <div class="product-list">
            ${products.map(product => `
                <div class="product-item">
                    <div class="product-image-placeholder">
                        ${product.image_data
                            ? `<img src="${escapeHtml(product.image_data)}" alt="${escapeHtml(product.name)}">`
                            : '<span aria-hidden="true">No photo</span>'}
                    </div>
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
                    <label for="product-stock">Stock (optional; defaults to 0)</label>
                    <input type="number" id="product-stock" min="0" step="1">
                </div>
                <div class="form-group">
                    <label for="product-description">Description (optional)</label>
                    <textarea id="product-description" rows="3"></textarea>
                </div>
                <div class="form-group">
                    <label for="product-category">Category (optional)</label>
                    <select id="product-category">
                        <option value="">Uncategorized</option>
                        ${categories.map(category => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="product-image">Product photo (optional)</label>
                    <input type="file" id="product-image" accept="image/*">
                    <div id="product-image-preview" class="photo-preview" hidden></div>
                    <button type="button" class="btn btn-sm" id="clear-product-image" hidden>Remove photo</button>
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
    document.getElementById('product-image').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            draftProductImageData = await readImageFile(file);
            updateProductImagePreview();
        } catch (error) {
            alert(error.message);
            event.target.value = '';
        }
    });
    document.getElementById('clear-product-image').addEventListener('click', () => {
        draftProductImageData = null;
        document.getElementById('product-image').value = '';
        updateProductImagePreview();
    });

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
            const product = (await api.dbQuery('SELECT id, name, price, stock, description, category_id, image_data FROM products WHERE id = ?', [id]))[0];
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
    document.getElementById('product-stock').value = product ? product.stock : '0';
    document.getElementById('product-description').value = product?.description || '';
    document.getElementById('product-category').value = product?.category_id || '';
    document.getElementById('product-image').value = '';
    draftProductImageData = product?.image_data || null;
    updateProductImagePreview();
    title.textContent = product ? 'Edit Product' : 'Add Product';
    localStorage.setItem('editingProductId', product ? String(product.id) : '');
    modal.style.display = 'flex';
}

function updateProductImagePreview() {
    const preview = document.getElementById('product-image-preview');
    const clearButton = document.getElementById('clear-product-image');
    if (!preview || !clearButton) return;
    preview.hidden = !draftProductImageData;
    clearButton.hidden = !draftProductImageData;
    preview.innerHTML = draftProductImageData
        ? `<img src="${escapeHtml(draftProductImageData)}" alt="Product photo preview">`
        : '';
}

function closeProductModal() {
    document.getElementById('product-modal').style.display = 'none';
    localStorage.removeItem('editingProductId');
    draftProductImageData = null;
}

async function saveProduct() {
    const name = document.getElementById('product-name').value.trim();
    const priceValue = document.getElementById('product-price').value.trim();
    const stockValue = document.getElementById('product-stock').value.trim();
    const price = Number(priceValue);
    const stock = stockValue === '' ? 0 : Number(stockValue);
    const description = document.getElementById('product-description').value.trim();
    const categoryValue = document.getElementById('product-category').value;
    const categoryId = categoryValue ? Number(categoryValue) : null;
    const productId = localStorage.getItem('editingProductId');

    if (!name || priceValue === '' || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
        alert('Enter a product name and valid non-negative price. Stock can be left blank or set to a whole-number quantity.');
        return;
    }

    try {
        if (productId) {
            await api.dbRun('UPDATE products SET name = ?, price = ?, stock = ?, description = ?, category_id = ?, image_data = ? WHERE id = ?', [name, price, stock, description, categoryId, draftProductImageData, Number(productId)]);
        } else {
            await api.dbRun('INSERT INTO products (name, price, stock, description, category_id, image_data, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [name, price, stock, description, categoryId, draftProductImageData]);
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
        currency: 'IQD',
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
                <option value="IQD" selected>IQD</option>
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