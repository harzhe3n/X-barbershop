'use strict';

/*
 * XBARBER booking website.
 * The barbers' photos are the centre of the page: one big photo in the middle, the next barber
 * every 5 seconds, arrows and a button for every barber.
 * Booking: 1. pick a day and a free time.  2. type name and phone number.  3. done.
 * Free times come from the cashier (GET /api/public/availability); a booking becomes a waiting
 * client in that barber's slot (POST /api/public/book). No sign-in for customers.
 */
(function () {
    const LANGS = [
        { code: 'ckb', label: 'کو', dir: 'rtl' },
        { code: 'ar', label: 'ع', dir: 'rtl' },
        { code: 'en', label: 'EN', dir: 'ltr' }
    ];
    // Kurdish until the visitor picks another language (remembered on their phone).
    const DEFAULT_LANG = 'ckb';
    const STORAGE_KEY = 'xbarber-site-language';
    const MIN_LOADER_MS = 1900;
    const REFRESH_MS = 30000;
    // The next barber comes to the middle every 5 seconds.
    const SLIDE_MS = 5000;

    const TEXT = {
        en: {
            'nav.book': 'Book now',
            'hero.eyebrow': 'Barber shop',
            'hero.title1': 'Sharp cuts.',
            'hero.title2': 'Booked in seconds.',
            'hours.openNow': 'Open now · until {close}',
            'hours.today': 'Today {open} – {close}',
            'hours.closedToday': 'Closed today',
            'hours.midnight': 'Midnight',
            'barbers.next': 'Next free: {when}',
            'barbers.none': 'No free times soon',
            'barbers.offToday': 'Not working today',
            'barbers.empty': 'Our barbers will be here soon.',
            'steps.title': 'How it works',
            'steps.1': 'Choose your barber',
            'steps.1text': 'See who is working and when they are free.',
            'steps.2': 'Pick a free time',
            'steps.2text': 'Free times come straight from the shop, always up to date.',
            'steps.3': 'Leave your name and number',
            'steps.3text': 'That’s all. No account, no password.',
            'day.today': 'Today',
            'day.tomorrow': 'Tomorrow',
            'sheet.with': 'Book with',
            'sheet.step1': 'Time',
            'sheet.step2': 'Your details',
            'sheet.step3': 'Done',
            'sheet.pickDay': 'Pick a day',
            'sheet.pickTime': 'Pick a time',
            'sheet.free': '{n} free',
            'sheet.full': 'Full',
            'sheet.off': 'Off',
            'sheet.closed': 'Closed',
            'sheet.legendFree': 'Free',
            'sheet.legendTaken': 'Taken',
            'sheet.taken': 'Taken',
            'sheet.noneDay': 'No free times on this day. Try another day.',
            'sheet.offDay': '{name} is not working on this day.',
            'sheet.closedDay': 'The shop is closed on this day.',
            'sheet.noDays': 'There are no free times in the coming days. Please call the shop.',
            'sheet.continue': 'Continue',
            'sheet.pickFirst': 'Pick a time to continue',
            'sheet.chosen': '{day} at {time}',
            'sheet.change': 'Change',
            'sheet.loading': 'Loading free times…',
            'form.name': 'Your name',
            'form.namePh': 'e.g. Ahmed',
            'form.phone': 'Phone number',
            'form.phonePh': '0750 123 4567',
            'form.note': 'We only use your number for this booking.',
            'form.confirm': 'Confirm booking',
            'form.sending': 'Booking…',
            'err.name': 'Please type your name.',
            'err.phone': 'Please type a valid phone number.',
            'err.taken': 'Sorry, someone just booked that time. Please pick another one.',
            'err.limit': 'This number already has bookings. Please call the shop to book more.',
            'err.busy': 'Too many tries. Please wait a little and try again.',
            'err.closed': 'Online booking is closed right now. Please call the shop.',
            'err.network': 'Could not connect. Check your internet and try again.',
            'err.load': 'Could not load the booking page.',
            'err.retry': 'Try again',
            'done.title': 'You’re booked!',
            'done.when': '{day} · {time}',
            'done.note': 'Please come a few minutes early. To change or cancel, call the shop.',
            'done.call': 'Call the shop',
            'done.close': 'Done',
            'closed.banner': 'Online booking is closed right now. Please call us to book.',
            'footer.hours': 'Opening hours',
            'footer.daily': 'Every day {open} – {close}',
            'footer.closedDays': 'Closed on {days}',
            'footer.contact': 'Contact',
            'footer.staff': 'Staff sign-in',
            'footer.instagram': 'Instagram',
            'footer.whatsapp': 'WhatsApp',
            'footer.follow': 'Follow us',
            'footer.seeWork': 'See our work',
            'barbers.closedNow': 'Closed now · not taking bookings',
            'common.close': 'Close',
            'common.back': 'Back',
            'loading': 'Loading',
            'carousel.label': 'Our barbers',
            'carousel.prev': 'Previous barber',
            'carousel.next': 'Next barber',
            'carousel.slide': '{n} of {total}',
            'barbers.bookWith': 'Book with {name}'
        },
        ar: {
            'nav.book': 'احجز الآن',
            'hero.eyebrow': 'صالون حلاقة',
            'hero.title1': 'قصّة أنيقة.',
            'hero.title2': 'حجز في ثوانٍ.',
            'hours.openNow': 'مفتوح الآن · حتى {close}',
            'hours.today': 'اليوم {open} – {close}',
            'hours.closedToday': 'مغلق اليوم',
            'hours.midnight': 'منتصف الليل',
            'barbers.next': 'أقرب وقت فارغ: {when}',
            'barbers.none': 'لا توجد أوقات فارغة قريبًا',
            'barbers.offToday': 'لا يعمل اليوم',
            'barbers.empty': 'سيظهر حلاقونا هنا قريبًا.',
            'steps.title': 'كيف يعمل',
            'steps.1': 'اختر حلاقك',
            'steps.1text': 'شاهد من يعمل ومتى يكون متفرغًا.',
            'steps.2': 'اختر وقتًا فارغًا',
            'steps.2text': 'الأوقات الفارغة تأتي مباشرة من المحل ومحدّثة دائمًا.',
            'steps.3': 'اكتب اسمك ورقمك',
            'steps.3text': 'هذا كل شيء. بدون حساب وبدون كلمة مرور.',
            'day.today': 'اليوم',
            'day.tomorrow': 'غدًا',
            'sheet.with': 'احجز مع',
            'sheet.step1': 'الوقت',
            'sheet.step2': 'معلوماتك',
            'sheet.step3': 'تم',
            'sheet.pickDay': 'اختر اليوم',
            'sheet.pickTime': 'اختر الوقت',
            'sheet.free': '{n} فارغ',
            'sheet.full': 'ممتلئ',
            'sheet.off': 'عطلة',
            'sheet.closed': 'مغلق',
            'sheet.legendFree': 'فارغ',
            'sheet.legendTaken': 'محجوز',
            'sheet.taken': 'محجوز',
            'sheet.noneDay': 'لا توجد أوقات فارغة في هذا اليوم. جرّب يومًا آخر.',
            'sheet.offDay': '{name} لا يعمل في هذا اليوم.',
            'sheet.closedDay': 'المحل مغلق في هذا اليوم.',
            'sheet.noDays': 'لا توجد أوقات فارغة في الأيام القادمة. يرجى الاتصال بالمحل.',
            'sheet.continue': 'متابعة',
            'sheet.pickFirst': 'اختر وقتًا للمتابعة',
            'sheet.chosen': '{day} الساعة {time}',
            'sheet.change': 'تغيير',
            'sheet.loading': 'جارٍ تحميل الأوقات الفارغة…',
            'form.name': 'اسمك',
            'form.namePh': 'مثلًا: أحمد',
            'form.phone': 'رقم الهاتف',
            'form.phonePh': '0750 123 4567',
            'form.note': 'نستخدم رقمك لهذا الحجز فقط.',
            'form.confirm': 'تأكيد الحجز',
            'form.sending': 'جارٍ الحجز…',
            'err.name': 'يرجى كتابة اسمك.',
            'err.phone': 'يرجى كتابة رقم هاتف صحيح.',
            'err.taken': 'عذرًا، حجز شخص آخر هذا الوقت للتو. يرجى اختيار وقت آخر.',
            'err.limit': 'لهذا الرقم حجوزات مسبقًا. يرجى الاتصال بالمحل لحجز المزيد.',
            'err.busy': 'محاولات كثيرة. يرجى الانتظار قليلًا ثم المحاولة مجددًا.',
            'err.closed': 'الحجز عبر الموقع مغلق الآن. يرجى الاتصال بالمحل.',
            'err.network': 'تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا.',
            'err.load': 'تعذّر تحميل صفحة الحجز.',
            'err.retry': 'حاول مجددًا',
            'done.title': 'تم حجزك!',
            'done.when': '{day} · {time}',
            'done.note': 'يرجى الحضور قبل الموعد ببضع دقائق. للتغيير أو الإلغاء اتصل بالمحل.',
            'done.call': 'اتصل بالمحل',
            'done.close': 'تم',
            'closed.banner': 'الحجز عبر الموقع مغلق الآن. يرجى الاتصال بنا للحجز.',
            'footer.hours': 'أوقات العمل',
            'footer.daily': 'كل يوم {open} – {close}',
            'footer.closedDays': 'مغلق يوم {days}',
            'footer.contact': 'تواصل معنا',
            'footer.staff': 'دخول الموظفين',
            'footer.instagram': 'إنستغرام',
            'footer.whatsapp': 'واتساب',
            'footer.follow': 'تابعنا',
            'footer.seeWork': 'شاهد أعمالنا',
            'barbers.closedNow': 'مغلق الآن · لا يقبل الحجوزات',
            'common.close': 'إغلاق',
            'common.back': 'رجوع',
            'loading': 'جارٍ التحميل',
            'carousel.label': 'حلاقونا',
            'carousel.prev': 'الحلاق السابق',
            'carousel.next': 'الحلاق التالي',
            'carousel.slide': '{n} من {total}',
            'barbers.bookWith': 'احجز مع {name}'
        },
        ckb: {
            'nav.book': 'ئێستا نۆرە بگرە',
            'hero.eyebrow': 'سەرتاشخانە',
            'hero.title1': 'قژێکی ڕێکوپێک.',
            'hero.title2': 'نۆرە لە چەند چرکەیەکدا.',
            'hours.openNow': 'ئێستا کراوەیە · تا {close}',
            'hours.today': 'ئەمڕۆ {open} – {close}',
            'hours.closedToday': 'ئەمڕۆ داخراوە',
            'hours.midnight': 'نیوەشەو',
            'barbers.next': 'یەکەم کاتی بەتاڵ: {when}',
            'barbers.none': 'بەم زووانە کاتی بەتاڵ نییە',
            'barbers.offToday': 'ئەمڕۆ کار ناکات',
            'barbers.empty': 'بەم زووانە باربەرەکانمان لێرە دەردەکەون.',
            'steps.title': 'چۆن کار دەکات',
            'steps.1': 'باربەرەکەت هەڵبژێرە',
            'steps.1text': 'ببینە کێ کار دەکات و کەی بەتاڵە.',
            'steps.2': 'کاتێکی بەتاڵ هەڵبژێرە',
            'steps.2text': 'کاتە بەتاڵەکان ڕاستەوخۆ لە دوکانەوە دێن و هەمیشە نوێن.',
            'steps.3': 'ناو و ژمارەکەت بنووسە',
            'steps.3text': 'هەر ئەوەندە. بێ ئەکاونت و بێ وشەی نهێنی.',
            'day.today': 'ئەمڕۆ',
            'day.tomorrow': 'سبەینێ',
            'sheet.with': 'نۆرە لای',
            'sheet.step1': 'کات',
            'sheet.step2': 'زانیارییەکانت',
            'sheet.step3': 'تەواو',
            'sheet.pickDay': 'ڕۆژێک هەڵبژێرە',
            'sheet.pickTime': 'کاتێک هەڵبژێرە',
            'sheet.free': '{n} بەتاڵ',
            'sheet.full': 'پڕە',
            'sheet.off': 'پشوو',
            'sheet.closed': 'داخراوە',
            'sheet.legendFree': 'بەتاڵ',
            'sheet.legendTaken': 'گیراوە',
            'sheet.taken': 'گیراوە',
            'sheet.noneDay': 'لەم ڕۆژەدا کاتی بەتاڵ نییە. ڕۆژێکی تر تاقی بکەرەوە.',
            'sheet.offDay': '{name} لەم ڕۆژەدا کار ناکات.',
            'sheet.closedDay': 'دوکان لەم ڕۆژەدا داخراوە.',
            'sheet.noDays': 'لە ڕۆژانی داهاتوودا کاتی بەتاڵ نییە. تکایە پەیوەندی بە دوکانەوە بکە.',
            'sheet.continue': 'بەردەوام بە',
            'sheet.pickFirst': 'کاتێک هەڵبژێرە بۆ بەردەوامبوون',
            'sheet.chosen': '{day} کاتژمێر {time}',
            'sheet.change': 'گۆڕین',
            'sheet.loading': 'کاتە بەتاڵەکان بار دەبن…',
            'form.name': 'ناوت',
            'form.namePh': 'بۆ نموونە: ئەحمەد',
            'form.phone': 'ژمارەی مۆبایل',
            'form.phonePh': '0750 123 4567',
            'form.note': 'ژمارەکەت تەنها بۆ ئەم نۆرەیە بەکاردێت.',
            'form.confirm': 'دڵنیاکردنەوەی نۆرە',
            'form.sending': 'نۆرە دەگیرێت…',
            'err.name': 'تکایە ناوت بنووسە.',
            'err.phone': 'تکایە ژمارەیەکی دروست بنووسە.',
            'err.taken': 'ببورە، کەسێکی تر ئێستا ئەم کاتەی گرت. تکایە کاتێکی تر هەڵبژێرە.',
            'err.limit': 'ئەم ژمارەیە پێشتر نۆرەی هەیە. تکایە بۆ نۆرەی زیاتر پەیوەندی بە دوکانەوە بکە.',
            'err.busy': 'هەوڵی زۆر. تکایە کەمێک چاوەڕێ بکە و دووبارە هەوڵ بدەرەوە.',
            'err.closed': 'نۆرەگرتنی ئۆنلاین ئێستا داخراوە. تکایە پەیوەندی بە دوکانەوە بکە.',
            'err.network': 'پەیوەندی نەکرا. ئینتەرنێتەکەت بپشکنە و دووبارە هەوڵ بدەرەوە.',
            'err.load': 'پەڕەی نۆرەگرتن بار نەبوو.',
            'err.retry': 'دووبارە هەوڵ بدەرەوە',
            'done.title': 'نۆرەکەت گیرا!',
            'done.when': '{day} · {time}',
            'done.note': 'تکایە چەند خولەکێک زووتر وەرە. بۆ گۆڕین یان هەڵوەشاندنەوە پەیوەندی بە دوکانەوە بکە.',
            'done.call': 'پەیوەندی بە دوکانەوە بکە',
            'done.close': 'تەواو',
            'closed.banner': 'نۆرەگرتنی ئۆنلاین ئێستا داخراوە. تکایە بۆ نۆرەگرتن پەیوەندیمان پێوە بکە.',
            'footer.hours': 'کاتی کارکردن',
            'footer.daily': 'هەموو ڕۆژێک {open} – {close}',
            'footer.closedDays': 'ڕۆژی {days} داخراوە',
            'footer.contact': 'پەیوەندی',
            'footer.staff': 'چوونەژوورەوەی کارمەندان',
            'footer.instagram': 'ئینستاگرام',
            'footer.whatsapp': 'واتساپ',
            'footer.follow': 'فۆڵۆومان بکە',
            'footer.seeWork': 'کارەکانمان ببینە',
            'barbers.closedNow': 'ئێستا داخراوە · نۆرە وەرناگرێت',
            'common.close': 'داخستن',
            'common.back': 'گەڕانەوە',
            'loading': 'بار دەبێت',
            'carousel.label': 'باربەرەکانمان',
            'carousel.prev': 'باربەری پێشوو',
            'carousel.next': 'باربەری دواتر',
            'carousel.slide': '{n} لە {total}',
            'barbers.bookWith': 'نۆرە لای {name} بگرە'
        }
    };

    const MONTHS = {
        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
        ar: ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'],
        ckb: ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران', 'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم']
    };
    const WEEKDAYS = {
        en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
        ckb: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە']
    };
    const WEEKDAYS_SHORT = {
        en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        ar: WEEKDAYS.ar,
        ckb: WEEKDAYS.ckb
    };
    const DAY_PERIOD = { en: ['AM', 'PM'], ar: ['ص', 'م'], ckb: ['پ.ن', 'د.ن'] };

    const ICONS = {
        close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        back: '<path d="m15 18-6-6 6-6"/>',
        prev: '<path d="m15 18-6-6 6-6"/>',
        next: '<path d="m9 18 6-6-6-6"/>',
        clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
    };
    // Filled brand marks for the footer.
    const BRAND_ICONS = {
        instagram: '<path fill-rule="evenodd" d="M8 2h8a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Zm.5 2A4.5 4.5 0 0 0 4 8.5v7A4.5 4.5 0 0 0 8.5 20h7a4.5 4.5 0 0 0 4.5-4.5v-7A4.5 4.5 0 0 0 15.5 4h-7ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm5.3-3.3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"/>',
        whatsapp: '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.42.25-.69.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35Zm-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.37l-.36-.22-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88a9.82 9.82 0 0 1 6.99 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.89 9.88Zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.42Z"/>'
    };
    const MARK = '<svg viewBox="300 270 660 760" aria-hidden="true"><polygon points="325,288 651,593 388,839 388,676 457,608 325,481"/><polygon points="904,385 904,593 797,690 934,822 934,1014 589,683"/></svg>';

    const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const state = {
        lang: pickLanguage(),
        info: null,
        loadError: false,
        ready: false,
        // Barber slideshow: the barber in the middle, and whether the mouse or the keyboard holds it.
        slide: 0,
        hoverHold: false,
        focusHold: false,
        // Booking window
        barber: null,
        days: [],
        dayIndex: 0,
        time: null,
        step: 'time',
        loadingDays: false,
        notice: '',
        sending: false,
        name: '',
        phone: '',
        errors: {},
        booked: null,
        refreshTimer: null,
        lastFocus: null
    };
    const startedAt = Date.now();
    const $ = selector => document.querySelector(selector);
    const sheetRoot = $('#sheet');
    const sheet = sheetRoot.querySelector('.sheet');
    const hero = $('.hero');
    const carousel = $('#carousel');
    const stage = $('#stage');
    const spotlight = $('#spotlight');
    const picker = $('#picker');
    let slideTimer = null;
    let slideStarted = 0;
    let slideLeft = SLIDE_MS;
    let stageKey = '';

    /* ---------------- Language and formatting ---------------- */

    function pickLanguage() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (TEXT[saved]) return saved;
        } catch (error) {
            // Private browsing can block storage.
        }
        return DEFAULT_LANG;
    }

    function t(key, vars) {
        let text = TEXT[state.lang][key] ?? TEXT.en[key] ?? key;
        if (vars) text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
        return text;
    }

    function esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function icon(name, extra = '') {
        return `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    }

    function brandIcon(name) {
        return `<svg class="icon icon-brand" viewBox="0 0 24 24" aria-hidden="true">${BRAND_ICONS[name] || ''}</svg>`;
    }

    function parseDate(value) {
        const [year, month, day] = String(value).split('-').map(Number);
        return { year, month: month - 1, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
    }

    function formatTime(value) {
        const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
        if (!match) return '';
        const hours = Number(match[1]);
        const hour12 = hours % 12 === 0 ? 12 : hours % 12;
        return `${hour12}:${match[2]} ${DAY_PERIOD[state.lang][hours >= 12 ? 1 : 0]}`;
    }

    function closingTime(value) {
        return String(value).slice(0, 5) === '00:00' ? t('hours.midnight') : formatTime(value);
    }

    function formatDateLong(value) {
        const date = parseDate(value);
        const month = MONTHS[state.lang][date.month];
        const weekday = WEEKDAYS[state.lang][date.weekday];
        if (state.lang === 'en') return `${weekday}, ${date.day} ${month}`;
        if (state.lang === 'ckb') return `${weekday}، ${date.day}ی ${month}`;
        return `${weekday}، ${date.day} ${month}`;
    }

    function relativeDay(value) {
        const today = state.info?.today;
        if (!today) return formatDateLong(value);
        if (value === today) return t('day.today');
        if (value === addDays(today, 1)) return t('day.tomorrow');
        return formatDateLong(value);
    }

    function addDays(value, amount) {
        const date = parseDate(value);
        const next = new Date(Date.UTC(date.year, date.month, date.day + amount));
        return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    }

    function initial(name) {
        const text = String(name || '').trim();
        return text ? Array.from(text)[0].toUpperCase() : 'X';
    }

    function isRtl() {
        return document.documentElement.dir === 'rtl';
    }

    /* ---------------- Server ---------------- */

    async function request(path, options = {}) {
        let response;
        try {
            response = await fetch(path, {
                cache: 'no-store',
                credentials: 'same-origin',
                headers: options.body ? { 'Content-Type': 'application/json' } : {},
                ...options
            });
        } catch (error) {
            const failure = new Error('network');
            failure.code = 'network';
            throw failure;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const failure = new Error(data.error || 'network');
            failure.code = data.error || 'network';
            failure.status = response.status;
            throw failure;
        }
        return data;
    }

    /* ---------------- Barber slideshow ---------------- */

    function barberList() {
        return state.info?.barbers || [];
    }

    function activeBarber() {
        return barberList()[state.slide] || null;
    }

    // Open unless the barber closed themselves in the cashier.
    function isOpen(barber) {
        return Boolean(barber) && barber.online !== false;
    }

    // Runs while nothing holds it: not hovered, no booking window open, page visible.
    // People who ask their phone for less motion move between barbers themselves.
    function playing() {
        return state.ready && !reducedMotion && barberList().length > 1 && !state.hoverHold && !state.focusHold
            && sheetRoot.hidden && !document.hidden;
    }

    // The 5-second timer. A pause keeps the time that was left, so the bar below continues where it stopped.
    function syncTimer() {
        const run = playing();
        if (run && !slideTimer) {
            slideStarted = Date.now();
            slideTimer = setTimeout(() => {
                slideTimer = null;
                goTo(state.slide + 1, { auto: true });
            }, slideLeft);
        } else if (!run && slideTimer) {
            clearTimeout(slideTimer);
            slideTimer = null;
            slideLeft = Math.max(0, slideLeft - (Date.now() - slideStarted));
        }
        hero.classList.toggle('carousel-playing', run);
        hero.classList.toggle('carousel-paused', !run);
        // Screen readers hear the new barber only when it was chosen, not every 5 seconds.
        spotlight.setAttribute('aria-live', run ? 'off' : 'polite');
    }

    function restartTimer() {
        clearTimeout(slideTimer);
        slideTimer = null;
        slideLeft = SLIDE_MS;
        syncTimer();
    }

    function goTo(index, { auto = false } = {}) {
        const count = barberList().length;
        if (!count) return;
        const pickerHadFocus = picker.contains(document.activeElement);
        state.slide = ((index % count) + count) % count;
        renderCarousel(true);
        if (pickerHadFocus && !auto) picker.querySelector('.pick[aria-current="true"]')?.focus({ preventScroll: true });
        restartTimer();
    }

    // Where a barber's photo sits: 0 in the middle, 1 and -1 beside it, 2 and -2 further out.
    function slidePosition(index, active, count) {
        let distance = (index - active + count) % count;
        if (distance > count / 2) distance -= count;
        return Math.abs(distance) <= 2 ? String(distance) : 'hidden';
    }

    function renderStage() {
        const list = barberList();
        if (state.loadError) {
            stageKey = 'error';
            stage.innerHTML = `<div class="slide slide-empty" data-pos="0">${MARK}<p>${esc(t('err.load'))}</p></div>`;
            return;
        }
        if (!state.info) {
            stageKey = 'loading';
            stage.innerHTML = '<div class="slide slide-loading" data-pos="0"></div>';
            return;
        }
        if (!list.length) {
            stageKey = 'empty';
            stage.innerHTML = `<div class="slide slide-empty" data-pos="0">${MARK}<p>${esc(t('barbers.empty'))}</p></div>`;
            return;
        }
        // The photos are only rebuilt when the barbers change, so moving between them animates.
        const key = `${state.lang}|${list.map(barber => `${barber.id}:${barber.name}:${barber.photo || ''}`).join('|')}`;
        if (key !== stageKey) {
            stageKey = key;
            stage.innerHTML = list.map((barber, index) => `
                <button type="button" class="slide" data-index="${index}" aria-roledescription="slide"
                    aria-label="${esc(`${barber.name} · ${t('carousel.slide', { n: index + 1, total: list.length })}`)}">
                    <span class="slide-num" dir="ltr">${String(index + 1).padStart(2, '0')}</span>
                    ${barber.photo
                        ? `<img src="${esc(barber.photo)}" alt="" draggable="false">`
                        : `<span class="slide-initial" aria-hidden="true">${esc(initial(barber.name))}</span>`}
                </button>`).join('');
        }
        stage.querySelectorAll('.slide[data-index]').forEach(element => {
            const position = slidePosition(Number(element.dataset.index), state.slide, list.length);
            element.dataset.pos = position;
            element.tabIndex = position === '0' ? 0 : -1;
            if (position === 'hidden') element.setAttribute('aria-hidden', 'true');
            else element.removeAttribute('aria-hidden');
        });
    }

    function renderSpotlight(animate) {
        const barber = activeBarber();
        if (state.loadError) {
            spotlight.innerHTML = `<p class="retry-row"><button type="button" class="btn btn-ghost btn-small" data-retry>${esc(t('err.retry'))}</button></p>`;
            return;
        }
        if (!barber) {
            spotlight.innerHTML = '';
            return;
        }
        let status;
        if (!isOpen(barber)) {
            status = `<span class="dot"></span><span>${esc(t('barbers.closedNow'))}</span>`;
        } else if (barber.next) {
            status = `<span class="dot dot-on"></span><span>${esc(t('barbers.next', { when: '' }))}<strong>${esc(`${relativeDay(barber.next.date)} · ${formatTime(barber.next.time)}`)}</strong></span>`;
        } else if (barber.today === 'off') {
            status = `<span class="dot"></span><span>${esc(t('barbers.offToday'))}</span>`;
        } else {
            status = `<span class="dot"></span><span>${esc(t('barbers.none'))}</span>`;
        }
        spotlight.innerHTML = `
            <h2 class="spot-name">${esc(barber.name)}</h2>
            <p class="spot-status">${status}</p>
            <button type="button" class="btn btn-light" data-book="${barber.id}" ${state.info.open && isOpen(barber) ? '' : 'disabled'}>${esc(t('barbers.bookWith', { name: barber.name }))}</button>`;
        if (animate) {
            spotlight.classList.remove('spot-in');
            void spotlight.offsetWidth;
            spotlight.classList.add('spot-in');
        }
    }

    // A button for every barber, so any barber can be shown straight away.
    function renderPicker() {
        const list = barberList();
        if (list.length < 2) {
            picker.innerHTML = '';
            return;
        }
        picker.setAttribute('aria-label', t('carousel.label'));
        picker.innerHTML = `${list.map((barber, index) => `
            <button type="button" class="pick ${isOpen(barber) ? '' : 'is-closed'}" data-index="${index}" aria-current="${index === state.slide}">
                <span class="pick-face">${barber.photo ? `<img src="${esc(barber.photo)}" alt="">` : esc(initial(barber.name))}</span>
                <span>${esc(barber.name)}</span>
                <span class="pick-progress" aria-hidden="true"></span>
            </button>`).join('')}`;
        // On phones, keep the current barber's button in view. Only the row of buttons scrolls,
        // never the page (scrollIntoView would also move the slideshow sideways).
        const active = picker.querySelector('.pick[aria-current="true"]');
        if (active && picker.scrollWidth > picker.clientWidth) {
            const row = picker.getBoundingClientRect();
            const button = active.getBoundingClientRect();
            picker.scrollBy({ left: (button.left + button.width / 2) - (row.left + row.width / 2), behavior: 'smooth' });
        }
    }

    function renderCarousel(animate = false) {
        const count = barberList().length;
        if (state.slide >= count) state.slide = 0;
        carousel.setAttribute('aria-label', t('carousel.label'));
        renderStage();
        renderSpotlight(animate);
        renderPicker();
        carousel.querySelectorAll('[data-slide]').forEach(arrow => {
            const next = arrow.dataset.slide === 'next';
            arrow.hidden = count < 2;
            arrow.setAttribute('aria-label', t(next ? 'carousel.next' : 'carousel.prev'));
            arrow.innerHTML = icon(next ? 'next' : 'prev', 'flip-rtl');
        });
        syncTimer();
    }

    /* ---------------- Page ---------------- */

    function renderLanguages() {
        $('#langs').innerHTML = LANGS.map(lang => `
            <button type="button" data-lang="${lang.code}" aria-pressed="${lang.code === state.lang}" lang="${lang.code}">${esc(lang.label)}</button>`).join('');
    }

    function applyLanguage() {
        const lang = LANGS.find(item => item.code === state.lang) || LANGS[0];
        document.documentElement.lang = lang.code;
        document.documentElement.dir = lang.dir;
        document.querySelectorAll('[data-t]').forEach(element => {
            element.textContent = t(element.dataset.t);
        });
        $('#loader').setAttribute('aria-label', t('loading'));
        renderLanguages();
        renderPage();
        if (!sheetRoot.hidden) renderSheet();
    }

    function todayOpenText(info) {
        const today = parseDate(info.today);
        if (info.hours.closed_weekdays.includes(today.weekday)) return { open: false, text: t('hours.closedToday') };
        const now = new Date();
        const minutes = now.getHours() * 60 + now.getMinutes();
        const [openH, openM] = info.hours.open.split(':').map(Number);
        const [closeH, closeM] = info.hours.close.split(':').map(Number);
        const start = openH * 60 + openM;
        const end = closeH * 60 + closeM || 24 * 60;
        if (minutes >= start && minutes < end) return { open: true, text: t('hours.openNow', { close: closingTime(info.hours.close) }) };
        return { open: false, text: t('hours.today', { open: formatTime(info.hours.open), close: closingTime(info.hours.close) }) };
    }

    function renderPage() {
        const info = state.info;
        renderCarousel(false);
        if (!info) return;

        const shop = info.shop || {};
        document.title = `${shop.name || 'XBARBER'} · ${t('nav.book')}`;
        $('#hero-eyebrow').textContent = [t('hero.eyebrow'), shop.address].filter(Boolean).join(' · ');
        const status = todayOpenText(info);
        $('#hero-hours').innerHTML = `<span class="dot ${status.open ? 'dot-on' : ''}"></span><span>${esc(status.text)}</span>`;
        $('#closed-banner').hidden = info.open;
        $('#closed-banner').textContent = t('closed.banner');

        $('#footer-name').textContent = String(shop.name || 'XBARBER').toUpperCase();
        $('#footer-hours').textContent = t('footer.daily', { open: formatTime(info.hours.open), close: closingTime(info.hours.close) });
        const closedDays = info.hours.closed_weekdays.map(day => WEEKDAYS[state.lang][day]).join(state.lang === 'en' ? ', ' : '، ');
        $('#footer-closed').textContent = closedDays ? t('footer.closedDays', { days: closedDays }) : '';
        $('#footer-address').textContent = shop.address || '';
        const footerPhone = $('#footer-phone');
        footerPhone.hidden = !shop.phone;
        if (shop.phone) {
            footerPhone.href = `tel:${String(shop.phone).replace(/[^\d+]/g, '')}`;
            footerPhone.textContent = shop.phone;
        }
        renderSocial(shop);
    }

    // "See our work" (Instagram) and the WhatsApp button. The links are set in the cashier (Settings, Shop).
    function renderSocial(shop) {
        const links = [
            { name: 'whatsapp', url: shop.whatsapp }
        ].filter(link => /^https:\/\//.test(String(link.url || '')));
        const social = $('#footer-social');
        social.hidden = !links.length;
        social.setAttribute('aria-label', t('footer.follow'));
        social.innerHTML = links.map(link => `
            <a class="social-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"
                aria-label="${esc(t(`footer.${link.name}`))}" title="${esc(t(`footer.${link.name}`))}">${brandIcon(link.name)}</a>`).join('');
        // "See our work" opens the Instagram page.
        const work = $('#footer-work');
        const instagram = /^https:\/\//.test(String(shop.instagram || '')) ? shop.instagram : '';
        work.hidden = !instagram;
        if (instagram) {
            work.href = instagram;
            work.innerHTML = `${brandIcon('instagram')}<span>${esc(t('footer.seeWork'))}</span>${icon('next', 'flip-rtl')}`;
        }
    }

    // Loads (or reloads) the shop and its barbers, keeping the same barber in the middle.
    async function loadInfo() {
        const shownId = activeBarber()?.id;
        state.loadError = false;
        try {
            state.info = await request('/api/public/info');
        } catch (error) {
            if (!state.info) state.loadError = true;
        }
        const index = barberList().findIndex(barber => barber.id === shownId);
        state.slide = index >= 0 ? index : Math.min(state.slide, Math.max(barberList().length - 1, 0));
        renderPage();
        if (!state.ready) {
            // Let the logo finish its animation before the page shows, then start the slideshow.
            const wait = Math.max(0, MIN_LOADER_MS - (Date.now() - startedAt));
            setTimeout(() => {
                document.body.classList.add('is-ready');
                state.ready = true;
                restartTimer();
            }, wait);
        } else {
            restartTimer();
        }
    }

    /* ---------------- Booking sheet ---------------- */

    function openSheet(barberId) {
        const barber = state.info?.barbers.find(item => item.id === barberId);
        if (!barber) return;
        Object.assign(state, {
            barber, days: [], dayIndex: 0, time: null, step: 'time', notice: '', errors: {}, booked: null, sending: false, loadingDays: true
        });
        state.lastFocus = document.activeElement;
        sheetRoot.hidden = false;
        document.body.classList.add('sheet-open');
        syncTimer();
        requestAnimationFrame(() => sheetRoot.classList.add('show'));
        renderSheet();
        sheet.focus({ preventScroll: true });
        loadDays(true);
        clearInterval(state.refreshTimer);
        state.refreshTimer = setInterval(() => {
            if (state.step === 'time' && !document.hidden) loadDays(false);
        }, REFRESH_MS);
    }

    function closeSheet() {
        clearInterval(state.refreshTimer);
        sheetRoot.classList.remove('show');
        document.body.classList.remove('sheet-open');
        setTimeout(() => {
            sheetRoot.hidden = true;
            sheet.innerHTML = '';
            syncTimer();
        }, 250);
        if (state.booked) loadInfo();
        if (state.lastFocus && document.contains(state.lastFocus)) state.lastFocus.focus({ preventScroll: true });
    }

    async function loadDays(first) {
        if (!state.barber) return;
        try {
            const data = await request(`/api/public/availability?barber=${state.barber.id}`);
            state.days = data.days || [];
            if (state.info) state.info.open = data.open;
            if (first) {
                const firstFree = state.days.findIndex(day => day.free.length);
                state.dayIndex = firstFree >= 0 ? firstFree : 0;
            }
            // A time someone else just took is no longer selected.
            const day = state.days[state.dayIndex];
            if (state.time && (!day || !day.free.includes(state.time))) {
                state.time = null;
                state.notice = t('err.taken');
            }
        } catch (error) {
            if (first) state.notice = t('err.network');
        }
        state.loadingDays = false;
        if (state.step === 'time') renderSheet();
    }

    function sheetHeader() {
        const barber = state.barber;
        const steps = ['time', 'details', 'done'];
        const current = steps.indexOf(state.step);
        return `
            <div class="sheet-head">
                ${state.step === 'details' ? `<button type="button" class="icon-btn" data-back aria-label="${esc(t('common.back'))}">${icon('back', 'flip-rtl')}</button>` : ''}
                <span class="sheet-avatar">${barber.photo ? `<img src="${esc(barber.photo)}" alt="">` : esc(initial(barber.name))}</span>
                <div class="sheet-who">
                    <small>${esc(t('sheet.with'))}</small>
                    <h2 id="sheet-title">${esc(barber.name)}</h2>
                </div>
                <button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('close')}</button>
            </div>
            <div class="progress" aria-hidden="true">
                ${['sheet.step1', 'sheet.step2', 'sheet.step3'].map((key, index) => `
                    <span class="${index < current ? 'is-done' : index === current ? 'is-current' : ''}">${esc(t(key))}</span>`).join('')}
            </div>`;
    }

    function dayChip(day, index) {
        const date = parseDate(day.date);
        const today = state.info.today;
        const name = day.date === today ? t('day.today') : day.date === addDays(today, 1) ? t('day.tomorrow') : WEEKDAYS_SHORT[state.lang][date.weekday];
        let note;
        if (day.status === 'closed') note = t('sheet.closed');
        else if (day.status === 'off') note = t('sheet.off');
        else if (!day.free.length) note = t('sheet.full');
        else note = t('sheet.free', { n: day.free.length });
        const usable = day.status === 'open' && day.free.length > 0;
        return `
            <button type="button" class="day ${usable ? '' : 'is-empty'}" data-day="${index}" aria-pressed="${index === state.dayIndex}" ${usable ? '' : 'disabled'}>
                <small>${esc(name)}</small>
                <strong>${date.day}</strong>
                <em>${esc(note)}</em>
            </button>`;
    }

    function timeStep() {
        if (state.loadingDays) return `<p class="notice notice-soft">${esc(t('sheet.loading'))}</p>`;
        if (!state.info.open) return `<p class="notice">${esc(t('err.closed'))}</p>`;
        const day = state.days[state.dayIndex];
        const anyFree = state.days.some(item => item.free.length);
        let times = '';
        if (!day) {
            times = `<p class="empty-day">${esc(t('err.network'))}</p>`;
        } else if (day.status === 'closed') {
            times = `<p class="empty-day">${esc(t('sheet.closedDay'))}</p>`;
        } else if (day.status === 'off') {
            times = `<p class="empty-day">${esc(t('sheet.offDay', { name: state.barber.name }))}</p>`;
        } else if (!day.free.length && !day.taken.length) {
            times = `<p class="empty-day">${esc(t('sheet.noneDay'))}</p>`;
        } else {
            const all = [...day.free.map(time => ({ time, free: true })), ...day.taken.map(time => ({ time, free: false }))]
                .sort((a, b) => a.time.localeCompare(b.time));
            times = `
                <div class="times" role="group" aria-label="${esc(t('sheet.pickTime'))}">
                    ${all.map(slot => slot.free
                        ? `<button type="button" class="time" data-time="${esc(slot.time)}" aria-pressed="${slot.time === state.time}">${esc(formatTime(slot.time))}</button>`
                        : `<button type="button" class="time is-taken" disabled aria-label="${esc(`${formatTime(slot.time)} · ${t('sheet.taken')}`)}">${esc(formatTime(slot.time))}</button>`).join('')}
                </div>
                <div class="time-legend">
                    <span><i></i>${esc(t('sheet.legendFree'))}</span>
                    <span><i class="legend-taken"></i>${esc(t('sheet.legendTaken'))}</span>
                </div>
                ${day.free.length ? '' : `<p class="empty-day empty-day-spaced">${esc(t('sheet.noneDay'))}</p>`}`;
        }
        return `
            ${state.notice ? `<p class="notice" role="alert">${esc(state.notice)}</p>` : ''}
            ${anyFree ? '' : `<p class="notice notice-soft">${esc(t('sheet.noDays'))}</p>`}
            <span class="label">${esc(t('sheet.pickDay'))}</span>
            <div class="days">${state.days.map(dayChip).join('')}</div>
            <span class="label">${esc(t('sheet.pickTime'))}</span>
            ${times}`;
    }

    function chosenText() {
        const day = state.days[state.dayIndex];
        return t('sheet.chosen', { day: relativeDay(day.date), time: formatTime(state.time) });
    }

    function detailsStep() {
        const error = key => state.errors[key] ? `<span class="field-error" id="err-${key}">${esc(state.errors[key])}</span>` : '';
        return `
            ${state.notice ? `<p class="notice" role="alert">${esc(state.notice)}</p>` : ''}
            <div class="choice-summary">
                ${icon('clock')}
                <div><small>${esc(state.barber.name)}</small><strong>${esc(chosenText())}</strong></div>
                <button type="button" class="link-btn" data-back>${esc(t('sheet.change'))}</button>
            </div>
            <form data-details novalidate>
                <label class="field">
                    <span>${esc(t('form.name'))}</span>
                    <input type="text" name="name" maxlength="60" autocomplete="name" placeholder="${esc(t('form.namePh'))}" value="${esc(state.name)}" ${state.errors.name ? 'aria-invalid="true" aria-describedby="err-name"' : ''}>
                    ${error('name')}
                </label>
                <label class="field">
                    <span>${esc(t('form.phone'))}</span>
                    <input type="tel" name="phone" maxlength="30" autocomplete="tel" inputmode="tel" dir="ltr" placeholder="${esc(t('form.phonePh'))}" value="${esc(state.phone)}" ${state.errors.phone ? 'aria-invalid="true" aria-describedby="err-phone"' : ''}>
                    ${error('phone')}
                </label>
                <p class="privacy">${esc(t('form.note'))}</p>
                <button type="submit" hidden></button>
            </form>`;
    }

    function doneStep() {
        const booked = state.booked;
        const phone = state.info?.shop?.phone;
        return `
            <div class="done">
                <svg class="done-check" viewBox="0 0 88 88" aria-hidden="true">
                    <circle cx="44" cy="44" r="40"/>
                    <path d="M27 45 39 57 62 32"/>
                </svg>
                <h2 class="display">${esc(t('done.title'))}</h2>
                <p class="done-when">${esc(t('done.when', { day: formatDateLong(booked.date), time: formatTime(booked.time) }))}</p>
                <p>${esc(booked.barber)}</p>
                <p class="done-note">${esc(t('done.note'))}</p>
                ${phone ? `<a class="btn btn-ghost btn-small" href="tel:${esc(String(phone).replace(/[^\d+]/g, ''))}" dir="ltr">${esc(t('done.call'))} · ${esc(phone)}</a>` : ''}
            </div>`;
    }

    function sheetFooter() {
        if (state.step === 'time') {
            const ready = Boolean(state.time);
            return `
                <div class="sheet-foot">
                    <button type="button" class="btn btn-light btn-block" data-continue ${ready ? '' : 'disabled'}>
                        ${esc(ready ? `${t('sheet.continue')} · ${formatTime(state.time)}` : t('sheet.pickFirst'))}
                    </button>
                </div>`;
        }
        if (state.step === 'details') {
            return `
                <div class="sheet-foot">
                    <button type="button" class="btn btn-light btn-block" data-confirm ${state.sending ? 'disabled' : ''}>${esc(t(state.sending ? 'form.sending' : 'form.confirm'))}</button>
                </div>`;
        }
        return `
            <div class="sheet-foot">
                <button type="button" class="btn btn-light btn-block" data-close>${esc(t('done.close'))}</button>
            </div>`;
    }

    function renderSheet() {
        if (!state.barber) return;
        const daysScroll = sheet.querySelector('.days')?.scrollLeft || 0;
        const bodyScroll = sheet.querySelector('.sheet-body')?.scrollTop || 0;
        const body = state.step === 'time' ? timeStep() : state.step === 'details' ? detailsStep() : doneStep();
        sheet.innerHTML = `${sheetHeader()}<div class="sheet-body">${body}</div>${sheetFooter()}`;
        const days = sheet.querySelector('.days');
        if (days) days.scrollLeft = daysScroll;
        const scroller = sheet.querySelector('.sheet-body');
        if (scroller) scroller.scrollTop = bodyScroll;
    }

    function goToDetails() {
        if (!state.time) return;
        state.step = 'details';
        state.notice = '';
        renderSheet();
        sheet.querySelector('.sheet-body').scrollTop = 0;
        const input = sheet.querySelector('[name="name"]');
        if (input) setTimeout(() => input.focus(), 60);
    }

    function validate() {
        const errors = {};
        if (state.name.trim().length < 2) errors.name = t('err.name');
        const digits = state.phone.replace(/\D+/g, '');
        if (digits.length < 7 || digits.length > 15) errors.phone = t('err.phone');
        state.errors = errors;
        return !Object.keys(errors).length;
    }

    async function confirmBooking() {
        if (state.sending) return;
        if (!validate()) {
            state.notice = '';
            renderSheet();
            sheet.querySelector('[aria-invalid="true"]')?.focus();
            return;
        }
        state.sending = true;
        state.notice = '';
        renderSheet();
        const day = state.days[state.dayIndex];
        try {
            const result = await request('/api/public/book', {
                method: 'POST',
                body: JSON.stringify({ barber_id: state.barber.id, date: day.date, time: state.time, name: state.name.trim(), phone: state.phone.trim() })
            });
            state.booked = result.booking;
            state.step = 'done';
        } catch (error) {
            const code = error.code;
            if (code === 'taken') {
                // Back to the times, which are loaded again.
                state.step = 'time';
                state.time = null;
                state.notice = t('err.taken');
                state.sending = false;
                await loadDays(false);
                state.notice = t('err.taken');
            } else if (code === 'name' || code === 'phone') {
                state.errors = { [code]: t(`err.${code}`) };
            } else if (['limit', 'busy', 'closed'].includes(code)) {
                state.notice = t(`err.${code}`);
            } else {
                state.notice = t('err.network');
            }
        }
        state.sending = false;
        renderSheet();
    }

    /* ---------------- Events ---------------- */

    let swipe = null;
    let ignoreClick = false;

    document.addEventListener('click', event => {
        const lang = event.target.closest('[data-lang]');
        if (lang) {
            state.lang = lang.dataset.lang;
            try {
                localStorage.setItem(STORAGE_KEY, state.lang);
            } catch (error) {
                // Ignore: the choice still applies until the page closes.
            }
            applyLanguage();
            return;
        }
        if (event.target.closest('[data-retry]')) {
            loadInfo();
            return;
        }
        // "Book now" in the header books with the barber in the middle.
        if (event.target.closest('[data-book-active]')) {
            const barber = activeBarber();
            if (isOpen(barber) && state.info?.open) openSheet(barber.id);
            else carousel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        const book = event.target.closest('[data-book]');
        if (book) {
            openSheet(Number(book.dataset.book));
            return;
        }
        const arrow = event.target.closest('[data-slide]');
        if (arrow) {
            goTo(state.slide + (arrow.dataset.slide === 'next' ? 1 : -1));
            return;
        }
        const slide = event.target.closest('.slide[data-index]');
        if (slide) {
            if (ignoreClick) return;
            const index = Number(slide.dataset.index);
            // The photo in the middle opens the booking; a photo beside it comes to the middle.
            if (index === state.slide) {
                const barber = activeBarber();
                if (isOpen(barber) && state.info?.open) openSheet(barber.id);
            } else {
                goTo(index);
            }
            return;
        }
        const pick = event.target.closest('.pick[data-index]');
        if (pick) {
            goTo(Number(pick.dataset.index));
            return;
        }

        if (sheetRoot.hidden) return;
        if (event.target === sheetRoot || event.target.closest('[data-close]')) {
            closeSheet();
            return;
        }
        if (event.target.closest('[data-back]')) {
            state.step = 'time';
            state.notice = '';
            renderSheet();
            return;
        }
        const dayButton = event.target.closest('[data-day]');
        if (dayButton && !dayButton.disabled) {
            state.dayIndex = Number(dayButton.dataset.day);
            state.time = null;
            state.notice = '';
            renderSheet();
            return;
        }
        const timeButton = event.target.closest('[data-time]');
        if (timeButton) {
            state.time = timeButton.dataset.time;
            state.notice = '';
            renderSheet();
            return;
        }
        if (event.target.closest('[data-continue]')) {
            goToDetails();
            return;
        }
        if (event.target.closest('[data-confirm]')) confirmBooking();
    });

    // Swipe the photos left or right on a phone.
    stage.addEventListener('pointerdown', event => {
        swipe = { x: event.clientX, y: event.clientY };
    });
    stage.addEventListener('pointerup', event => {
        if (!swipe) return;
        const dx = event.clientX - swipe.x;
        const dy = event.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
        ignoreClick = true;
        setTimeout(() => {
            ignoreClick = false;
        }, 350);
        const forward = dx < 0 ? 1 : -1;
        goTo(state.slide + (isRtl() ? -forward : forward));
    });
    stage.addEventListener('pointercancel', () => {
        swipe = null;
    });

    // The slideshow waits while the mouse is on a photo, an arrow or a barber button
    // (not the empty space beside them), and while the keyboard is in them.
    function setHoverHold(on) {
        if (state.hoverHold === on) return;
        state.hoverHold = on;
        syncTimer();
    }
    document.addEventListener('pointerover', event => {
        if (event.pointerType !== 'mouse') return;
        setHoverHold(Boolean(event.target.closest?.('.slide[data-index], .arrow, .pick')));
    });
    document.documentElement.addEventListener('pointerleave', () => setHoverHold(false));
    [carousel, picker].forEach(element => {
        element.addEventListener('keydown', event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const forward = event.key === 'ArrowRight' ? 1 : -1;
            goTo(state.slide + (isRtl() ? -forward : forward));
        });
    });
    hero.addEventListener('focusin', event => {
        if (!event.target.matches(':focus-visible') || !event.target.closest('#carousel, #picker')) return;
        state.focusHold = true;
        syncTimer();
    });
    hero.addEventListener('focusout', event => {
        if (event.relatedTarget && event.relatedTarget.closest?.('#carousel, #picker')) return;
        state.focusHold = false;
        syncTimer();
    });
    document.addEventListener('visibilitychange', syncTimer);

    document.addEventListener('input', event => {
        const input = event.target;
        if (!input.closest('[data-details]')) return;
        if (input.name === 'name' || input.name === 'phone') {
            state[input.name] = input.value;
            if (state.errors[input.name]) {
                delete state.errors[input.name];
                input.removeAttribute('aria-invalid');
                input.parentElement.querySelector('.field-error')?.remove();
            }
        }
    });

    document.addEventListener('submit', event => {
        if (!event.target.closest('[data-details]')) return;
        event.preventDefault();
        confirmBooking();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !sheetRoot.hidden) closeSheet();
        // Keep the keyboard inside the booking window while it is open.
        if (event.key === 'Tab' && !sheetRoot.hidden) {
            const focusable = [...sheet.querySelectorAll('button:not([disabled]), input, a[href]')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    // The next free times stay fresh while the page is open.
    setInterval(() => {
        if (!document.hidden && sheetRoot.hidden && state.info) loadInfo();
    }, 60000);

    [$('.hero-head'), carousel, spotlight, picker].forEach(element => element.classList.add('reveal'));
    $('#footer-year').textContent = String(new Date().getFullYear());
    applyLanguage();
    loadInfo();
}());
