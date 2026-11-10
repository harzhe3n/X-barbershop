# Booking website

The booking website is part of this project. `server.js` serves it at `/` and the cashier at `/cashier` of **the same address**, from the same SQLite database (one domain for both; **Staff sign-in** at the bottom of the website opens the cashier). There is no sync between them: the website reads the cashier's data directly. Setting it up on a VPS: [VPS-SETUP.md](VPS-SETUP.md).

## Files

| File | What it is |
|---|---|
| `site/index.html` | The page: loading screen, header, barber slider, black tools band, how it works, footer, booking window |
| `site/site.css` | Design (black and white, editorial), loading screen, slider, barber tool animations, phone layout |
| `site/site.js` | Texts in Kurdish (default), Arabic and English, the slideshow and the three booking steps |
| `src/js/slots.js` | How time slots are made. Used by the cashier and by the server, so both always show the same free times |
| `server.js` | The public API below, plus the cashier API |

## What the customer does

1. **Loading screen**: the two halves of the X logo slide together, then "XBARBER" appears letter by letter.
2. **Barbers**: photos in a stack (set in the cashier on the Barbers page). The barber with the most free times today stands in the middle, then the next most free, and so on; a barber who closed themselves comes last. The photos do not move by themselves: drag or swipe them, or use the arrows or the button with each barber's name. Under the photos: the name, the next free time and **Book with ...** (tapping the photo in the middle also opens booking).
   Taken times in the booking window show the name of the client who has them.
3. **Pick a time**: days from today up to "Book up to" (Settings → Booking website). Free times can be tapped; taken times are shown crossed out. Closed days and days the barber is "Not at work" cannot be picked.
4. **Your details**: name and phone number only. No sign-up.
5. **Done**: the day and time, and the shop's phone number to change or cancel.

The booking becomes a waiting client in that barber's slot, marked **Online**, and the cashier shows a message. Barbers can edit or remove their own online clients; the owner can change all of them. Removing the client frees the time on the website again.

The page is in Kurdish until the visitor picks another language (remembered on their phone). The footer shows the opening hours, address, phone, and **Instagram** and **WhatsApp** buttons. Those are set in the cashier, **Settings → Shop**. Instagram takes the page name (`@xbarber`) or a link. WhatsApp takes a phone number, where a number starting with 0 is treated as Iraqi (+964). Leave WhatsApp empty to use the shop phone; a button whose link is not set is hidden.

## Free times

They are exactly the free slots of the cashier board:

- Opening hours: Settings → Working hours (10:00 AM to midnight by default; closing at 00:00 means midnight).
  The shop can stay open past midnight: pick a closing time marked "after midnight" (for example 10:00 AM to 4:00 AM). The night then belongs to the day the shop opened: a client at 1:00 AM is on that day's board, history counts the whole night as one day, and the website shows those times under "After midnight".
- Each barber's own time between clients (10, 20, 30 minutes or any number).
- How far ahead: Settings → Booking website → **Book up to** (today only up to 60 days). Each barber can choose their own in their column (app_options `days.barber.<id>`); "Shop setting" follows the shop's.
- Slots added by hand with **Add slot** in the cashier.
- Not on closed weekdays, and not on days a barber marked **Not at work**.
- Not for a barber who is **Closed** (app_options `online.<id>` = `0`). Each barber opens or closes themselves in the cashier; the owner can change anyone's.
- A slot is taken when a client's time is inside it. Today, slots that have already started are not offered.
- "Now" and "today" use the shop's time zone (`XBARBER_TZ`, default `Asia/Baghdad`).

## Public API (no sign-in)

| Request | Answer |
|---|---|
| `GET /api/public/info` | Shop name, phone, address, Instagram and WhatsApp links, whether booking is open, today's date, opening hours, and the barbers (id, name, photo address, time between clients, next free time, today's status) |
| `GET /api/public/availability?barber=<id>` | For each day from today: `status` (`open`, `closed`, `off`), `free` times and `taken` times (`HH:MM`) |
| `GET /api/public/photo/<id>` | The barber's photo |
| `POST /api/public/book` | Body `{ barber_id, date, time, name, phone }`. Answer `{ ok: true, booking: { id, barber, date, time } }` |

`POST /api/public/book` errors (`{ "error": "<code>" }`):

| Status | Code | Meaning |
|---|---|---|
| 400 | `name`, `phone`, `slot` | Name shorter than 2 letters, phone not 7 to 15 digits, or a bad date or time |
| 403 | `closed` | Online booking is turned off (Settings → Booking website) |
| 409 | `taken` | The time is no longer free (someone else was faster, or it was removed) |
| 429 | `limit` | This phone number already has 2 upcoming online bookings |
| 429 | `busy` | More than 10 bookings from one address in an hour |

The booking is checked and saved in one database transaction, so two customers can never book the same time.

## Security

- The website pages may only load files from the same server (Content-Security-Policy).
- Customers never see other customers' names or numbers; the API only gives free and taken times.
- The cashier API needs a sign-in. A barber's account can change only that barber's clients, time between clients, added slots and days off. Sign-ins, photos, product sales, the catalog, shop settings and backups are for the owner only. The history password is checked by the server, so its hash never reaches a barber's phone.
- The owner signs in as `admin`; the password is changed in Settings → Owner sign-in (default `admin123`).
