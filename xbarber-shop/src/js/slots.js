'use strict';

/*
 * Time slots, shared by the cashier (browser) and the booking website server (Node).
 * Both must give exactly the same free times, so this file is the only place they are worked out.
 *
 * Settings live in app_options:
 *   booking.open / booking.close   opening hours, "HH:MM" (close "00:00" = midnight)
 *   booking.slot                   time between clients for barbers who have not chosen their own
 *   booking.closed                 closed weekdays, "5" or "5,6" (0 = Sunday … 6 = Saturday)
 *   booking.days                   how many days ahead the website takes bookings (0 = today only)
 *   slot.barber.<id>               a barber's own time between clients, in minutes
 *   extra.<id>.<YYYY-MM-DD>        slots a barber added by hand, "HH:MM,HH:MM"
 *   off.<id>.<YYYY-MM-DD> = 1      the barber is not at work that day
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.XSlots = api;
}(typeof self !== 'undefined' ? self : this, function () {
    const DEFAULTS = { open: '10:00', close: '00:00', slot: 30, days: 14 };
    const DAY = 24 * 60;

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function clampInt(value, min, max, fallback) {
        // An empty value is "not set", not 0.
        if (value == null || String(value).trim() === '') return fallback;
        const number = Math.round(Number(value));
        return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
    }

    function isValidTime(value) {
        return /^\d{2}:\d{2}(:\d{2})?$/.test(String(value || ''));
    }

    function parseWeekdays(value) {
        return [...new Set(String(value || '').split(',').filter(Boolean).map(Number))]
            .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
            .sort();
    }

    function toMinutes(time) {
        const match = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }

    function fromMinutes(minutes) {
        return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
    }

    // Closing at 00:00 means midnight.
    function closingMinutes(time) {
        const minutes = toMinutes(time);
        return minutes === 0 ? DAY : minutes;
    }

    function weekday(date) {
        const [year, month, day] = String(date).split('-').map(Number);
        return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).getUTCDay();
    }

    function addDays(date, amount) {
        const [year, month, day] = String(date).split('-').map(Number);
        const value = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + amount));
        return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    }

    // Opening hours and the shop's default time between clients.
    function shopHours(options = {}) {
        let open = isValidTime(options.open) ? String(options.open).slice(0, 5) : DEFAULTS.open;
        let close = isValidTime(options.close) ? String(options.close).slice(0, 5) : DEFAULTS.close;
        if (closingMinutes(close) <= toMinutes(open)) {
            open = DEFAULTS.open;
            close = DEFAULTS.close;
        }
        return {
            open,
            close,
            slot: clampInt(options.slot, 5, 240, DEFAULTS.slot),
            closed: parseWeekdays(options.closed),
            days: clampInt(options.days, 0, 60, DEFAULTS.days)
        };
    }

    // Start times (in minutes) of every regular slot. The last slot ends by closing time.
    function slotGrid(hours, step = hours.slot) {
        const start = toMinutes(hours.open);
        const end = closingMinutes(hours.close);
        const list = [];
        for (let minutes = start; minutes + step <= end && list.length < 300; minutes += step) list.push(minutes);
        return list;
    }

    // Each barber's own time between clients: "slot.barber.<id>".
    function parseBarberSlots(rows) {
        const map = new Map();
        rows.forEach(row => {
            const match = /^slot\.barber\.(\d+)$/.exec(String(row.key));
            const minutes = clampInt(row.value, 5, 240, null);
            if (match && minutes != null) map.set(Number(match[1]), minutes);
        });
        return map;
    }

    // A barber who has not chosen yet uses the shop's default.
    function barberStep(hours, barberSlots, barberId) {
        return barberSlots.get(Number(barberId)) ?? hours.slot;
    }

    function extraKey(barberId, date) {
        return `extra.${Number(barberId)}.${date}`;
    }

    function offKey(barberId, date) {
        return `off.${Number(barberId)}.${date}`;
    }

    // Regular slots a barber deleted on one day: "skip.<barber id>.<date>" = "HH:MM,HH:MM".
    function skipKey(barberId, date) {
        return `skip.${Number(barberId)}.${date}`;
    }

    // Deleted regular slots: "<barber id>|<date>" -> sorted minutes.
    function parseSkippedSlots(rows) {
        const map = new Map();
        rows.forEach(row => {
            const match = /^skip\.(\d+)\.(\d{4}-\d{2}-\d{2})$/.exec(String(row.key));
            if (!match) return;
            const minutes = [...new Set(String(row.value || '').split(',').map(toMinutes).filter(value => value != null))]
                .sort((a, b) => a - b);
            if (minutes.length) map.set(`${Number(match[1])}|${match[2]}`, minutes);
        });
        return map;
    }

    // Slots added by hand: "<barber id>|<date>" -> sorted minutes.
    function parseExtraSlots(rows) {
        const map = new Map();
        rows.forEach(row => {
            const match = /^extra\.(\d+)\.(\d{4}-\d{2}-\d{2})$/.exec(String(row.key));
            if (!match) return;
            const minutes = [...new Set(String(row.value || '').split(',').map(toMinutes).filter(value => value != null))]
                .sort((a, b) => a - b);
            if (minutes.length) map.set(`${Number(match[1])}|${match[2]}`, minutes);
        });
        return map;
    }

    // Days a barber is not at work: a set of "<barber id>|<date>".
    function parseOffDays(rows) {
        const set = new Set();
        rows.forEach(row => {
            const match = /^off\.(\d+)\.(\d{4}-\d{2}-\d{2})$/.exec(String(row.key));
            if (match && String(row.value) === '1') set.add(`${Number(match[1])}|${match[2]}`);
        });
        return set;
    }

    // The barber's slots for a day: the regular ones (minus the ones the barber deleted)
    // plus the ones added by hand.
    function daySlots(hours, step, extra = [], skip = []) {
        const deleted = new Set(skip);
        const regular = slotGrid(hours, step).filter(minutes => !deleted.has(minutes));
        return [...new Set([...regular, ...extra])].sort((a, b) => a - b);
    }

    // A slot is taken when a client's time is inside it (from its start up to the next slot).
    function isTaken(start, step, clientMinutes) {
        return clientMinutes.some(time => time != null && time >= start && time < start + step);
    }

    /*
     * One barber on one day, for the website: which slots are free and which are taken.
     * Slots that are already over (today) are left out of both lists.
     */
    function barberDay({ hours, step, extra = [], skip = [], off = false, clientMinutes = [], isToday = false, nowMinutes = 0, closedDay = false }) {
        if (closedDay) return { status: 'closed', free: [], taken: [] };
        if (off) return { status: 'off', free: [], taken: [] };
        const free = [];
        const taken = [];
        daySlots(hours, step, extra, skip).forEach(start => {
            if (isToday && start + step <= nowMinutes) return;
            // Today, a slot that has already started cannot be booked online any more.
            if (isTaken(start, step, clientMinutes)) taken.push(start);
            else if (!(isToday && start <= nowMinutes)) free.push(start);
        });
        return { status: 'open', free, taken };
    }

    return {
        DEFAULTS,
        pad,
        clampInt,
        isValidTime,
        parseWeekdays,
        toMinutes,
        fromMinutes,
        closingMinutes,
        weekday,
        addDays,
        shopHours,
        slotGrid,
        parseBarberSlots,
        barberStep,
        extraKey,
        offKey,
        skipKey,
        parseExtraSlots,
        parseSkippedSlots,
        parseOffDays,
        daySlots,
        isTaken,
        barberDay
    };
}));
