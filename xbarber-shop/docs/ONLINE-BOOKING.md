# Online booking: connecting xoshawi.com to the cashier

This document is for whoever builds the booking website. The cashier app is already prepared. The website only needs **one API endpoint**.

## How it works

Customers open xoshawi.com, choose a barber and a free time, and send their **name, phone number and the chosen time**. The website saves the booking. The cashier app picks it up on its own and adds the customer as a **waiting client in that barber's column at the chosen date and time**, with an "Online" badge.

The cashier shows each barber's day as **time slots**, from opening to closing, one every *N* minutes. **Every barber chooses their own *N*** (10, 20, 30 or any other number), so two barbers can have different times. The website must show the **same free slots**. The cashier sends them in every sync (`slots`, below), so the website does not need to work them out.

The cashier works offline and keeps its data on the shop's device, so the website never connects to the cashier. The cashier contacts the website instead:

```
cashier app  ──POST /api/cashier/sync──►  xoshawi.com
   (every 60 seconds while online, after sign-in, when the internet comes back, and on "Check now")

request:  barbers, opening hours, free slots, taken times, status changes of earlier bookings
response: new, changed or cancelled bookings
```

If the shop is offline, bookings wait on the website and arrive when the internet is back.

## Turning it on in the cashier

In the cashier, the admin opens **Settings → Online booking (website)** and fills in:

| Field | Meaning |
|---|---|
| Receive bookings from the website | On or off. Leave it off until the website is live. |
| Website address | `https://xoshawi.com` (default). Must be `https://` on xoshawi.com or one of its subdomains. |
| Connection key | A secret the website gives the shop. It is sent as `Authorization: Bearer <key>`. |
| Book up to | How many days ahead customers may book (7, 14 or 30). |

The slots come from **Settings → Working hours and time slots** (the same values the cashier board uses):

| Field | Meaning |
|---|---|
| Opens at / Closes at | Opening hours, for example `10:00` to `22:00`. `00:00` as closing time means midnight. |
| Time between clients (default) | Minutes from one slot to the next for barbers who have not chosen their own: 10, 20, 30, or any number from 5 to 240. Each barber sets their own at the top of their column on the Cashier page. |
| Closed days | Weekdays with no bookings. |

"Check now" saves the form and syncs immediately. The status pill shows whether the last sync worked.

## The endpoint

```
POST https://xoshawi.com/api/cashier/sync
Content-Type: application/json
Authorization: Bearer <connection key>
```

The website must:

- Reject a wrong or missing key with `401`. The cashier then shows "The website did not accept the connection key".
- Answer CORS. The cashier runs in a browser on another address, or from a file in the desktop app. Use `Access-Control-Allow-Origin: *`; the key is in a header, not a cookie. Also answer the `OPTIONS` preflight with `Access-Control-Allow-Headers: Content-Type, Authorization` and `Access-Control-Allow-Methods: POST, OPTIONS`.
- Answer within 15 seconds.

### Request body (sent by the cashier)

```json
{
  "version": 1,
  "sent_at": "2026-11-03T16:20:00.000Z",
  "cursor": "c41",
  "shop": {
    "name": "XBARBER SHOP",
    "phone": "0750 000 0000",
    "address": "Erbil",
    "timezone": "Asia/Baghdad",
    "currency": "IQD"
  },
  "hours": {
    "open": "10:00",
    "close": "22:00",
    "slot_minutes": 30,
    "days_ahead": 14,
    "closed_weekdays": [5]
  },
  "barbers": [
    { "id": 1, "name": "Ahmed", "slot_minutes": 20, "days_off": [] },
    { "id": 2, "name": "Karwan", "slot_minutes": 30, "days_off": ["2026-11-05"] }
  ],
  "slots": [
    { "barber_id": 1, "date": "2026-11-03", "times": ["15:00", "15:30", "16:00", "17:00"] },
    { "barber_id": 2, "date": "2026-11-04", "times": ["10:00", "10:30", "11:30", "12:00"] }
  ],
  "busy": [
    { "barber_id": 1, "date": "2026-11-03", "time": "14:30" },
    { "barber_id": 2, "date": "2026-11-04", "time": "11:00" }
  ],
  "updates": [
    { "booking_id": "bk_1001", "status": "received", "order_id": 57 },
    { "booking_id": "bk_0990", "status": "completed", "order_id": 49 }
  ]
}
```

