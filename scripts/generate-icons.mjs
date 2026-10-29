#!/usr/bin/env node
/**
 * Regenera todos los iconos (escritorio, Android e iOS) desde un único master:
 * `src-tauri/icons/app-icon.png` (1024x1024) vía `src-tauri/icons/app-icon.json`.
 *
 * Por qué existe: los iconos de escritorio viven en `src-tauri/icons`, pero los
 * de Android se generan dentro de `src-tauri/gen/`, que está en `.gitignore`.
 * Sin este paso, un `tauri android init`/build local deja el icono genérico de
 * Tauri y el logo propio "desaparece" de la compilación.
 *
 * Es idempotente: se puede ejecutar siempre que se cambie el logo.
 *
 * Uso:
 *   npm run icons
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'src-tauri', 'icons');
const manifest = join(iconsDir, 'app-icon.json');
const master = join(iconsDir, 'app-icon.png');
const tmpDir = join(root, 'node_modules', '.cache', 'better-tracker-icons');
const androidRes = join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');
const publicLogo = join(root, 'public', 'logo.png');

if (!existsSync(master)) {
  console.error(`generate-icons: falta el master ${master}`);
  process.exit(1);
}
if (!existsSync(manifest)) {
  console.error(`generate-icons: falta el manifiesto ${manifest}`);
  process.exit(1);
}

const tauriBin = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
);
const tauri = existsSync(tauriBin) ? tauriBin : 'npx';
const tauriArgs = existsSync(tauriBin) ? [] : ['tauri'];

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// 0. Logo de la interfaz: el mismo master que el icono. Así una build no puede
// volver a mostrar el logo antiguo de `public/logo.png`.
cpSync(master, publicLogo);
console.log('generate-icons: logo de la interfaz sincronizado con app-icon.png.');

console.log('generate-icons: generando desde app-icon.png…');
execFileSync(tauri, [...tauriArgs, 'icon', manifest, '-o', tmpDir], {
  cwd: root,
  stdio: 'inherit',
});

// 1. Iconos de escritorio: PNG, ICO, ICNS y los logotipos de la Microsoft Store.
let desktop = 0;
for (const name of readdirSync(tmpDir)) {
  if (!/\.(png|ico|icns)$/i.test(name)) continue;
  cpSync(join(tmpDir, name), join(iconsDir, name));
  desktop += 1;
}

// 2. iOS (no se compila en este repo, pero se mantiene coherente si algún día se usa).
let ios = 0;
const iosDir = join(tmpDir, 'ios');
if (existsSync(iosDir)) {
  mkdirSync(join(iconsDir, 'ios'), { recursive: true });
  for (const name of readdirSync(iosDir)) {
    cpSync(join(iosDir, name), join(iconsDir, 'ios', name));
    ios += 1;
  }
}

// 3. Android: los mipmaps deben copiarse al proyecto generado (gen/, ignorado por git).
let android = 0;
const androidDir = join(tmpDir, 'android');
if (existsSync(androidDir)) {
  if (existsSync(androidRes)) {
    for (const entry of readdirSync(androidDir)) {
      cpSync(join(androidDir, entry), join(androidRes, entry), { recursive: true });
      android += 1;
    }
    console.log(
      'generate-icons: mipmaps copiados al proyecto Android. Si añades o quitas densidades, ' +
        'puede quedar alguna carpeta antigua en res/.',
    );
  } else {
    console.warn(
      'generate-icons: no existe src-tauri/gen/android. Ejecuta `npm run tauri android init` ' +
        'y vuelve a lanzar `npm run icons` para aplicar los iconos de Android.',
    );
  }
}

rmSync(tmpDir, { recursive: true, force: true });

console.log(
  `generate-icons: ${desktop} iconos de escritorio, ${ios} de iOS, ${android} de Android.`,
);
