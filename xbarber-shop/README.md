# XBARBER SHOP

Cashier, time slots, product sales and a booking website for a barber shop.

- **Online (recommended)**: on the shop's VPS, `server.js` serves the **booking website** and the **cashier** from **one address** and one database: the website at `https://your-address` and the cashier at `https://your-address/cashier` (also reached from **Staff sign-in** at the bottom of the website). The owner and every barber use it from their own phone or iPad, and website bookings appear in the cashier by themselves. Setup: [docs/VPS-SETUP.md](docs/VPS-SETUP.md). The website: [docs/WEBSITE.md](docs/WEBSITE.md).
- **Offline**: the same cashier also runs as an installable app that keeps its data on one device (no website), as a Windows desktop app, or on the shop's Wi-Fi.

## Features

- **Cashier board with time slots**: Every barber has a column of time slots from opening to closing, in time order. **Each barber chooses their own time between clients** (10, 20, 30 minutes or any other number) at the top of their column, and has an **At work / Not at work** button for the day shown. On a day off the barber has no free times and the website takes no bookings for them. **Add slot** in a barber's column shows ready-made start times (after closing, before opening, or any other time from a list, so nothing is typed). Tapping one adds the slot and opens it straight away for the client's name, phone and service. An added slot can be removed again with ×. Tap a free time and a small form opens right there (no pop-up): name, phone, service and, for the admin, the money received. All of them are optional. Tap **Done** when the client is finished, then confirm **Yes, done**.
- **Money received**: When the admin types the money received, only that money is counted, not the service price. Without it, the service price counts.
- **Client status at a glance**: Waiting (amber), With barber (black card, after **Start**), Done (green row in its slot). Payments can be undone.
- **Product cashier**: The **Products** page sells products on their own, without a client name. Tap products, then **Done** and confirm. Stock goes down, and the page shows what was sold today.
- **Expenses** (owner only): what the shop paid, such as the electricity bill or the rent. The owner types the name and the amount; the date and time are filled in and can be changed. An expense can be edited later, but changing its amount or deleting it needs the history password. History has an Expenses column and shows the money left after expenses.
- **Dashboard**: Clients finished, total money (services + products), services only, and products only (including the product cashier), for today, the last 7 days, this month, or all time. Also shows money by barber and best-selling services and products.
- **History**: One column per barber with the money they earned and how many clients they finished, plus each finished client, and a **Product sales** column. Printable. Finished clients can be edited or moved back to the cashier after entering the history password. **Delete** always asks for the password.
- **Owner and barber sign-ins**: The owner signs in as `admin` (the password can be changed in Settings → Owner sign-in) and can see and change everything. The owner creates a sign-in for each barber on the Barbers page. A barber sees only Cashier and History, changes only their own clients, and sets their own time between clients, added slots and days off.
- **Booking website**: Black and white, editorial. A long loading screen (the X logo is drawn, scissors cut a line, a counter runs to 100), then the barbers in a slider you can drag, with momentum, that never ends and moves on every 5 seconds (also arrows and a button per barber). Barber tools (scissors, razor, comb, clipper) move in the background and in a black band. Customers pick a barber, a free time and type their name and phone number. No sign-up. Instagram and WhatsApp buttons at the bottom (set in Settings → Shop). The booking appears in that barber's slot, marked "Online", and the time shows as taken on the website. Barbers can edit or remove their own online clients; the owner can change all of them. Turn bookings on or off in Settings → Booking website. See [docs/WEBSITE.md](docs/WEBSITE.md).
- **Barber photos**: Added on the Barbers page; they show on the website and in the cashier.
- **Open / Closed**: Each barber opens or closes themselves for website bookings (a card at the top of their cashier); the owner can change anyone's on the board. A closed barber is crossed out on the website and cannot be booked. The cashier itself still works for them.
- **Catalog**: Services with prices, and products with photos, prices, stock, and categories.
- **Barbers**: Adding a barber adds a column to Cashier and History. Removing a barber keeps their history.
- **Three languages**: Kurdish Sorani (کوردی, the default), Arabic (العربية) and English, with right-to-left layout for Kurdish and Arabic. Each device remembers the language picked on it.
- **Opening hours**: 10:00 AM to midnight by default (Settings → Working hours and time slots).
- **Offline operation** (offline app): works completely offline with a local SQLite database. The online cashier needs internet.
- **Backup & restore**: Download a backup file and restore one from Settings, offline and online.

