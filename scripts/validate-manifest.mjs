#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv = require('/usr/share/nodejs/ajv').default;

const manifestPath = process.argv[2] || 'release-manifest.json';
const schemaPath = process.argv[3] || 'schemas/release-manifest.schema.json';

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(readFileSync(manifestPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error('Manifest validation FAILED:');
  for (const e of validate.errors) console.error(`  ${e.instancePath} ${e.message}`);
  process.exit(1);
}
console.log('Manifest validation OK');