#!/usr/bin/env node
// Generates the static `latest.json` consumed by the Tauri updater plugin.
//
// Each platform/architecture reads a different entry from the same manifest.
// Desktop Tauri verifies the minisign signature before installing. Android
// verifies the published SHA-256 and lets Android verify the APK signature.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const args = process.argv.slice(2);
const requireAll = args.includes('--require-all');
const positional = args.filter((a) => !a.startsWith('--'));

const assetsDir = positional[0];
const outPath = resolve(positional[1] || 'latest.json');
const tag = positional[2] || `v${readFileSync(join(ROOT, 'VERSION'), 'utf8').trim()}`;
const version = positional[3] || readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
const repo = positional[4] || process.env.GITHUB_REPOSITORY || 'wulflo/better-tracker';

if (!assetsDir) {
  console.error(
    'Usage: generate-updater-manifest.mjs <assets-dir> [output] [tag] [version] [owner/repo] [--require-all]',
  );
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function archFromName(name) {
  if (/aarch64|arm64/i.test(name)) return 'aarch64';
  if (/universal/i.test(name)) return 'universal';
  return 'x86_64';
}

function assetUrl(file) {
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(file))}`;
}

const files = walk(assetsDir);
const platforms = {};
const priorities = {};

function addPlatform(key, asset, signature, priority) {
  const previous = priorities[key] ?? -1;
  if (priority < previous) return;
  priorities[key] = priority;
  platforms[key] = {
    signature,
    url: assetUrl(asset),
  };
  console.log(`  ${key} <- ${basename(asset)}`);
}

for (const sig of files.filter((f) => f.endsWith('.sig'))) {
  const asset = sig.slice(0, -4);
  if (!existsSync(asset)) {
    console.warn(`Skipping orphan signature: ${basename(sig)}`);
    continue;
  }
  const name = basename(asset);
  const arch = archFromName(name);
  // Tauri v2 stores the minisign signature base64-encoded in the .sig file.
  // The updater expects that exact string in the `signature` field.
  const signature = readFileSync(sig, 'utf8').trim();
  if (!signature || !/^[A-Za-z0-9+/=\s]+$/.test(signature)) {
    console.warn(`Skipping invalid-looking signature: ${basename(sig)}`);
    continue;
  }

  if (/\.AppImage$/i.test(name)) {
    // Tauri v2 reuses the AppImage itself and signs it in place.
    addPlatform(`linux-${arch}`, asset, signature, 20);
  } else if (/\.AppImage\.tar\.gz$/i.test(name)) {
    // Legacy v1-compatible updater archive.
    addPlatform(`linux-${arch}`, asset, signature, 10);
  } else if (/\.exe$/i.test(name)) {
    // NSIS installer, preferred on Windows because it installs per-user.
    addPlatform('windows-x86_64', asset, signature, 30);
  } else if (/\.nsis\.zip$/i.test(name)) {
    addPlatform('windows-x86_64', asset, signature, 28);
  } else if (/\.msi$/i.test(name)) {
    addPlatform('windows-x86_64', asset, signature, 5);
  } else if (/\.msi\.zip$/i.test(name)) {
    addPlatform('windows-x86_64', asset, signature, 4);
  }
}

// Los paquetes .deb/.rpm no usan minisign (el instalador del sistema valida el
// paquete). Publicamos SHA-256 y tamaño para que Rust los descargue y verifique
// antes de abrir el instalador. Las claves son propias: el plugin de Tauri sigue
// usando `linux-x86_64` para AppImage.
const linuxPackages = [
  { extension: '.deb', key: 'linux-deb-x86_64' },
  { extension: '.rpm', key: 'linux-rpm-x86_64' },
];
for (const { extension, key } of linuxPackages) {
  const candidates = files.filter((file) => file.endsWith(extension) && !file.endsWith(`${extension}.sig`));
  if (!candidates.length) {
    console.warn(`No ${extension} package found; ${key} will be absent from latest.json.`);
    continue;
  }
  const chosen =
    candidates.find((file) => /x86_64|amd64/i.test(basename(file))) ?? candidates[0];
  const bytes = readFileSync(chosen);
  platforms[key] = {
    // El updater de escritorio deserializa todas las entradas con `signature`.
    // Para .deb/.rpm la verificación es SHA-256 + el propio gestor de paquetes.
    signature: '',
    url: assetUrl(chosen),
    size: statSync(chosen).size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  console.log(`  ${key} <- ${basename(chosen)} (sha256)`);
}

// La APK no usa la firma minisign de Tauri: el cliente Android verifica el
// SHA-256 publicado y luego el sistema comprueba la firma del APK al instalar.
const apks = files.filter((file) => /\.apk$/i.test(file));
if (apks.length) {
  const apk =
    apks.find((file) => /universal/i.test(basename(file))) ??
    apks.find((file) => /arm64|aarch64/i.test(basename(file))) ??
    apks[0];
  const bytes = readFileSync(apk);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  platforms['android-aarch64'] = {
    // El updater de escritorio deserializa todas las entradas con un campo
    // `signature` obligatorio, aunque no use la de Android. La APK no usa
    // minisign: el cliente Android verifica el SHA-256 de aquí abajo.
    signature: '',
    url: assetUrl(apk),
    size: statSync(apk).size,
    sha256,
  };
  console.log(`  android-aarch64 <- ${basename(apk)} (${sha256.slice(0, 12)}…)`);
} else {
  console.warn('No APK found; android-aarch64 will be absent from latest.json.');
}

const required = [
  'linux-x86_64',
  'linux-deb-x86_64',
  'linux-rpm-x86_64',
  'windows-x86_64',
  'android-aarch64',
];
const missing = required.filter((key) => !platforms[key]);
if (missing.length) {
  console.error(`Missing updater artifacts for: ${missing.join(', ')}`);
  if (requireAll) process.exit(1);
}

if (!Object.keys(platforms).length) {
  console.error('No signed updater artifacts found.');
  process.exit(1);
}

const notesPath = join(ROOT, 'docs', 'releases', `${tag}.md`);
const notes = existsSync(notesPath)
  ? readFileSync(notesPath, 'utf8').trim()
  : `Better Tracker ${version}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${outPath} (${Object.keys(platforms).length} platforms, version ${version}, tag ${tag})`);