## Technology Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript (cashier in `src/`, booking website in `site/`)
- **Server**: Node.js (`server.js`) with SQLite; nginx in front of it on the VPS
- **Desktop**: Electron
- **Database**: SQLite (on the server, on the device, or on the PC)

## Requirements

- Windows 10 or later
- Node.js (v16 or higher) - will be installed automatically during build process

## Installation & Setup

### Prerequisites

1. Install Node.js from [https://nodejs.org/](https://nodejs.org/)
2. Make sure you have Git installed (optional, for cloning repository)

### Running Development Version

1. Open command prompt in the project directory
2. Run `npm install` to install dependencies
3. Run `npm start` to launch the application

### Online on a VPS (booking website + cashier)

Follow [docs/VPS-SETUP.md](docs/VPS-SETUP.md): a free DuckDNS address (or your own domain), Node.js, nginx and certbot on the VPS, and `server.js` as a service. It can share the VPS with another project. Then open `https://your-address/cashier`, sign in as `admin` / `admin123` and change the password in Settings.

To try it on your PC first: run `npm run web` and open `http://localhost:3000` (website) and `http://localhost:3000/cashier` (cashier).

### Running as a Local Web App (iPad / Tablet)

This runs the app on your PC and serves it only on your local Wi-Fi network. No internet connection or online database is used.

1. Start the server on the PC:
   - Double-click `Start-XBarber-Web.bat`, or
   - Run `npm run web`
2. If Windows Firewall asks for permission, allow Node.js on **Private networks**.
3. The terminal shows an address such as `http://192.168.1.25:3000/cashier`.
4. Connect the iPad to the same Wi-Fi and open that address in Safari. (`http://192.168.1.25:3000` itself is the booking website.)
5. Log in with `admin` / `admin123`.

Notes:

- Keep the server window open while using the app.
- The web version uses the same local database as the desktop app: `%APPDATA%\xbarber-shop\xbarber.db`.
- Database backups are stored in `%APPDATA%\xbarber-shop\backups`.
- The server only accepts connections from private/local network addresses, not from public internet connections.
- Do not forward this port on your router or expose it to the internet. It is meant for the shop's own network only.
- To stop the server, press `Ctrl+C` or close the terminal window.

### Offline PWA for iPhone and iPad (Vercel or Netlify)

The PWA is a static website. Netlify serves the initial install and app updates; after the first successful online visit, the service worker caches the application shell and SQLite runtime. Product, category, appointment, order, payment, sales, and settings records are stored on that device in IndexedDB. Cashier orders and their stock/payment changes are committed as one SQLite transaction. Prices and sales are displayed in Iraqi dinars (IQD); existing numeric amounts are not converted.

1. On the project computer, run `npm install` if dependencies are not installed, then build the static site:
   ```sh
   npm run build:pwa
   ```
2. Open Netlify Drop at [https://app.netlify.com/drop](https://app.netlify.com/drop) and upload the complete `dist/pwa` folder. Netlify will provide an HTTPS site URL. Do not upload the project root or `node_modules`.
3. On the iPhone or iPad, open that HTTPS URL in **Safari** while online. Wait for the status badge on the sign-in screen to say **“Online · works offline”** before going offline.
4. In Safari, tap **Share → Add to Home Screen**, then launch XBARBER SHOP from its new Home Screen icon.
5. To make a backup, use **Settings → Download backup** and keep the downloaded `.db` file somewhere safe. To restore, use **Settings → Restore backup** and choose that file.

The site must be opened from HTTPS (Netlify provides this) or localhost. Service workers do not work from `file://` URLs. The PWA database is separate on each browser/device and is not synchronized with the Electron/PC database or other iPads. Export a backup on one device and restore it on another to move records. Barber sign-ins live in the same database, so set them up on the shop's main device; barbers sign in on that device. The booking website needs the online server instead (see [docs/VPS-SETUP.md](docs/VPS-SETUP.md)). The existing Electron and Node web-server modes remain available separately.

The existing login is retained for convenience, but a static PWA cannot keep shop records protected behind server-side authentication: the app and its login code are delivered to the device. Use a trusted device passcode and do not treat the login screen as protection for a public shared device.

### Running the Server on an iPad with a-Shell (Experimental)

This older optional setup still runs a Python server in a-Shell. The PWA method above is recommended because it does not need a terminal app or a foreground server.

1. Install **a-Shell** from the App Store.
2. On the PC, run `powershell -ExecutionPolicy Bypass -File .\Create-iPad-Package.ps1`. Move the generated ZIP to the iPad (for example with iCloud Drive), then extract it into a `xbarber-shop` folder under **On My iPad → a-Shell** in Files.
3. In a-Shell, check that its Python includes SQLite:
   ```sh
   python3 -c "import sqlite3; print(sqlite3.sqlite_version)"
   ```
4. Change to the project folder and start the server:
   ```sh
   cd ~/Documents/xbarber-shop
   python3 server_ios.py
   ```
5. In Safari on the same iPad, open `http://127.0.0.1:3000`. To make it feel like an app, tap **Share → Add to Home Screen**.

Use **Hide menu / Show menu** in the top bar to collapse or open navigation; on narrow screens the menu opens over the page, and selecting a page closes it. Keep a-Shell visible while using XBARBER SHOP. iPadOS can pause shell apps in the background, which stops the server; using Split View with a-Shell and Safari may help keep it running. The iPad database is independent from the PC database. To move existing records, create a database backup on the PC, copy the `.db` file into `ipad-data/backups` on the iPad, then use **Settings → Restore DB** and enter the backup file name. Do not expose this server to the internet.

### Creating a Desktop Shortcut

Run `Create-DesktopShortcut.ps1` from PowerShell to create a new desktop shortcut. Each run creates a uniquely named shortcut, so existing shortcuts are not overwritten.

```powershell
powershell -ExecutionPolicy Bypass -File .\Create-DesktopShortcut.ps1
```

### Building Windows .exe

1. After installing dependencies, run:
   ```
   npm run build
   ```
2. The Windows executable will be created in the `dist` folder

## Database Location

The SQLite database is stored in:
- **Windows**: `%APPDATA%\xbarber-shop\xbarber.db`

All desktop shortcuts and packaged app launches use this same database location.

## Application Structure

```
xbarber-shop/
├── package.json
├── main.js              # Electron main process
├── preload.js           # Security preload script
├── server.js            # Server: booking website, cashier and their API (VPS or shop PC)
├── server_ios.py        # Small Python server for an iPad (cashier only)
├── manifest.json        # Installable PWA metadata
├── sw.js                # Offline app-shell cache
├── precache-manifest.json
├── vendor/              # Local SQLite WebAssembly runtime
├── scripts/build-pwa.js # Builds the static Netlify site
├── Start-XBarber-Web.bat
│
├── site/                # Booking website (index.html, site.css, site.js)
├── deploy/              # VPS files: systemd service, nginx, daily backup
│
├── database/
│   └── schema.sql       # Database schema
│
├── src/
│   ├── index.html       # Main HTML file
│   ├── css/
│   │   └── style.css    # Styling
│   │
│   └── js/
│       ├── i18n.js      # English, Arabic and Kurdish text, dates and money
│       ├── auth.js      # Password hashing (barber sign-ins, history password)
│       ├── slots.js     # Time slots, shared by the cashier and the website server
│       ├── app.js       # All pages: cashier, products, dashboard, history, catalog, barbers, settings
│       └── web-api.js   # Browser database (offline) or server client (online)
│
├── docs/
│   ├── VPS-SETUP.md     # Putting the website and cashier online
│   └── WEBSITE.md       # How the booking website works, and its API
│
├── assets/
│   ├── logo/
│   │   └── logo.png     # Application logo (placeholder)
│   └── products/        # Product images directory
│
└── README.md
```

## Usage

### Login

1. Open the cashier (online: `https://your-address/cashier`)
2. The owner signs in with:
   - Username: `admin`
   - Password: `admin123` until it is changed in **Settings → Owner sign-in** (do this first)
3. Barbers sign in with the username and password the owner created for them on the **Barbers** page (**Create sign-in**).

### Who can do what

| | Owner (`admin`) | Barber |
|---|---|---|
| Pages | All | Cashier and History |
| Cashier | Every column; types the money received; can set any barber's time between clients and At work / Not at work | Sees every column; sets their own time between clients and At work / Not at work; adds, starts, edits and finishes only their own clients; can take a client from "Any barber". No money field: the service price counts |
| Products (product cashier) | Yes | No |
| History | Every barber, plus product sales | Only their own column |
| Finished clients | Edit, undo payment, delete (with the history password) | The same, for their own clients only |
| Online clients (from the website) | All | Edit or remove their own |
| Catalog, Barbers (photos, sign-ins), Settings, backups | Yes | No |

### Password for finished clients

Editing a finished (paid) client or undoing a payment asks for the history password (default `Xx2727Xx`). After it is entered, editing stays unlocked for 5 minutes, or until **Lock** is tapped in History. **Deleting** a finished client or a product sale, and **Clear history** in Settings, ask for the password every time. The admin changes this password in **Settings → Password for finished clients**. Edits update the payment, product stock (only the difference) and the client's totals.

### Getting started

1. **Barbers**: add each barber. Each one gets a column in Cashier and History.
2. **Catalog**: add your services (name and price) and products (photo, price, stock).
3. **Settings → Working hours and time slots**: set opening and closing times, closed days and **each barber's own time between clients**. Barbers can also pick their own time at the top of their column on the Cashier page (10, 20, 30 or any number in the box).
4. **Cashier**: tap a free time in a barber's column. Type the name and phone (optional), choose the service (optional) and, as admin, the money received (optional). Tap **Add client**.
5. When the client sits down, tap **Start** (optional). When they are done, tap **Done**, check the money and Cash or Card, then **Yes, done**.
6. **Products**: sell products without a client. Tap the products, then **Done** and **Yes, sold**.
7. **Dashboard** and **History** update right away.

Free times that are already over are hidden; **Show earlier free times** shows them again. Online bookings for an unknown barber go to an **Any barber** column; tapping **Start** asks which barber takes them.

### How data is stored

Each client visit is a row in `orders` with status `waiting`, `in-service`, or `completed`, at a date and time (its slot). Its services (and products, on older visits) are rows in `order_items`. The order total is the money counted: the money the admin typed if there is one, otherwise the service prices. Upcoming appointments from the previous design are moved onto the cashier board automatically the first time you sign in.

These tables were added; existing tables and data are unchanged, and older databases get the new tables automatically when the app opens them:

- `barber_accounts`: barber sign-ins (passwords are stored as salted SHA-256 hashes)
- `app_options`: settings such as the history password, working hours, each barber's time between clients (`slot.barber.<id>`), days a barber is not at work (`off.<id>.<date>`), slots added by hand (`extra.<id>.<date>`) and online booking
- `online_bookings`: bookings made on the website (name, phone, barber, time and the client they became)
- `product_sales` and `product_sale_items`: products sold at the product cashier, without a client
- `expenses`: what the shop paid (name, amount, date, time); owner only
- `barber_photos`: each barber's photo for the website (large) and the cashier (small)
- The owner's password is in `admins` (hashed, like the barber sign-ins)

## Security

- Online, the server runs behind nginx with https. The cashier needs a sign-in; failed sign-ins are limited.
- On the server, a barber's account can change only that barber's clients, time between clients, added slots and days off. Sign-ins, photos, product sales, the catalog, shop settings, hours and backups are for the owner only. The history password and the owner password are checked by the server.
- The website only shows free and taken times, never other customers' names or numbers. Bookings are limited per phone number and per address.
- Offline (data on the device), barber limits and the history password are checked by the app, so someone with full access to that device and technical skills could get around them. Use a device passcode on shop devices.
- On the shop PC, the server only accepts the local network unless `XBARBER_PUBLIC=1` is set. Never forward its port on your router; for the internet use the VPS setup.

## Backup & Restore

1. Go to **Settings → Backup & restore**
2. Click **Download backup**: online and in the offline app it downloads as a `.db` file; in the desktop app, enter a destination file path
3. To restore, click **Restore backup** and choose the file (in the desktop app, enter its path). Online, the server first keeps a copy of the current data in its `backups` folder
4. On the VPS a copy is also made every day (see [docs/VPS-SETUP.md](docs/VPS-SETUP.md))

## Support

For support or feature requests, please contact the development team.

---

*Use it online on the shop's server with the booking website, or offline on one device when the internet is unreliable.*