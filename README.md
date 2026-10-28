# Better Tracker

Training, body composition, nutrition, and weekly load in a local-first desktop app.

Current version: **0.9.2**.

[Leer en español](README.es.md)

## Platforms

Better Tracker is built and published for Linux, Windows and Android.

| System | Artifacts | Built-in updates |
| --- | --- | --- |
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` | AppImage only. `.deb` and `.rpm` are updated by installing the new package. |
| Windows 10/11 x64 | NSIS `.exe` (per-user install), `.msi` | NSIS. |
| Android (arm64) | Signed `.apk` | The app downloads and verifies the APK, saves it to `Downloads/BetterTracker`, and the user installs it manually. |

On Linux the app uses GTK/WebKit and runs natively on Wayland. If a proprietary driver causes rendering issues, start it with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.

## Features

### Panel

- Daily overview with current weight, BMI, estimated body-fat percentage, and weekly training volume.
- Quick weight logging plus a full measurement form without leaving the dashboard.
- Body-composition summary, macro targets, water target, and fiber target.
- Water banner with quick-add buttons (+250 ml, +500 ml, +1 L) that save the day's total to the intake log immediately.
- Dual-satiety model: gastric pressure from food volume and biochemical fullness from protein, fiber, and meal composition.
- Fat-loss trend based on saved measurements, independent of the scale.
- Weekly training summary with a muscle heatmap and the most-loaded zone.
- Overtraining alerts by muscle zone, comparing weekly sets and minutes with reasonable ranges.
- Local reminders while the app is open.

### Training

- Exercise library with muscle zones and instructions, plus custom exercises stored in the local vault.
- Reusable routines with ordered exercises, target sets and reps, and notes.
- Weekly plan to assign routines to days and keep the schedule visible.
- Mesocycles with duration, goal, and weekly progression.
- Live workout session with sets, reps, weight, RPE, rest timer, and elapsed duration.
- Automatic personal-record detection when a set beats the previous best weight for an exercise.
- Session calendar, recent sessions, weekly load, and per-exercise performance.
- Muscle heatmap, load alerts, training by zone, personal records, and zone progress.
- Exercise and training history designed to work with the append-only vault.

### History

- Complete session log with date, routine, duration, RPE, and every set.
- Workout and personal-record views with filters.
- Visible deletion of individual records or the full history, implemented as new vault events rather than destructive rewrites.

### Body

- Adaptive silhouette whose shape follows the saved circumferences; nodes can be dragged to preview changes.
- Measurements for weight, height, age, sex, neck, chest, waist, hip, arm, thigh, calf, and wrist.
- Body-fat estimates from RFM, US Navy, Deurenberg, and CUN-BAE, with the available methods shown separately and averaged.
- BMI, waist-to-hip ratio, waist-to-height ratio, fat mass, and lean mass.
- BMR estimates using Mifflin-St Jeor, Katch-McArdle, and Cunningham when the required data is available.
- Estimated TDEE and fat-loss trend. Body-fat percentage and waist can be tracked with measurements alone, without a scale; fat mass in kilograms appears when weight is also available.

### Nutrition

- Local food database with more than 200 common foods across 16 categories.
- Accent-insensitive search, category filters, and meal slots for breakfast, lunch, dinner, and snacks.
- Custom foods saved to the vault and available in later sessions.
- Quantities in grams, milliliters, units, cups, tablespoons, teaspoons, portions, slices, glasses, cans, bottles, fillets, and handfuls.
- Dynamic calculation of calories, protein, carbohydrates, fat, and fiber from the selected quantity and unit.
- Ephemeral daily meal draft: it is cleared when the day changes and never becomes permanent history by itself.
- One saved nutrition log per date. Saving again on the same day updates that day's log deterministically while preserving the append-only event history.
- Optional manual adjustment of macros, plus water intake and the dual-satiety indicators.
- Approximate nutritional values intended for estimation, not medical or dietary prescription.

## Data and privacy

- No accounts, cloud dependency, telemetry, or LAN/P2P synchronization.
- The vault is a folder you choose. All app data lives in `<vault>/omega`, and events are stored as append-only JSONL per device (`omega/devices/<id>/events.jsonl`).
- On Android the vault is selected with the system folder picker (SAF) and the read/write permission is kept across restarts.
- The app creates one identical copy of `omega` per day in `<vault>/Longlife/<YYYY-MM-DD>` and keeps the 7 most recent copies. `Longlife` is never read automatically; to restore, move a copy's contents into `omega` yourself.
- Settings includes a high-risk action to delete every `Longlife` backup. It asks for confirmation, cannot be undone, and the daily backup is not recreated until the next day.
- There is no encryption. Photos and files are not stored; pasted content is limited to plain text.
- The only network connections are the **manual** update check and the optional Open Food Facts barcode lookup. They do not run in the background.
- Desktop updates are signed with minisign and verified before installation. Android downloads a release APK with a published SHA-256 hash, verifies it, and saves it to Downloads for manual installation.
- Because the format is append-only JSONL, the data remains readable and portable without the app.

## Build

Requirements: Node 22, stable Rust, and the Tauri 2 dependencies for your system.

```bash
npm ci
npm run build            # TypeScript + Vite
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build      # package for the current platform
```

For development: `npm run tauri dev`.

The version lives in `VERSION`. After changing it:

```bash
node scripts/sync-version.mjs
```

The release workflow builds Linux, Windows and Android, signs the updater artifacts and the APK, generates `latest.json` with the `android-aarch64` entry (URL, size, SHA-256), `release-manifest.json`, and `SHA256SUMS.txt`, and publishes the release. See [docs/VERSIONING.md](docs/VERSIONING.md) and [docs/RELEASE_SECRETS.md](docs/RELEASE_SECRETS.md).

## Verification

- `npm test` runs unit tests for metrics, food calculations, custom foods, and the daily meal draft.
- `npx tsc --noEmit` checks TypeScript types.
- `cargo test`, `cargo clippy`, and the CI workflow check Rust.
- The release workflow verifies each platform's artifacts and requires the updater signatures before publishing.

## Known limitations

- The vault is not encrypted.
- Windows code signing is optional and no certificate is included in the repository. Without it, installers are published unsigned at the OS level, although updater artifacts remain signed.
- Windows builds are verified in GitHub Actions; Linux is verified locally and in CI.
- Body-composition and training-load estimates are orientative, not medical diagnosis.
- The bundled food database uses approximate values per 100 g/ml and is meant for estimation. It does not replace labels, official tables, or professional advice.

## License

MIT. See [LICENSE](LICENSE).
