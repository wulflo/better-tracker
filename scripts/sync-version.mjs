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

// --- Verification: fail if any file does not match VERSION ---
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