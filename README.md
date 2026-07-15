# Paint Stock 🪣

A free, offline-first Android app (PWA) to track leftover paint tins by
**brand · type · colour · finish · litres**, and look stock up when pricing a job.

- **No server, no account.** Stock is saved on each device (phone/tablet).
- **Installs like a native app** via "Add to Home Screen" — full screen, works offline.
- **Job calculator:** enter wall area (m²) + coats → see if matching stock covers it.
- **Backup / restore:** export & import JSON or CSV (move stock between phones).

## Files in this folder (these are the whole app)
```
index.html        app shell
styles.css        dark theme
app.js            all logic (add/search/filter/calc/backup) — stored in localStorage
manifest.webmanifest  PWA metadata
sw.js             service worker (offline + install)
icon-192.png, icon-512.png   app icons
gen_icons.py      icon generator (optional, you don't need to ship this)
test_smoke.js     headless test (optional; requires `npm i jsdom`)
```
You only need to upload the first **8 files** (everything except `gen_icons.py`,
`test_smoke.js`, `node_modules/`, `package-lock.json`) to host it.

---

## 1. Host it for free (this is the "download website")

### Option A — Netlify Drop (fastest, ~30 seconds)
1. Go to **https://app.netlify.com/drop**
2. Drag the whole `paintstock` folder onto the page.
3. You get a free HTTPS URL like `https://brave-paint-123.netlify.app`.
   Open it on your phone → Add to Home Screen → done.

### Option B — GitHub Pages (permanent, your own domain later)
1. On GitHub, create a new repo (e.g. `paintstock`).
2. Upload these 8 files to the repo.
3. Repo **Settings → Pages →** source `main` branch, root folder → Save.
4. Your app lives at `https://<you>.github.io/paintstock/`.

(Cloudflare Pages "drag & drop" is the same idea as Option A.)

> The PWA install button only works over **HTTPS** — that's why it must be hosted,
> not opened as a `file://` from a USB stick.

---

## 2. Install on Android (no Play Store needed)
1. Open the hosted URL in **Chrome**.
2. Tap the **⋮ menu → "Install app"** (or "Add to Home Screen").
3. It appears as **Paint Stock** on your home screen — tap to open like any app.
   Works fully offline after first load.

To add it on someone else's phone, just send them the link.

---

## 3. How it's used day-to-day
- **+ Add** a tin: brand, type, colour name + code, a swatch hex, finish, litres, notes.
- **Search** any text (colour, type, brand) and filter/sort to find stock fast.
- **Job calc** tab: enter the area you're quoting → see if you already own enough paint.
- **Backup** tab: export before wiping the phone; import on a new device.

---

## 4. Running locally for development
```bash
cd paintstock
python3 -m http.server 8080   # then open http://localhost:8080
# run the smoke test (needs jsdom):
npm i jsdom && node test_smoke.js
```

## 5. Want a real .apk (for side-loading / Play Store)?
Wrap it with Apache Cordova or Capacitor in one command:
```bash
npm i -g @capacitor/cli
npx cap init paintstock com.yourname.paintstock
npx cap add android && npx cap build android
```
Say the word and I'll generate the full Capacitor project + signed-build steps.

---

*Made for Dre @ CMN. Stock stays on the device; nothing leaves the phone.*
