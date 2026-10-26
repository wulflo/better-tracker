#!/usr/bin/env node
// Shared, single normalizer for versions read from every artifact format.
//
// Rule: a packager may append a revision suffix (e.g. "-1" in .deb/.rpm) or an
// epoch ("1:"). The canonical version is the strict SemVer core before the
// first '-' (and after the last ':'). Prerelease/build suffixes are NOT part
// of VERSION, so they are stripped the same way.
export function normalizeVersion(raw) {
  let v = String(raw ?? '').trim();
  if (v.toLowerCase().startsWith('v')) v = v.slice(1);
  if (v.includes(':')) v = v.split(':').pop();
  if (v.includes('-')) v = v.split('-')[0];
  if (v.includes('+')) v = v.split('+')[0];
  return v.trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2];
  if (input === undefined) {
    console.error('Usage: normalize-version.mjs <version>');
    process.exit(2);
  }
  process.stdout.write(normalizeVersion(input));
}