#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`VERSION must be strict SemVer X.Y.Z, got "${version}"`);
}

/**
 * Android versionCode debe ser monótono entre releases. SemVer X.Y.Z no lo es
 * (0.10.0 < 0.9.0 en orden lexicográfico), así que lo derivamos con una base
 * fija: major * 1_000_000 + minor * 1_000 + patch.
 */
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

if (process.argv.includes('--print-version-code')) {
  process.stdout.write(`${versionCode}\n`);
  process.exit(0);
}

// --- package.json ---
const pkgPath = join(ROOT, 'package.json');
let pkg = readFileSync(pkgPath, 'utf8');
pkg = pkg.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`);
writeFileSync(pkgPath, pkg);

// --- tauri.conf.json ---
const tauriPath = join(ROOT, 'src-tauri', 'tauri.conf.json');
let tauri = readFileSync(tauriPath, 'utf8');
tauri = tauri.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`);
writeFileSync(tauriPath, tauri);

// --- Cargo.toml ---
const cargoPath = join(ROOT, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
// Replace only the package version (first occurrence under [package]).
cargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

// --- Cargo.lock ---
const lockPath = join(ROOT, 'src-tauri', 'Cargo.lock');
try {
  let lock = readFileSync(lockPath, 'utf8');
  lock = lock.replace(
    /(name = "better-tracker")(\r?\n)(version = ")[^"]*(")/,
    `$1$2$3${version}$4`
  );
  writeFileSync(lockPath, lock);
} catch (e) {
  // Lock may not exist yet; cargo will generate it. Not a hard failure here.
  console.warn('Cargo.lock not found; skipping (run cargo build to generate).');
}

// --- package-lock.json (root package metadata only) ---
const packageLockPath = join(ROOT, 'package-lock.json');
try {
  const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'));
  packageLock.version = version;
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = version;
  }
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);
} catch (e) {
  console.warn('package-lock.json not found; skipping (run npm install to generate).');
}

// --- Android generated files (only if `tauri android init` already ran) ---
// `src-tauri/gen/` está en .gitignore, pero CI lo genera antes de compilar. Si
// no sincronizamos estos archivos, el APK sale con el versionName/versionCode
// de la última vez que se ejecutó `tauri android init` (fue el bug de 0.8.7).
function syncFileIfPresent(path, transform) {
  try {
    const before = readFileSync(path, 'utf8');
    const after = transform(before);
    if (after !== before) writeFileSync(path, after);
    return true;
  } catch {
    return false;
  }
}

const androidPropsPath = join(ROOT, 'src-tauri', 'gen', 'android', 'app', 'tauri.properties');
const androidPropsOk = syncFileIfPresent(androidPropsPath, (text) => {
  let next = text;
  next = /tauri\.android\.versionName\s*=.*/.test(next)
    ? next.replace(/tauri\.android\.versionName\s*=.*/, `tauri.android.versionName=${version}`)
    : `${next.trimEnd()}\ntauri.android.versionName=${version}`;
  next = /tauri\.android\.versionCode\s*=.*/.test(next)
    ? next.replace(/tauri\.android\.versionCode\s*=.*/, `tauri.android.versionCode=${versionCode}`)
    : `${next.trimEnd()}\ntauri.android.versionCode=${versionCode}`;
  return next.endsWith('\n') ? next : `${next}\n`;
});

// Tauri copia la configuración completa a los assets de Android. También lleva
// la versión y se queda obsoleta si no se reescribe.
const androidConfPath = join(
  ROOT,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'assets',
  'tauri.conf.json',
);
const androidConfOk = syncFileIfPresent(androidConfPath, (text) =>
  text.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`),
);

if (androidPropsOk) {
  console.log(`OK: Android tauri.properties = ${version} (versionCode ${versionCode})`);
} else {
  console.log('Android tauri.properties no existe todavía (se sincroniza tras tauri android init).');
}
if (androidConfOk) {
  console.log(`OK: Android assets/tauri.conf.json = ${version}`);
}

function extractJsonVersion(text) {
  const m = text.match(/"version"\s*:\s*"([^"]*)"/);
  return m ? m[1] : null;
}
function extractCargoVersion(text) {
  const m = text.match(/^version\s*=\s*"([^"]*)"/m);
  return m ? m[1] : null;
}
function extractLockVersion(text) {
  const m = text.match(/name = "better-tracker"\r?\nversion = "([^"]*)"/);
  return m ? m[1] : null;
}

const checks = [
  ['package.json', extractJsonVersion(readFileSync(pkgPath, 'utf8'))],
  ['tauri.conf.json', extractJsonVersion(readFileSync(tauriPath, 'utf8'))],
  ['Cargo.toml', extractCargoVersion(readFileSync(cargoPath, 'utf8'))],
];
try {
  checks.push(['Cargo.lock', extractLockVersion(readFileSync(lockPath, 'utf8'))]);
} catch {}
try {
  const pl = JSON.parse(readFileSync(packageLockPath, 'utf8'));
  checks.push(['package-lock.json', pl.version]);
  checks.push(['package-lock.json (root)', pl.packages?.['']?.version]);
} catch {}
if (androidPropsOk) {
  const props = readFileSync(androidPropsPath, 'utf8');
  const name = props.match(/tauri\.android\.versionName\s*=\s*(.*)/)?.[1]?.trim();
  const code = Number(props.match(/tauri\.android\.versionCode\s*=\s*(.*)/)?.[1]?.trim());
  checks.push(['Android tauri.properties versionName', name]);
  checks.push(['Android tauri.properties versionCode', code === versionCode ? version : String(code)]);
}
if (androidConfOk) {
  checks.push([
    'Android assets/tauri.conf.json',
    extractJsonVersion(readFileSync(androidConfPath, 'utf8')),
  ]);
}

let ok = true;
for (const [name, v] of checks) {
  if (v !== version) {
    console.error(`MISMATCH: ${name} has "${v}", expected "${version}"`);
    ok = false;
  } else {
    console.log(`OK: ${name} = ${v}`);
  }
}
if (!ok) fail('version sync verification failed');
console.log(`Version synced to ${version}`);