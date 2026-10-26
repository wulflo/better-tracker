#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function sha256File(p) {
  const h = createHash('sha256');
  const buf = readFileSync(p);
  h.update(buf);
  return h.digest('hex');
}

function normalizeArch(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('aarch64') || s.includes('arm64')) return 'aarch64';
  if (s.includes('x86-64') || s.includes('x86_64') || s.includes('x86 64')) return 'x86_64';
  if (s.includes('universal') || s.includes('fat')) return 'universal';
  return (raw || 'unknown').toString().trim() || 'unknown';
}

function detect(p) {
  const buf = readFileSync(p);
  const magic = buf.subarray(0, 16);
  const hex = magic.toString('hex');
  let platform = 'unknown';
  let arch = 'unknown';
  let format = 'unknown';

  // .deb: ar archive
  if (hex.startsWith('213c617263683e0a')) {
    format = 'deb';
    platform = 'linux';
    try {
      const archOut = execFileSync('dpkg-deb', ['-f', p, 'Architecture'], { encoding: 'utf8' }).trim();
      arch = normalizeArch(archOut);
    } catch {}
    return { platform, arch, format };
  }
  // .rpm
  if (hex.startsWith('edabeedb')) {
    format = 'rpm';
    platform = 'linux';
    try {
      const archOut = execFileSync('rpm', ['-qp', '--queryformat', '%{ARCH}', p], { encoding: 'utf8' }).trim();
      arch = normalizeArch(archOut);
    } catch {}
    return { platform, arch, format };
  }
  // ELF (AppImage or native binary)
  if (hex.startsWith('7f454c46')) {
    // Determine if AppImage by scanning for marker.
    const isAppImage = buf.includes(Buffer.from('AppImage'));
    format = isAppImage ? 'appimage' : 'elf';
    platform = 'linux';
    // arch from ELF header: 0x3E = x86-64, 0xB7 = aarch64
    const machine = buf.readUInt16LE(18);
    if (machine === 0x3e) arch = 'x86_64';
    else if (machine === 0xb7) arch = 'aarch64';
    return { platform, arch, format };
  }
  // Mach-O / dmg
  if (hex.startsWith('7801730d') /* dmg UDIF */ || buf.includes(Buffer.from('koly'))) {
    // crude dmg detection
    format = 'dmg';
    platform = 'macos';
    arch = 'universal';
    return { platform, arch, format };
  }
  if (hex.startsWith('cffaedfe') || hex.startsWith('cefaedfe') || hex.startsWith('cafebabe') || hex.startsWith('cafebabf')) {
    // Mach-O
    format = 'dmg';
    platform = 'macos';
    arch = hex.startsWith('cafebabe') || hex.startsWith('cafebabf') ? 'universal' : normalizeArch(execFileSync('file', ['-b', p], { encoding: 'utf8' }));
    return { platform, arch, format };
  }
  // PE (Windows exe/msi)
  if (hex.startsWith('4d5a')) {
    platform = 'windows';
    // distinguish msi by OLE? Use file output.
    try {
      const out = execFileSync('file', ['-b', p], { encoding: 'utf8' }).toLowerCase();
      if (out.includes('msi') || out.includes('installer')) format = 'msi';
      else format = 'exe';
      if (out.includes('x86-64') || out.includes('x86_64')) arch = 'x86_64';
      else if (out.includes('aarch64') || out.includes('arm64')) arch = 'aarch64';
    } catch {}
    if (arch === 'unknown') arch = 'x86_64';
    return { platform, arch, format };
  }
  // APK (zip). Detect by presence of AndroidManifest.xml
  if (hex.startsWith('504b0304')) {
    try {
      const list = execFileSync('unzip', ['-l', p], { encoding: 'utf8' });
      if (list.includes('AndroidManifest.xml')) {
        format = 'apk';
        platform = 'android';
        arch = 'aarch64';
        return { platform, arch, format };
      }
    } catch {}
    // generic zip
    format = 'zip';
    platform = 'unknown';
    return { platform, arch, format };
  }
  // minisign signature
  const head = buf.subarray(0, 64).toString('utf8');
  if (head.startsWith('untrusted comment:')) {
    format = 'sig';
    platform = 'unknown';
    arch = 'unknown';
    return { platform, arch, format };
  }
  return { platform, arch, format };
}

const assetsDir = process.argv[2];
if (!assetsDir) {
  console.error('Usage: generate-release-manifest.mjs <assets-dir> [output-json]');
  process.exit(2);
}
const outPath = process.argv[3] || join(process.cwd(), 'release-manifest.json');

const version = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
const vaultSchema = parseInt(readFileSync(join(ROOT, 'VAULT_SCHEMA_VERSION'), 'utf8').trim(), 10) || 1;

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {}
const date = new Date().toISOString();

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...walk(p));
    else if (f.isFile()) out.push(p);
  }
  return out;
}
const files = walk(assetsDir).sort();

const assets = files.map((p) => {
  const { platform, arch, format } = detect(p);
  return {
    file: basename(p),
    platform,
    arch,
    format,
    sha256: sha256File(p),
    size: statSync(p).size,
  };
});

const manifest = {
  version,
  commit,
  date,
  vault_schema_version: vaultSchema,
  assets,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath} with ${assets.length} assets`);