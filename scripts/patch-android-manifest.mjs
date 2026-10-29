#!/usr/bin/env node
/**
 * Añade el permiso CAMERA y la feature de cámara al AndroidManifest generado
 * por Tauri. `src-tauri/gen/` está en .gitignore, así que cada build limpio
 * vuelve a crear un manifiesto sin CAMERA y el plugin de escaneo falla con
 * "No permission to use camera".
 *
 * Es idempotente: se puede ejecutar tantas veces como haga falta (CI y local).
 *
 * Uso:
 *   node scripts/patch-android-manifest.mjs [ruta-al-AndroidManifest.xml]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const defaultManifest = resolve(
  here,
  '..',
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);

const target = resolve(process.argv[2] ?? defaultManifest);
if (!existsSync(target)) {
  console.error(`patch-android-manifest: no existe ${target}`);
  console.error('Genera primero el proyecto Android con `npx tauri android init` o `npx tauri android build`.');
  process.exit(1);
}

const CAMERA_PERMISSION = '<uses-permission android:name="android.permission.CAMERA" />';
const CAMERA_FEATURE =
  '<uses-feature android:name="android.hardware.camera" android:required="false" />';
const INTERNET_MARKER = '<uses-permission android:name="android.permission.INTERNET" />';
// Android 9 y anteriores: MediaStore necesita estos permisos para publicar la
// APK de actualización en Descargas. En Android 10+ no se piden (maxSdkVersion).
const LEGACY_STORAGE_PERMISSIONS = [
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="28" />',
].join('\n    ');

let manifest = readFileSync(target, 'utf8');
const original = manifest;

if (!manifest.includes('android.permission.CAMERA')) {
  if (manifest.includes(INTERNET_MARKER)) {
    manifest = manifest.replace(
      INTERNET_MARKER,
      `${INTERNET_MARKER}\n    ${CAMERA_PERMISSION}`,
    );
  } else {
    // Respaldo: insertar justo después de la etiqueta <manifest ...>.
    const match = manifest.match(/<manifest\b[^>]*>/);
    if (!match) {
      console.error('patch-android-manifest: el archivo no parece un AndroidManifest.xml');
      process.exit(1);
    }
    manifest = manifest.replace(match[0], `${match[0]}\n    ${CAMERA_PERMISSION}`);
  }
}

if (!manifest.includes('android.hardware.camera')) {
  manifest = manifest.replace(CAMERA_PERMISSION, `${CAMERA_PERMISSION}\n    ${CAMERA_FEATURE}`);
}

if (!manifest.includes('android.permission.CAMERA')) {
  console.error('patch-android-manifest: no se pudo añadir el permiso CAMERA');
  process.exit(1);
}

if (!manifest.includes('android.permission.WRITE_EXTERNAL_STORAGE')) {
  if (manifest.includes(INTERNET_MARKER)) {
    manifest = manifest.replace(
      INTERNET_MARKER,
      `${INTERNET_MARKER}\n    ${LEGACY_STORAGE_PERMISSIONS}`,
    );
  } else {
    const match = manifest.match(/<manifest\b[^>]*>/);
    if (!match) {
      console.error('patch-android-manifest: el archivo no parece un AndroidManifest.xml');
      process.exit(1);
    }
    manifest = manifest.replace(
      match[0],
      `${match[0]}\n    ${LEGACY_STORAGE_PERMISSIONS}`,
    );
  }
}

if (manifest !== original) {
  writeFileSync(target, manifest);
  console.log(`patch-android-manifest: permisos de cámara/almacenamiento añadidos a ${target}`);
} else {
  console.log(`patch-android-manifest: los permisos ya estaban en ${target}`);
}
