#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const manifestPath = process.argv[2] || 'release-manifest.json';
const schemaPath = process.argv[3] || 'schemas/release-manifest.schema.json';

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(manifestPath, 'utf8'));

const errors = [];

// `latest.json` no usa el esquema de `release-manifest.json`: cada plataforma
// lleva su URL, tamaño, SHA-256 y firma minisign. Aquí se comprueba que los
// paquetes .deb/.rpm que abre el instalador del sistema nunca vayan sin firma.
if (data && typeof data === 'object' && data.platforms && typeof data.platforms === 'object') {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(String(data.version || ''))) {
    errors.push('/version: expected strict SemVer X.Y.Z');
  }
  const signatureRequired = ['linux-deb-x86_64', 'linux-rpm-x86_64'];
  const sha256Required = [...signatureRequired, 'android-aarch64'];
  for (const [key, entry] of Object.entries(data.platforms)) {
    if (!entry || typeof entry !== 'object') {
      errors.push(`/platforms/${key}: expected object`);
      continue;
    }
    if (typeof entry.url !== 'string' || !/^https:\/\/github\.com\//.test(entry.url)) {
      errors.push(`/platforms/${key}/url: expected official GitHub URL`);
    }
    if (sha256Required.includes(key)) {
      if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        errors.push(`/platforms/${key}/sha256: expected 64 lowercase hex chars`);
      }
    } else if (
      entry.sha256 !== undefined &&
      (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256))
    ) {
      errors.push(`/platforms/${key}/sha256: expected 64 lowercase hex chars`);
    }
    if (signatureRequired.includes(key)) {
      if (
        typeof entry.signature !== 'string' ||
        !entry.signature.trim() ||
        !/^[A-Za-z0-9+/=\s]+$/.test(entry.signature)
      ) {
        errors.push(`/platforms/${key}/signature: missing or invalid minisign signature`);
      }
    }
  }
  for (const key of signatureRequired) {
    if (!data.platforms[key]) errors.push(`/platforms/${key}: missing`);
  }
  if (errors.length) {
    console.error('Updater manifest validation FAILED:');
    for (const e of errors) console.error('  ' + e);
    process.exit(1);
  }
  console.log('Updater manifest validation OK');
  process.exit(0);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function validate(sch, value, path) {
  if (!sch) return;
  const t = typeOf(value);
  if (sch.type) {
    const t = typeOf(value);
    const expected = Array.isArray(sch.type) ? sch.type : [sch.type];
    const ok = expected.some((e) => {
      if (e === 'integer') return typeof value === 'number' && Number.isInteger(value);
      return e === t;
    });
    if (!ok) {
      errors.push(`${path || '/'}: expected ${expected.join('|')}, got ${t}`);
      return;
    }
  }
  if (typeof value === 'string') {
    if (sch.minLength != null && value.length < sch.minLength) errors.push(`${path}: minLength ${sch.minLength}`);
    if (sch.pattern && !new RegExp(sch.pattern).test(value)) errors.push(`${path}: pattern ${sch.pattern}`);
  }
  if (typeof value === 'number') {
    if (sch.minimum != null && value < sch.minimum) errors.push(`${path}: minimum ${sch.minimum}`);
  }
  if (t === 'object') {
    if (Array.isArray(sch.required)) {
      for (const r of sch.required) {
        if (!(r in (value || {}))) errors.push(`${path || '/'}: missing required ${r}`);
      }
    }
    const props = sch.properties || {};
    if (sch.additionalProperties === false) {
      for (const k of Object.keys(value || {})) {
        if (!(k in props)) errors.push(`${path || '/'}: additional property ${k}`);
      }
    }
    for (const [k, v] of Object.entries(value || {})) {
      if (props[k]) validate(props[k], v, `${path}/${k}`);
    }
  }
  if (t === 'array') {
    if (sch.items) {
      value.forEach((item, i) => validate(sch.items, item, `${path}/${i}`));
    }
  }
}

validate(schema, data, '');
if (errors.length) {
  console.error('Manifest validation FAILED:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('Manifest validation OK');