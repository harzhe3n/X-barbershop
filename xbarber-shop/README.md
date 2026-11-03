# XBARBER SHOP

A professional offline desktop application for barber shops with POS, appointment scheduling, and inventory management capabilities.

The same app can also be published as a static, installable PWA. The PWA keeps its own SQLite database in the browser's IndexedDB and does not need a continuously running server.

## Features

- **Cashier board with time slots**: Every barber has a column with one time slot every 10, 20 or 30 minutes (or any other number), from opening to closing, in time order. Tap a free time and a small form opens right there (no pop-up): name, phone, service and, for the admin, the money received. All of them are optional. Tap **Done** when the client is finished, then confirm **Yes, done**.
- **Money received**: When the admin types the money received, only that money is counted, not the service price. Without it, the service price counts.
- **Client status at a glance**: Waiting (amber), With barber (black card, after **Start**), Done (green row in its slot). Payments can be undone.
- **Product cashier**: The **Products** page sells products on their own, without a client name. Tap products, then **Done** and confirm. Stock goes down, and the page shows what was sold today.
- **Dashboard**: Clients finished, total money (services + products), services only, and products only (including the product cashier), for today, the last 7 days, this month, or all time. Also shows money by barber and best-selling services and products.
- **History**: One column per barber with the money they earned and how many clients they finished, plus each finished client, and a **Product sales** column. Printable. Finished clients can be edited or moved back to the cashier after entering the history password. **Delete** always asks for the password.
- **Barber sign-ins**: The admin creates a sign-in for each barber on the Barbers page. A barber sees only Cashier and History and can change only their own clients. The admin can change everything.
- **Online booking (prepared)**: When the booking website (xoshawi.com) is ready, turn it on in Settings. The cashier sends the website its free time slots, and customers' bookings appear by themselves in the chosen barber's column at the chosen time, marked "Online". See [docs/ONLINE-BOOKING.md](docs/ONLINE-BOOKING.md).
- **Catalog**: Services with prices, and products with photos, prices, stock, and categories.
- **Barbers**: Adding a barber adds a column to Cashier and History. Removing a barber keeps their history.
- **Three languages**: English, Arabic (العربية), and Kurdish Sorani (کوردی), with right-to-left layout for Arabic and Kurdish.
- **Offline operation**: Works completely offline with a local SQLite database.
- **Backup & restore**: Database backup and restore from Settings.

## Technology Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js with Electron framework
- **Database**: SQLite (local storage)
- **Build Tool**: Electron-builder for creating Windows .exe

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

### Running as a Local Web App (iPad / Tablet)

This runs the app on your PC and serves it only on your local Wi-Fi network. No internet connection or online database is used.

1. Start the server on the PC:
   - Double-click `Start-XBarber-Web.bat`, or
   - Run `npm run web`
2. If Windows Firewall asks for permission, allow Node.js on **Private networks**.
3. The terminal shows an address such as `http://192.168.1.25:3000`.
4. Connect the iPad to the same Wi-Fi and open that address in Safari.
5. Log in with `admin` / `admin123`.

Notes:

- Keep the server window open while using the app.
- The web version uses the same local database as the desktop app: `%APPDATA%\xbarber-shop\xbarber.db`.
- Database backups are stored in `%APPDATA%\xbarber-shop\backups`.
- The server only accepts connections from private/local network addresses, not from public internet connections.
- Do not forward this port on your router or expose it to the internet. It is meant for the shop's own network only.
- To stop the server, press `Ctrl+C` or close the terminal window.

### Offline PWA for iPhone and iPad (Netlify)

The PWA is a static website. Netlify serves the initial install and app updates; after the first successful online visit, the service worker caches the application shell and SQLite runtime. Product, category, appointment, order, payment, sales, and settings records are stored on that device in IndexedDB. Cashier orders and their stock/payment changes are committed as one SQLite transaction. Prices and sales are displayed in Iraqi dinars (IQD); existing numeric amounts are not converted.

1. On the project computer, run `npm install` if dependencies are not installed, then build the static site:
   ```sh
   npm run build:pwa
   ```
