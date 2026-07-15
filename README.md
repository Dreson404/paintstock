# Paint Stock 🪣

A **native Android app** to track leftover paint tins and **scan a tin with the camera**
so AI fills in the brand / type / colour — you only type **how many litres**.

- **Native Android** (built with Capacitor — real `.apk`, not a website).
- **Offline-first, per-device stock.** No server, no account. Your data stays on the phone.
- **📷 Scan tin:** photo → OpenAI vision (`gpt-4o-mini`) reads brand/type/colour/code/finish/swatch →
  pre-fills the form → you add litres → Save.
- **Look up stock** when pricing a job; **job calculator** estimates if you own enough paint.
- **Backup/restore** via JSON/CSV (move stock between phones).

---

## How the AI scan works
1. Tap **📷 Scan** → camera opens.
2. Point at the label → **Capture**.
3. The photo (base64) is sent to OpenAI **vision** with your key. Nothing else leaves the phone.
4. The form fills in brand, type, colour name/code, finish and a swatch colour.
   **Only the litres field is left blank** — you type it and hit Save.
5. No key? You can still add tins manually, and set the key later in ⚙ Settings.

> Your OpenAI key is stored privately on the device (Android Keystore via Capacitor
> Preferences, or `localStorage` in the browser). It is **never** hardcoded and is
> sent **only** to `api.openai.com` when you tap Capture.

---

## Build the APK (no PC needed — GitHub Actions)

You don't need Android Studio or Java on your machine. GitHub builds a **signed** APK for free.

### One-time setup
1. Create a GitHub repo and push this folder.
2. On a machine **with Java** (or GitHub Codespaces), run:
   ```bash
   ./make-keystore.sh
   ```
   It prints a long base64 string — that's your keystore.
3. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `KEYSTORE_BASE64` = the base64 from step 2
   - `KEY_ALIAS` = `paintstock`
   - `KEYSTORE_PASSWORD` = the keystore password you entered
   - `KEY_PASSWORD` = the key password you entered

### Build
- Go to **Actions → "Build signed APK" → Run workflow**.
- When it finishes, download the **paintstock-release-apk** artifact → `app-release.apk`.

### Install on your phone
- Copy `app-release.apk` to the phone, open it, allow "Install unknown apps", and install.
- Because it's a **signed release** APK (not from Play Store), Android shows a one-time
  "unknown source" prompt — that's normal for sideloading.

> To publish on the Play Store instead, use the same keystore and follow Google's
> "Play App Signing" steps; the workflow already produces a release-ready APK.

---

## Build locally (optional)
```bash
npm install
npx cap sync android      # copies web/ into the native project
# then either:
npx cap open android      # opens Android Studio (needs JDK + Android SDK)
# or just run the web app for dev:
python3 -m http.server 8080   # open http://localhost:8080
```

### Run the tests
```bash
npm install
NODE_PATH=./node_modules node test_smoke.js   # 22 checks (mock camera + mock OpenAI)
```

---

## Project layout
```
web/                 the app (HTML/CSS/JS) — single source of truth
  index.html         UI: tabs, scan modal, settings, edit form
  app.js             all logic: stock, scan->OpenAI, calc, backup
  styles.css         dark theme
  manifest.webmanifest / icon-*.png
scripts/copy-web.js  helper to copy web/ into native assets
android/             generated native Android project (Capacitor)
.github/workflows/   builds the signed APK in CI
make-keystore.sh     one-time signing key generator
test_smoke.js        headless verification
```

*Made for Dre @ CMN. Stock stays on the device; the AI key is yours and stays on the device.*