| Field | Meaning |
|---|---|
| `cursor` | The `cursor` the website returned last time, or `null` on the first sync. |
| `shop` | Shop details from the cashier's Settings. `timezone` is the cashier device's time zone. All dates and times in this API are local shop time. |
| `hours` | Opening hours and slot rules. `slot_minutes` is the default time between clients (5 to 240). `close` `00:00` means midnight. `closed_weekdays` uses 0 = Sunday … 6 = Saturday. |
| `barbers` | Active barbers. Show only these on the website. `id` is the barber's id in the cashier; use it in bookings. `slot_minutes` is **this barber's own** time between clients. `days_off` lists the days (from today up to `days_ahead`) the barber marked **Not at work**; take no bookings for the barber on those days. |
| `slots` | **The free times to show**, per barber and day, from today up to `days_ahead`, using each barber's own time between clients. These are exactly the free slots on the cashier board. Closed days and the barber's `days_off` are left out, and for today slots that have already started are left out. A barber or day with no free time has no entry. |
| `busy` | Times already taken in the cashier, from today up to `days_ahead`. It includes clients added at the shop (walk-ins and phone calls), and bookings that are already in the cashier. `slots` already takes these into account; `busy` is there for a website that wants to work the slots out itself. |
| `updates` | Status changes of bookings the cashier received earlier (see below). Apply them to your bookings. |

### Response body (sent by the website)

```json
{
  "cursor": "c42",
  "has_more": false,
  "bookings": [
    {
      "id": "bk_1002",
      "barber_id": 2,
      "name": "Sara",
      "phone": "0750 111 2222",
      "date": "2026-11-05",
      "time": "15:00",
      "status": "booked"
    },
    { "id": "bk_0995", "status": "cancelled" }
  ]
}
```

| Field | Meaning |
|---|---|
| `cursor` | Any string. The cashier sends it back next time, so the website only returns bookings created or changed after that point. |
| `has_more` | `true` if there are more bookings than you returned. The cashier asks again right away. Return at most 200 bookings per answer. |
| `bookings[].id` | Your booking id. It must be unique and never change. Up to 100 characters. |
| `bookings[].barber_id` | A barber `id` from the request. An unknown id or `null` puts the client in the "Any barber" column. |
| `bookings[].name`, `phone` | What the customer typed. Name up to 80 characters, phone up to 30. |
| `bookings[].date`, `time` | `YYYY-MM-DD` and `HH:MM` (24-hour, shop time). Required for `booked`. |
| `bookings[].status` | `booked` (new or changed) or `cancelled`. |

Sending the same booking again is safe. The cashier never adds a booking twice:

- **New `booked`**: added as a waiting client. If the phone number matches a saved client, that client is linked; otherwise a new client is saved.
- **Known `booked` with a different date, time or barber**: the client is moved, as long as they are still waiting.
- **`cancelled`**: the client is removed, as long as they are still waiting. If they are already with a barber or finished, the cancellation is ignored, and the next `updates` show their real status.

### Statuses the cashier reports in `updates`

| Status | Meaning |
|---|---|
| `received` | The booking is in the cashier, waiting. |
| `in-service` | The client is with the barber now. |
| `completed` | Finished and paid. |
| `cancelled` | Removed in the cashier, or cancelled by the website. |

Each change is sent once, after it happens. If a sync fails, the change is sent again next time.

## Showing free times on the website

For a barber and a day, show the `times` of the matching entry in `slots` from the latest request. Then:

1. Remove slots held by your own bookings that the cashier has not received yet (bookings with no `received` update).
2. For today, remove slots that have started since the request was sent.
3. Send bookings at one of these times, so the client lands in a free slot in the cashier.

How the cashier makes the slots, in case the website wants to check: slots run from `open` to `close`, one every `slot_minutes` minutes of that barber (`barbers[].slot_minutes`), and the last slot must end by `close`. A slot is taken when a client's time is inside it (from its start time up to the next slot).

If no sync has arrived for a while (for example 10 minutes), the shop may be offline. Keep taking bookings: they will arrive later.

## Good to know

- **One cashier device**: connect only the shop's main cashier device. The offline app keeps its data on that device, and each device has its own copy.
- **Barber ids** come from the cashier. If a barber is removed in the cashier, they disappear from `barbers`. Hide them on the website, and stop new bookings for them.
- **Security**: use HTTPS only, keep the connection key secret, and limit the number of bookings per phone number per day. The cashier only accepts website addresses on xoshawi.com.
- **Testing**: in the cashier, set the website address to the test site (any `https://…xoshawi.com` address), turn the switch on, and press "Check now". The status pill shows "Connected" or the error the website returned.
