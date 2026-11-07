'use strict';

/*
 * XOSHAWI BARBER booking website.
 * Black and white. A long loading screen (the X is drawn, scissors cut a line, a counter runs to 100),
 * then the barbers in a slider you can drag, with momentum, that never ends and moves on every
 * 5 seconds. Barber tools (scissors, razor, comb, clipper) move in the background and in a black band.
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
    // The loading screen stays at least this long, so the logo animation can play in full.
    const MIN_LOADER_MS = 4900;
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
            'barbers.bookWith': 'Book with {name}',
            'cursor.drag': 'Drag',
            'cursor.book': 'Book'
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
            'barbers.bookWith': 'احجز مع {name}',
            'cursor.drag': 'اسحب',
            'cursor.book': 'احجز'
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
            'barbers.bookWith': 'نۆرە لای {name} بگرە',
            'cursor.drag': 'ڕایبکێشە',
            'cursor.book': 'نۆرە بگرە'
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
    const LOADER_MS = reducedMotion ? 900 : MIN_LOADER_MS;
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
    const sliderCount = $('#slider-count');
    const loader = $('#loader');
    const cursor = $('#cursor');
    let slideTimer = null;
    let slideStarted = 0;
    let slideLeft = SLIDE_MS;

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

    /* ---------------- Barber slider ---------------- */
    /*
     * The photos sit in a row. Drag them (or swipe, or use the arrows); they glide with momentum and
     * settle on the nearest barber, who is the one shown under the photos. Each barber has one photo;
     * the row stops at the first and the last. Every 5 seconds it moves on by itself, and after the
     * last barber it goes back to the first.
     */

    const slider = {
        cards: [],
        count: 0,
        total: 0,
        current: 0,
        target: 0,
        step: 300,
        raf: 0,
        last: 0,
        drag: null,
        wheelTimer: 0,
        key: ''
    };

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

    function mod(value, size) {
        return ((value % size) + size) % size;
    }

    // A position on the row, kept between the first and the last barber.
    function clampSlide(value) {
        return Math.max(0, Math.min(barberList().length - 1, value));
    }

    function pad(value, size) {
        return String(value).padStart(size, '0');
    }

    // Runs while nothing holds it: not dragged or hovered, no booking window open, page visible.
    // People who ask their phone for less motion move between barbers themselves.
    function playing() {
        return state.ready && !reducedMotion && barberList().length > 1 && !state.hoverHold && !state.focusHold
            && !slider.drag && sheetRoot.hidden && !document.hidden;
    }

    // The 5-second timer. A pause keeps the time that was left, so the line below continues where it stopped.
    function syncTimer() {
        const run = playing();
        if (run && !slideTimer) {
            slideStarted = Date.now();
            slideTimer = setTimeout(() => {
                slideTimer = null;
                moveBy(1, { auto: true });
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

    // The slider has come to rest on a barber (or is on its way): show their name and button.
    function settle({ auto = false } = {}) {
        const count = barberList().length;
        if (!count) return;
        const before = state.slide;
        slider.target = clampSlide(Math.round(slider.target));
        state.slide = slider.target;
        const pickerHadFocus = picker.contains(document.activeElement);
        if (state.slide !== before) {
            renderSpotlight(true);
            renderPicker();
            renderCount();
            if (pickerHadFocus && !auto) picker.querySelector('.pick[aria-current="true"]')?.focus({ preventScroll: true });
        }
        restartTimer();
        kick();
    }

    function moveBy(delta, options = {}) {
        const count = barberList().length;
        if (count < 2) return;
        let next = Math.round(slider.target) + delta;
        // The timer and the arrows go round: after the last barber comes the first again.
        if (next > count - 1) next = 0;
        else if (next < 0) next = count - 1;
        slider.target = next;
        settle(options);
    }

    function goTo(index) {
        if (barberList().length < 2) return;
        slider.target = clampSlide(index);
        settle();
    }

    function measureSlider() {
        const card = stage.querySelector('.card');
        if (!card) return;
        const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 20;
        slider.step = card.offsetWidth + gap;
    }

    // Puts every photo in its place for the slider's position right now.
    function layoutSlider() {
        if (!slider.total) return;
        const dir = isRtl() ? -1 : 1;
        const speed = slider.target - slider.current;
        const skew = Math.max(-6, Math.min(6, speed * -9)) * dir;
        slider.cards.forEach((card, virtual) => {
            const offset = virtual - slider.current;
            const distance = Math.abs(offset);
            const scale = 1 - Math.min(distance, 1) * 0.12;
            card.style.transform = `translate3d(${(offset * slider.step * dir).toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)}) skewX(${skew.toFixed(2)}deg)`;
            card.style.opacity = String(Math.max(0, 1 - Math.min(distance, 3) * 0.24).toFixed(3));
            card.style.zIndex = String(100 - Math.round(distance * 10));
            // The photo moves a little slower than its frame.
            const media = card.firstElementChild;
            if (media) media.style.transform = `translate3d(${(-offset * 9 * dir).toFixed(2)}%, 0, 0)`;
            const active = distance < 0.5;
            card.classList.toggle('is-active', active);
            card.tabIndex = active ? 0 : -1;
        });
    }

    function tick(now) {
        const elapsed = slider.last ? Math.min(64, now - slider.last) : 16.7;
        slider.last = now;
        const ease = reducedMotion ? 1 : 1 - Math.pow(1 - 0.075, elapsed / 16.7);
        slider.current += (slider.target - slider.current) * ease;
        if (!slider.drag && Math.abs(slider.target - slider.current) < 0.0005) slider.current = slider.target;
        layoutSlider();
        if (slider.drag || slider.current !== slider.target) {
            slider.raf = requestAnimationFrame(tick);
        } else {
            slider.raf = 0;
            slider.last = 0;
        }
    }

    function kick() {
        if (slider.raf) return;
        slider.last = 0;
        slider.raf = requestAnimationFrame(tick);
    }

    function photoMarkup(barber) {
        return barber.photo
            ? `<img src="${esc(barber.photo)}" alt="" draggable="false">`
            : `<span class="card-initial" aria-hidden="true">${esc(initial(barber.name))}</span>`;
    }

    function renderStage() {
        const list = barberList();
        let placeholder = '';
        if (state.loadError) placeholder = `<div class="card card-empty">${MARK}<p>${esc(t('err.load'))}</p></div>`;
        else if (!state.info) placeholder = '<div class="card card-loading"></div>';
        else if (!list.length) placeholder = `<div class="card card-empty">${MARK}<p>${esc(t('barbers.empty'))}</p></div>`;
        if (placeholder) {
            const key = state.loadError ? 'error' : state.info ? 'empty' : 'loading';
            if (slider.key !== key) {
                slider.key = key;
                stage.innerHTML = placeholder;
            }
            slider.cards = [];
            slider.count = 0;
            slider.total = 0;
            return;
        }
        // The photos are only rebuilt when the barbers change, so moving between them stays smooth.
        const key = `${state.lang}|${list.map(barber => `${barber.id}:${barber.name}:${barber.photo || ''}:${isOpen(barber)}`).join('|')}`;
        if (key !== slider.key) {
            slider.key = key;
            const count = list.length;
            // One photo for each barber.
            const total = count;
            let html = '';
            for (let index = 0; index < count; index += 1) {
                const barber = list[index];
                html += `
                    <button type="button" class="card ${isOpen(barber) ? '' : 'is-closed'}" data-index="${index}" data-virtual="${index}"
                        aria-roledescription="slide" aria-label="${esc(`${barber.name} · ${t('carousel.slide', { n: index + 1, total: count })}`)}">
                        <span class="card-media">${photoMarkup(barber)}</span>
                        <span class="card-num" dir="ltr">NO ${pad(index + 1, 3)}</span>
                        <span class="card-name">${esc(barber.name)}</span>
                    </button>`;
            }
            stage.innerHTML = html;
            slider.cards = [...stage.querySelectorAll('.card[data-virtual]')];
            slider.count = count;
            slider.total = total;
            slider.current = slider.target = state.slide;
            measureSlider();
        }
        layoutSlider();
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
            <button type="button" class="btn btn-ink" data-book="${barber.id}" ${state.info.open && isOpen(barber) ? '' : 'disabled'}>${esc(t('barbers.bookWith', { name: barber.name }))}</button>`;
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
        picker.innerHTML = list.map((barber, index) => `
            <button type="button" class="pick ${isOpen(barber) ? '' : 'is-closed'}" data-index="${index}" aria-current="${index === state.slide}">
                <span class="pick-num" dir="ltr">${pad(index + 1, 3)}</span>
                <span class="pick-name">${esc(barber.name)}</span>
                <span class="pick-progress" aria-hidden="true"></span>
            </button>`).join('');
        // On phones, keep the current barber's button in view. Only the row of buttons scrolls.
        const active = picker.querySelector('.pick[aria-current="true"]');
        if (active && picker.scrollWidth > picker.clientWidth) {
            const row = picker.getBoundingClientRect();
            const button = active.getBoundingClientRect();
            picker.scrollBy({ left: (button.left + button.width / 2) - (row.left + row.width / 2), behavior: 'smooth' });
        }
    }

    function renderCount() {
        const count = barberList().length;
        sliderCount.textContent = count ? `${pad(state.slide + 1, 2)} / ${pad(count, 2)}` : '';
    }

    function renderCarousel(animate = false) {
        const count = barberList().length;
        if (state.slide >= count) state.slide = 0;
        carousel.setAttribute('aria-label', t('carousel.label'));
        renderStage();
        renderSpotlight(animate);
        renderPicker();
        renderCount();
        document.querySelectorAll('[data-slide]').forEach(arrow => {
            const next = arrow.dataset.slide === 'next';
            arrow.hidden = count < 2;
            arrow.setAttribute('aria-label', t(next ? 'carousel.next' : 'carousel.prev'));
            arrow.innerHTML = icon(next ? 'next' : 'prev', 'flip-rtl');
        });
        syncTimer();
    }

    /* ---------------- Barber tools ---------------- */

    // Line drawings of the barber's tools (64 × 64). Their parts move with the CSS in site.css.
    const TOOLS = {
        scissors: `
            <g class="t-blade t-blade-a"><circle cx="13" cy="21" r="7"/><path d="M19 24.5 30 32"/><path d="M30 32 60 39 57 41.5 31 35.5"/></g>
            <g class="t-blade t-blade-b"><circle cx="13" cy="43" r="7"/><path d="M19 39.5 30 32"/><path d="M30 32 60 25 57 22.5 31 28.5"/></g>
            <circle class="t-fill" cx="30" cy="32" r="1.8"/>`,
        razor: `
            <path d="M8 42.5c0-2.6 1.8-4.2 4.2-4.1l27.6 1.4c2.3.1 4.2 1.8 4.2 4.1s-1.9 3.9-4.2 3.9H12.2C9.8 47.8 8 45.6 8 42.5Z"/>
            <path d="M14 43h20"/>
            <g class="t-razor-blade"><path d="M41.5 43.5V36c0-3 2.2-5 5-5h12.3c1.6 0 2.4 1.5 1.6 2.8L54.6 42c-.9 1.1-2 1.6-3.4 1.6Z"/><path d="M46 35.5h10.5"/></g>
            <circle class="t-fill" cx="41.5" cy="43.5" r="1.6"/>`,
        comb: `
            <g class="t-comb"><path d="M8 20h48a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 8 20Z"/>
            <path d="M10 30v15M14.5 30v15M19 30v15M23.5 30v15M28 30v15M32.5 30v11M37 30v11M41.5 30v11M46 30v11M50.5 30v11M55 30v11"/></g>`,
        clipper: `
            <g class="t-clipper"><rect x="21" y="16" width="22" height="40" rx="8"/><path d="M23 16v-5h18v5"/>
            <path d="M25.5 11V7M29.5 11V7M33.5 11V7M37.5 11V7"/><path d="M27 27h10M27 31.5h10"/><circle cx="32" cy="45" r="3.2"/></g>`
    };

    function toolSvg(name) {
        return `<svg class="tool tool-${name}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${TOOLS[name] || ''}</svg>`;
    }

    // Lines that draw themselves need their own length.
    function measureLines(root) {
        root.querySelectorAll('.tool path, .tool circle, .tool rect').forEach(shape => {
            if (typeof shape.getTotalLength !== 'function') return;
            try {
                shape.style.setProperty('--len', String(Math.ceil(shape.getTotalLength()) + 1));
            } catch (error) {
                // Not drawn on screen yet; it keeps the default length.
            }
        });
    }

    function renderTools() {
        document.querySelectorAll('[data-tool]').forEach(holder => {
            holder.innerHTML = toolSvg(holder.dataset.tool);
        });
        document.querySelectorAll('.step-tool').forEach(holder => {
            holder.classList.add('draw-ready');
            measureLines(holder);
        });
    }

    // The black bands: XOSHAWI BARBER, in full and in outline, with a tool between each, twice over so they
    // loop. The second band runs the other way.
    function renderBand() {
        const word = extra => `<span class="band-word ${extra}">XOSHAWI BARBER</span>`;
        const tool = name => `<span class="band-tool">${toolSvg(name)}</span>`;
        const first = [word(''), tool('scissors'), word('band-outline'), tool('razor'), word('band-italic'), tool('comb'), word('band-outline'), tool('clipper')].join('');
        const second = [word('band-outline'), tool('comb'), word('band-italic'), tool('clipper'), word('band-outline'), tool('scissors'), word(''), tool('razor')].join('');
        $('#band-track').innerHTML = first + first;
        $('#band-track-2').innerHTML = second + second;
    }

    /* ---------------- Depth: tools that follow the scroll and the mouse ---------------- */

    function startParallax() {
        if (reducedMotion) return;
        const items = [...document.querySelectorAll('[data-depth]')];
        const word = $('.hero-word');
        let scroll = 0;
        let mx = 0;
        let my = 0;
        let queued = false;
        const update = () => {
            queued = false;
            if (scroll > window.innerHeight * 1.6) return;
            items.forEach(item => {
                const depth = Number(item.dataset.depth) || 0.2;
                item.style.translate = `${(mx * depth * 60).toFixed(1)}px ${(-scroll * depth + my * depth * 60).toFixed(1)}px`;
            });
            word.style.translate = `0 ${(scroll * 0.18).toFixed(1)}px`;
        };
        const queue = () => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(update);
        };
        window.addEventListener('scroll', () => {
            scroll = window.scrollY;
            queue();
        }, { passive: true });
        document.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse') return;
            mx = event.clientX / window.innerWidth - 0.5;
            my = event.clientY / window.innerHeight - 0.5;
            queue();
        });
    }

    /* ---------------- Loading screen ---------------- */

    function startLoader() {
        document.body.classList.add('is-loading');
        loader.querySelectorAll('[data-draw]').forEach(shape => {
            try {
                shape.style.setProperty('--len', String(Math.ceil(shape.getTotalLength()) + 2));
            } catch (error) {
                shape.style.setProperty('--len', '3000');
            }
        });
        loader.classList.add('is-drawing');
        const count = $('#loader-count');
        const run = now => {
            if (state.ready) return;
            const progress = Math.min(1, (Date.now() - startedAt) / LOADER_MS);
            // Slow at the end, and it waits at 99 until the barbers have arrived.
            const eased = 1 - Math.pow(1 - progress, 2.2);
            const value = state.info || state.loadError ? Math.floor(eased * 100) : Math.min(99, Math.floor(eased * 100));
            count.textContent = pad(value, 3);
            requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
    }

    function finishLoader() {
        $('#loader-count').textContent = '100';
        document.body.classList.remove('is-loading');
        document.body.classList.add('is-ready');
        state.ready = true;
        measureSlider();
        layoutSlider();
        restartTimer();
    }

    /* ---------------- Mouse ring ---------------- */

    function startCursor() {
        const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!fine || reducedMotion) return;
        document.documentElement.classList.add('has-cursor');
        const label = cursor.firstElementChild;
        let x = -200;
        let y = -200;
        let tx = -200;
        let ty = -200;
        let raf = 0;
        const follow = () => {
            x += (tx - x) * 0.22;
            y += (ty - y) * 0.22;
            cursor.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(follow) : 0;
        };
        document.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse') return;
            tx = event.clientX;
            ty = event.clientY;
            const overTrack = Boolean(event.target.closest?.('.slider-track')) && sheetRoot.hidden && barberList().length > 0;
            const card = event.target.closest?.('.card[data-virtual]');
            let text = '';
            if (overTrack) {
                const bookable = card && card.classList.contains('is-active') && isOpen(activeBarber()) && state.info?.open;
                text = bookable && !slider.drag ? t('cursor.book') : t('cursor.drag');
            }
            if (label.textContent !== text) label.textContent = text;
            cursor.classList.toggle('is-on', Boolean(text));
            if (!raf) raf = requestAnimationFrame(follow);
        });
        document.documentElement.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
        // Scrolling moves the photos away from under the mouse.
        window.addEventListener('scroll', () => cursor.classList.remove('is-on'), { passive: true });
    }

    /* ---------------- Scrolling into view ---------------- */

    function startReveal() {
        const targets = document.querySelectorAll('.reveal-up, .draw-ready, .reveal-letters');
        if (!('IntersectionObserver' in window)) {
            targets.forEach(element => element.classList.add('in'));
            return;
        }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('in');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
        targets.forEach(element => observer.observe(element));
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
        $('#badge').setAttribute('aria-label', t('nav.book'));
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

    // The old default name counts as no name.
    function shopName(shop) {
        const name = String(shop?.name || '').trim();
        return name && name.toUpperCase() !== 'XBARBER SHOP' ? name : 'XOSHAWI BARBER';
    }

    function renderPage() {
        const info = state.info;
        renderCarousel(false);
        if (!info) return;

        const shop = info.shop || {};
        document.title = `${shopName(shop)} · ${t('nav.book')}`;
        $('#hero-eyebrow').textContent = [t('hero.eyebrow'), shop.address].filter(Boolean).join(' · ');
        const status = todayOpenText(info);
        $('#hero-hours').innerHTML = `<span class="dot ${status.open ? 'dot-on' : ''}"></span><span>${esc(status.text)}</span>`;
        $('#closed-banner').hidden = info.open;
        $('#closed-banner').textContent = t('closed.banner');

        $('#footer-name').textContent = shopName(shop).toUpperCase();
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
            // Let the logo finish its animation before the page shows, then start the slider.
            const wait = Math.max(0, LOADER_MS - (Date.now() - startedAt));
            setTimeout(finishLoader, wait);
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
            moveBy(arrow.dataset.slide === 'next' ? 1 : -1);
            return;
        }
        const card = event.target.closest('.card[data-virtual]');
        if (card) {
            if (ignoreClick) return;
            // The photo in the middle opens the booking; another photo comes to the middle.
            const offset = Math.round(Number(card.dataset.virtual) - slider.target);
            if (offset === 0) {
                const barber = activeBarber();
                if (isOpen(barber) && state.info?.open) openSheet(barber.id);
            } else {
                moveBy(offset);
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

    // Drag the photos with a finger or the mouse. They follow, glide on when let go, and settle
    // on the nearest barber. Up-and-down moves still scroll the page.
    stage.addEventListener('pointerdown', event => {
        if (barberList().length < 2 || event.button > 0) return;
        slider.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: slider.target, lastX: event.clientX, lastT: performance.now(), speed: 0, axis: null };
    });
    window.addEventListener('pointermove', event => {
        const drag = slider.drag;
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.axis) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (drag.axis === 'y') {
                slider.drag = null;
                return;
            }
            stage.classList.add('is-dragging');
            try {
                stage.setPointerCapture(event.pointerId);
            } catch (error) {
                // Not every browser allows it here; dragging still works.
            }
            syncTimer();
        }
        const dir = isRtl() ? -1 : 1;
        const raw = drag.start - (dx / slider.step) * dir;
        const last = barberList().length - 1;
        slider.target = raw < 0 ? raw * 0.3 : raw > last ? last + (raw - last) * 0.3 : raw;
        const now = performance.now();
        const elapsed = now - drag.lastT;
        if (elapsed > 0) drag.speed = 0.8 * ((event.clientX - drag.lastX) / elapsed) + 0.2 * drag.speed;
        drag.lastX = event.clientX;
        drag.lastT = now;
        kick();
    });
    const endDrag = event => {
        const drag = slider.drag;
        if (!drag || (event && event.pointerId !== drag.id)) return;
        slider.drag = null;
        stage.classList.remove('is-dragging');
        if (drag.axis !== 'x') return;
        const dir = isRtl() ? -1 : 1;
        // A quick flick carries on a little (at most a barber or two); any clear swipe moves at
        // least one barber, so a short swipe on a phone is never lost.
        const speed = Math.max(-2.5, Math.min(2.5, drag.speed));
        const fling = Math.max(-1.5, Math.min(1.5, (-speed * 220 / slider.step) * dir));
        const from = Math.round(drag.start);
        const moved = slider.target - drag.start;
        let next = Math.round(slider.target + fling);
        if (next === from && Math.abs(moved) > 0.12) next = from + Math.sign(moved);
        slider.target = next;
        settle();
        ignoreClick = true;
        setTimeout(() => {
            ignoreClick = false;
        }, 80);
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Sideways on a trackpad moves the photos too.
    stage.addEventListener('wheel', event => {
        if (barberList().length < 2 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        event.preventDefault();
        slider.target = Math.max(-0.3, Math.min(barberList().length - 0.7, slider.target + (event.deltaX / slider.step) * (isRtl() ? -1 : 1)));
        kick();
        clearTimeout(slider.wheelTimer);
        slider.wheelTimer = setTimeout(() => {
            slider.target = Math.round(slider.target);
            settle();
        }, 140);
    }, { passive: false });

    window.addEventListener('resize', () => {
        measureSlider();
        layoutSlider();
    });

    // The slider waits while the mouse is on a photo, an arrow or a barber button
    // (not the empty space beside them), and while the keyboard is in them.
    function setHoverHold(on) {
        if (state.hoverHold === on) return;
        state.hoverHold = on;
        syncTimer();
    }
    document.addEventListener('pointerover', event => {
        if (event.pointerType !== 'mouse') return;
        setHoverHold(Boolean(event.target.closest?.('.card[data-virtual], .arrow, .pick')));
    });
    document.documentElement.addEventListener('pointerleave', () => setHoverHold(false));
    [carousel, picker].forEach(element => {
        element.addEventListener('keydown', event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const forward = event.key === 'ArrowRight' ? 1 : -1;
            moveBy(isRtl() ? -forward : forward);
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

    $('#footer-year').textContent = String(new Date().getFullYear());
    renderTools();
    renderBand();
    startLoader();
    applyLanguage();
    loadInfo();
    startReveal();
    startCursor();
    startParallax();
}());
