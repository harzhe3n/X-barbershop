# Put XBARBER online on your VPS

**One address for everything.** With a free DuckDNS name such as `xbarber.duckdns.org`:

- **https://xbarber.duckdns.org** is the booking website. Customers pick a barber and a free time, then type their name and phone number.
- **https://xbarber.duckdns.org/cashier** is the cashier, for the owner (`admin`) and every barber, on any phone, iPad or computer. Customers don't need this address: **Staff sign-in** at the bottom of the website opens it.
- Both use **one database on the VPS**. A booking appears in the cashier by itself, and every slot added in the cashier appears on the website.

It runs **next to the other project on the same VPS**. It has its own port (3100), its own nginx file, its own user and its own data folder. Nothing of the other project is changed or restarted.

The cashier now needs internet. Your data is kept on the VPS, so make backups (step 12).

You need: the VPS IP address, the **root password** (or a user with `sudo`), and Ubuntu or Debian on the VPS.

In the commands below, replace `xbarber.duckdns.org` with the name you choose in step 1.

---

## 1. Get a free address (DuckDNS)

1. Open **https://www.duckdns.org** and sign in (Google or GitHub).
2. Under **domains**, type a name, for example `xbarber`, and press **add domain**.
3. In **current ip**, type your **VPS IP address** and press **update ip**.

Check it on your computer: `ping xbarber.duckdns.org` must show your VPS IP. DuckDNS's update script is not needed: a VPS IP does not change.

