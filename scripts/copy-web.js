// Copy web/ into android/app/src/main/assets/public/ after a native build step,
// or just keep web/ as the single source of truth. Capacitor's `sync` already
// copies web/ -> native assets, so this script is a convenience for manual use.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "web");
const dest = path.join(__dirname, "..", "android", "app", "src", "main", "assets", "public");
if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}
fs.cpSync(src, dest, { recursive: true });
console.log("Copied web/ ->", dest);
