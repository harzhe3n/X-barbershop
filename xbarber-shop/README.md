# XBARBER SHOP

A professional offline desktop application for barber shops with POS, appointment scheduling, and inventory management capabilities.

The same app can also be published as a static, installable PWA. The PWA keeps its own SQLite database in the browser's IndexedDB and does not need a continuously running server.

## Features

- **Offline Operation**: Works completely offline with local SQLite database
- **POS System**: Fast cashier with service and product ordering
- **Sales History**: Review completed cashier orders with their items, barber, payment method, and total
- **Sales Overview**: Compare product sales, service sales, and combined sales for today and all time
- **Print**: Preview appointment lists by day, week, or month and save them as PDFs with customer names and phone numbers
- **History Cleanup**: Clear sales and completed past visits while preserving upcoming appointments
- **Appointment Scheduling**: Complete scheduling system with status tracking
- **Inventory Management**: Real-time stock updates and low-stock warnings
- **Customer Management**: Customer profiles with history tracking
- **Barber Management**: Manage barbers, assign customers to multiple barbers, and attribute cashier orders to a barber
- **Reports & Analytics**: Detailed business reports with charts
- **Backup & Restore**: Database backup and restore functionality

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

The PWA is a static website. Netlify serves the initial install and app updates; after the first successful online visit, the service worker caches the application shell and SQLite runtime. Product, category, appointment, order, payment, sales, and settings records are stored on that device in IndexedDB. Cashier orders and their stock/payment changes are committed as one SQLite transaction.

1. On the project computer, run `npm install` if dependencies are not installed, then build the static site:
   ```sh
   npm run build:pwa
   ```
2. Open Netlify Drop at [https://app.netlify.com/drop](https://app.netlify.com/drop) and upload the complete `dist/pwa` folder. Netlify will provide an HTTPS site URL. Do not upload the project root or `node_modules`.
3. On the iPhone or iPad, open that HTTPS URL in **Safari** while online. Wait for the bottom status badge to say **“Online · offline files ready”** before going offline.
4. In Safari, tap **Share → Add to Home Screen**, then launch XBARBER SHOP from its new Home Screen icon.
5. To make a backup, use **Settings → Backup DB** and keep the downloaded `.db` file somewhere safe. To restore, use **Settings → Restore DB** and choose that file.

The site must be opened from HTTPS (Netlify provides this) or localhost. Service workers do not work from `file://` URLs. The PWA database is separate on each browser/device and is not synchronized with the Electron/PC database or other iPads. Export a backup on one device and restore it on another to move records. The existing Electron and Node web-server modes remain available separately.

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
│       ├── app.js       # Main application logic
│       ├── web-api.js   # Browser API client for the local server
│       ├── dashboard.js # Dashboard functionality
│       ├── schedule.js  # Schedule management
│       ├── cashier.js   # POS functionality
│       ├── customers.js # Customer management
│       ├── services.js  # Service management
│       ├── products.js  # Product management
│       ├── reports.js   # Reports functionality
│       └── settings.js  # Settings management
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

### Core Features

- **Dashboard**: Shows today's statistics and schedule
- **Schedule**: Create, edit, and manage appointments
- **Cashier**: Process orders with services and products
- **Customers**: Manage customer profiles and history
- **Services**: Add/edit/delete services
- **Products**: Manage inventory and products
- **Reports**: Generate business reports
- **Settings**: Configure application settings and backup

## Security

- All data stored locally in SQLite database
- No internet required for operation
- Database encryption available (not implemented by default)
- Secure IPC communication using Electron's context isolation
- The local web server requires a login, limits failed login attempts, and only accepts private/local network addresses
- Never expose the local web server port to the internet

## Backup & Restore

1. Go to Settings → Database
2. Click "BACKUP DATABASE" to create a backup
3. In the desktop app, choose a destination file
4. In the web app, the backup is saved automatically in `%APPDATA%\xbarber-shop\backups`
5. To restore, click "RESTORE DATABASE" and enter a full path or a backup file name from the backups folder

## Support

For support or feature requests, please contact the development team.

---

*This application is designed for offline use in barber shops and salons where internet connectivity may be unreliable.*