When you buy your own domain, see [Your own domain](#your-own-domain-later) at the end. Nothing has to be installed again.

## 2. Sign in to the VPS

On your computer, open a terminal (on Windows: PowerShell):

```
ssh root@YOUR_VPS_IP
```

All the next commands are typed on the VPS. (Not root? Put `sudo` before each command.)

## 3. Look at what the other project uses (this changes nothing)

```
node -v
which node
ss -tlnp | grep -E ':(80|443|3100) '
ls /etc/nginx/sites-enabled
ufw status
```

| What you see | What to do |
|---|---|
| `node -v` shows **v20 or higher** | Node is ready. Skip the Node part of step 4. |
| `node: command not found` | Install Node in step 4. |
| Node **older than v20** | Stop here and send the output to your developer. A new Node could break the other project. |
| Ports **80 / 443** belong to **nginx** | Good. XBARBER adds its own file to that nginx. |
| Ports 80 / 443 belong to something else (`docker-proxy`, `apache2`, `caddy`, ...) | Stop here and send the output to your developer. |
| Nothing on 80 / 443 | Good. nginx will use them. |
| Something already on **3100** | Choose another port, for example 3101. Change `3100` to it in `deploy/xbarber.service` and `deploy/nginx-xbarber.conf` (after step 5), and in the `curl` of step 7. |

## 4. Install what is missing

```
apt update
apt install -y nginx certbot python3-certbot-nginx git sqlite3
```

Only if Node is missing (step 3):

```
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

## 5. Get the code

```
git clone https://github.com/harzhe3n/X-barbershop.git /opt/xbarber
cd /opt/xbarber/xbarber-shop
npm ci --omit=dev
```

`/opt/xbarber/xbarber-shop` must be the folder that contains `server.js`. If `npm ci` fails while building `sqlite3`: `apt install -y build-essential python3`, then run `npm ci --omit=dev` again.

## 6. Make a user and a data folder for the server

```
useradd --system --home /var/lib/xbarber --shell /usr/sbin/nologin xbarber
mkdir -p /var/lib/xbarber
chown xbarber:xbarber /var/lib/xbarber
```

## 7. Start the server, and keep it running

```
cp /opt/xbarber/xbarber-shop/deploy/xbarber.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now xbarber
systemctl status xbarber
```

The status should say **active (running)** (press `q` to leave). Check it answers:

```
curl http://127.0.0.1:3100/api/public/info
```

It restarts by itself if it stops, and after the VPS restarts.

## 8. Connect your address (nginx)

```
cp /opt/xbarber/xbarber-shop/deploy/nginx-xbarber.conf /etc/nginx/sites-available/xbarber
sed -i 's/YOUR_DOMAIN/xbarber.duckdns.org/' /etc/nginx/sites-available/xbarber
ln -s /etc/nginx/sites-available/xbarber /etc/nginx/sites-enabled/xbarber
nginx -t && systemctl reload nginx
```

`nginx -t` must say **syntax is ok** and **test is successful**. `reload` keeps the other project's site running.

Do not delete or change the other files in `/etc/nginx/sites-enabled`: they belong to the other project. If `nginx -t` shows an error, run `rm /etc/nginx/sites-enabled/xbarber` (the other project keeps working) and send the error to your developer.

## 9. Turn on https (the lock in the browser)

```
certbot --nginx --cert-name xbarber -d xbarber.duckdns.org
```

Type your email and accept. If it asks, choose to **redirect** http to https. certbot only changes the XBARBER file, and the certificate renews by itself.

## 10. Firewall

Only if `ufw status` in step 3 said **Status: active**:

```
ufw allow 'Nginx Full'
```

If it said **inactive**, leave it. Do not run `ufw enable` here: it could block the other project.

## 11. First sign-in (do it right away)

The code is public on GitHub, so anyone can know the default passwords. Change them before you share the address.

1. Open **https://xbarber.duckdns.org/cashier** and sign in with `admin` / `admin123`.
2. **Settings → Owner sign-in**: change the password now. The username stays `admin`.
3. **Settings → Password for finished clients**: change it too (the default is in the code).
4. **Settings → Shop**: name, phone, address, **Instagram** and **WhatsApp**. They show at the bottom of the website. Leave WhatsApp empty to use the shop phone.
5. **Settings → Working hours and time slots**: opening hours (10:00 AM to midnight by default), closed days, and each barber's time between clients.
6. **Barbers**: add each barber, **Add photo** (it shows big on the website), and **Create sign-in** so each barber can sign in on their own phone.
7. **Settings → WhatsApp reminders**: press **Link WhatsApp**. On the shop's phone open WhatsApp → **Linked devices** → **Link a device** and scan the QR code. From then on, every waiting client with a phone number gets a WhatsApp message 20 minutes before their time (website bookings and clients added in the cashier). The link stays after restarts and updates. Keep the shop's phone connected to the internet now and then, or WhatsApp unlinks it after about two weeks.

### Move your current data

On the iPad that has your data now (the offline app): **Settings → Download backup**. Then on the online cashier: **Settings → Restore backup** and choose that file. The server keeps a copy of what was there before, in `/var/lib/xbarber/backups`. The passwords you changed in steps 2 and 3 stay as they are.

### On the phones and iPads

Open **https://xbarber.duckdns.org/cashier** in Safari, then **Share → Add to Home Screen**. Each barber signs in with their own username.

## 12. Backups

Every day at 4:00, a copy of the database is saved on the VPS and kept for 30 days:

```
cp /opt/xbarber/xbarber-shop/deploy/backup.sh /usr/local/bin/xbarber-backup
chmod +x /usr/local/bin/xbarber-backup
echo "0 4 * * * root runuser -u xbarber -- /usr/local/bin/xbarber-backup" > /etc/cron.d/xbarber-backup
```

Also download a backup to your own computer now and then (**Settings → Download backup**). If the VPS is ever lost, that file has everything.

## 13. Updating later

When there is a new version on GitHub:

```
cd /opt/xbarber
git pull
cd xbarber-shop
npm ci --omit=dev
systemctl restart xbarber
```

Your data is in `/var/lib/xbarber` and is not touched by updates. Open the cashier again on each device (close and reopen the Home Screen app).

---

## Your own domain (later)

When you buy your domain (for example `xoshawi.com`):

1. At the domain company, open its DNS settings and add two records:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | your VPS IP address |
   | A | `www` | your VPS IP address |

   Wait until `ping xoshawi.com` shows your VPS IP (minutes to a few hours).

2. On the VPS, add the new names to the XBARBER file, then to the certificate:

   ```
   sed -i 's/server_name xbarber.duckdns.org;/server_name xoshawi.com www.xoshawi.com xbarber.duckdns.org;/' /etc/nginx/sites-available/xbarber
   nginx -t && systemctl reload nginx
   certbot --nginx --cert-name xbarber -d xoshawi.com -d www.xoshawi.com -d xbarber.duckdns.org
   ```

   If certbot asks whether to update the certificate with the new names, say yes.

3. Now **https://xoshawi.com** is the website and **https://xoshawi.com/cashier** the cashier. The DuckDNS address keeps working too. Nothing else changes: same data, same accounts.
4. On each phone and iPad, open the new address, sign in again, and add it to the Home Screen again (sign-ins are kept per address).

---

## If something is wrong

| Problem | What to do |
|---|---|
| The website does not open | `systemctl status xbarber` should be running. `nginx -t` should say ok. `ping` your address should show the VPS IP (step 1). |
| See the server's messages | `journalctl -u xbarber -n 100` (add `-f` to follow live). |
| "Today" or the free times are wrong by some hours | The time zone is in `/etc/systemd/system/xbarber.service` (`XBARBER_TZ=Asia/Baghdad`). Change it, then `systemctl daemon-reload && systemctl restart xbarber`. |
| Forgot the owner password | Restore a backup from before the change, or ask a developer to reset the `admins` row. |
| Customers cannot book | In the cashier: **Settings → Booking website** must say **Taking bookings**. |
| WhatsApp reminders stopped | **Settings → WhatsApp reminders** must say **Linked**. If not, link it again. See what happened: `journalctl -u xbarber -n 100 | grep -i whatsapp`. |
| The other project stopped working | `rm /etc/nginx/sites-enabled/xbarber && systemctl reload nginx` takes XBARBER out of nginx, then send the output of `nginx -t` to your developer. |

### Settings the server understands

They are set in `deploy/xbarber.service` (`Environment=...`).

| Setting | Meaning |
|---|---|
| `XBARBER_PORT` | Port (3100). nginx forwards to it. |
| `XBARBER_HOST` | `127.0.0.1`: only nginx can reach it. |
| `XBARBER_DATA_DIR` | Database and backups (`/var/lib/xbarber`). |
| `XBARBER_TRUST_PROXY=1` | Behind nginx: use the visitor's address and https from nginx. |
| `XBARBER_TZ` | The shop's time zone. |
| `XBARBER_PUBLIC=1` | Only without nginx: accept visitors from the internet directly. Not needed with the steps above. |
| `XBARBER_SECURE_COOKIE=1` | Always send the sign-in cookie over https only. With `XBARBER_TRUST_PROXY=1` this already happens on https. |
