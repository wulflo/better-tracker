#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const manifestPath = process.argv[2] || 'release-manifest.json';
const sumsPath = process.argv[3] || 'SHA256SUMS.txt';

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sumsText = readFileSync(sumsPath, 'utf8');
const sums = new Map();
for (const line of sumsText.split(/\r?\n/)) {
  const m = line.trim().match(/^([a-f0-9]{64})\s+\*?(.+)$/);
  if (m) sums.set(basename(m[2].trim()), m[1]);
}

let ok = true;
for (const a of manifest.assets) {
  const h = sums.get(a.file);
  if (!h) {
    console.error(`MISSING in SHA256SUMS: ${a.file}`);
    ok = false;
  } else if (h !== a.sha256) {
    console.error(`HASH MISMATCH: ${a.file}: manifest ${a.sha256} vs sums ${h}`);
    ok = false;
  } else {
    console.log(`OK: ${a.file}`);
  }
}
if (!ok) process.exit(1);
console.log('SHA256SUMS consistent with manifest');