2. Open Netlify Drop at [https://app.netlify.com/drop](https://app.netlify.com/drop) and upload the complete `dist/pwa` folder. Netlify will provide an HTTPS site URL. Do not upload the project root or `node_modules`.
3. On the iPhone or iPad, open that HTTPS URL in **Safari** while online. Wait for the status badge on the sign-in screen to say **“Online · works offline”** before going offline.
4. In Safari, tap **Share → Add to Home Screen**, then launch XBARBER SHOP from its new Home Screen icon.
5. To make a backup, use **Settings → Download backup** and keep the downloaded `.db` file somewhere safe. To restore, use **Settings → Restore backup** and choose that file.

The site must be opened from HTTPS (Netlify provides this) or localhost. Service workers do not work from `file://` URLs. The PWA database is separate on each browser/device and is not synchronized with the Electron/PC database or other iPads. Export a backup on one device and restore it on another to move records. Barber sign-ins and the online booking connection live in the same database, so set them up on the shop's main device; barbers sign in on that device. The existing Electron and Node web-server modes remain available separately.

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
├── server.js            # Local web server (LAN + SQLite API)
├── manifest.json        # Installable PWA metadata
├── sw.js                # Offline app-shell cache
├── precache-manifest.json
├── vendor/              # Local SQLite WebAssembly runtime
├── scripts/build-pwa.js # Builds the static Netlify site
├── Start-XBarber-Web.bat
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
│       ├── app.js       # All pages: cashier, products, dashboard, history, catalog, barbers, settings
│       └── web-api.js   # Browser database (offline) or local server client
│
├── docs/
│   └── ONLINE-BOOKING.md # API the booking website (xoshawi.com) provides
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

1. Open the application
2. Default login credentials:
   - Username: `admin`
   - Password: `admin123`
3. Barbers sign in with the username and password the admin created for them on the **Barbers** page (**Create sign-in**).

### Who can do what

| | Admin | Barber |
|---|---|---|
| Pages | All | Cashier and History |
| Cashier | Every column; types the money received; sets the time between clients | Sees every column; adds, starts, edits and finishes only their own clients; can take a client from "Any barber". No money field: the service price counts |
| Products (product cashier) | Yes | No |
| History | Every barber, plus product sales | Only their own column |
| Finished clients | Edit, undo payment, delete (with the history password) | The same, for their own clients only |
| Catalog, Barbers, Settings, backups | Yes | No |

### Password for finished clients

Editing a finished (paid) client or undoing a payment asks for the history password (default `Xx2727Xx`). After it is entered, editing stays unlocked for 5 minutes, or until **Lock** is tapped in History. **Deleting** a finished client or a product sale, and **Clear history** in Settings, ask for the password every time. The admin changes this password in **Settings → Password for finished clients**. Edits update the payment, product stock (only the difference) and the client's totals.

### Getting started

1. **Barbers**: add each barber. Each one gets a column in Cashier and History.
2. **Catalog**: add your services (name and price) and products (photo, price, stock).
3. **Settings → Working hours and time slots**: set opening and closing times, the time between clients and closed days. The time between clients can also be changed at the top of the Cashier page (10, 20, 30 or **Other**).
4. **Cashier**: tap a free time in a barber's column. Type the name and phone (optional), choose the service (optional) and, as admin, the money received (optional). Tap **Add client**.
5. When the client sits down, tap **Start** (optional). When they are done, tap **Done**, check the money and Cash or Card, then **Yes, done**.
6. **Products**: sell products without a client. Tap the products, then **Done** and **Yes, sold**.
7. **Dashboard** and **History** update right away.

Free times that are already over are hidden; **Show earlier free times** shows them again. Online bookings for an unknown barber go to an **Any barber** column; tapping **Start** asks which barber takes them.

### How data is stored

Each client visit is a row in `orders` with status `waiting`, `in-service`, or `completed`, at a date and time (its slot). Its services (and products, on older visits) are rows in `order_items`. The order total is the money counted: the money the admin typed if there is one, otherwise the service prices. Upcoming appointments from the previous design are moved onto the cashier board automatically the first time you sign in.

These tables were added; existing tables and data are unchanged, and older databases get the new tables automatically when the app opens them:

- `barber_accounts`: barber sign-ins (passwords are stored as salted SHA-256 hashes)
- `app_options`: settings such as the history password, working hours, time between clients and online booking
- `online_bookings`: bookings received from the website and the status last reported back
- `product_sales` and `product_sale_items`: products sold at the product cashier, without a client

## Security

- All data stored locally in SQLite database
- No internet required for operation
- Database encryption available (not implemented by default)
- Secure IPC communication using Electron's context isolation
- The local web server requires a login, limits failed login attempts, and only accepts private/local network addresses
- On the local servers, only the admin can back up, restore, clear history, change barber sign-ins or change product sales
- Barber limits and the history password are checked by the app. In the offline PWA all data lives on the device, so someone with full access to that device and technical skills could get around them. Use a device passcode on shop devices
- Never expose the local web server port to the internet

## Backup & Restore

1. Go to **Settings → Backup & restore**
2. Click **Download backup**
3. In the desktop app, enter a destination file path
4. In the local web server mode, the backup is saved automatically in `%APPDATA%\xbarber-shop\backups`; in the offline PWA it downloads as a `.db` file
5. To restore, click **Restore backup** and choose the file (PWA) or enter a full path or a backup file name from the backups folder

## Support

For support or feature requests, please contact the development team.

---

*This application is designed for offline use in barber shops and salons where internet connectivity may be unreliable.*