#!/usr/bin/env node
/**
 * Genera el catálogo local de códigos de barras para Argentina, Perú y México
 * a partir de una base SQLite de Open Food Facts (export mini).
 *
 * El catálogo solo guarda `[código, nombre, categoría]`. Los macros se estiman
 * por categoría en tiempo de ejecución y se marcan como estimación: el objetivo
 * es que un escaneo sin conexión devuelva un nombre y una aproximación útil,
 * no sustituir la etiqueta del envase.
 *
 * Uso:
 *   node scripts/generate-barcode-catalog.mjs [ruta.sqlite] [salida.json]
 *
 * Sin argumentos busca `off-mini.db` en la raíz o en /tmp/off-mini.db.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  process.argv[2],
  join(ROOT, 'off-mini.db'),
  '/tmp/off-mini.db',
].filter(Boolean);
const db = candidates.find((path) => existsSync(path));
if (!db) {
  console.error('generate-barcode-catalog: no se encontró off-mini.db. Pasa la ruta como argumento.');
  process.exit(1);
}
const out = resolve(process.argv[3] || join(ROOT, 'src', 'data', 'barcodeCatalog.json'));

const query = `
  SELECT code, productName, countries
  FROM foods
  WHERE code IS NOT NULL AND productName IS NOT NULL
    AND (lower(countries) LIKE '%argentina%' OR lower(countries) LIKE '%peru%' OR lower(countries) LIKE '%méxico%' OR lower(countries) LIKE '%mexico%')
`;
const result = spawnSync('sqlite3', ['-json', db, query], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
if (result.status !== 0) {
  console.error(result.stderr || 'sqlite3 falló');
  process.exit(1);
}
const rows = JSON.parse(result.stdout || '[]');

const NON_FOOD = [
  'gorra', 'tenis', 'zapato', 'zapatilla', 'perfume', 'colonia', 'jabón', 'jabon',
  'champú', 'champu', 'shampoo', 'detergente', 'limpiador', 'pañal', 'panal',
  'toalla', 'cepillo', 'pasta dental', 'papel higiénico', 'papel higienico',
  'desodorante', 'maquillaje', 'labial', 'crema corporal', 'crema facial',
  'protector solar', 'medicamento', 'ibuprofeno', 'paracetamol', 'termómetro',
  'termometro', 'mascarilla', 'guante', 'bolsa', 'juguete', 'pila', 'cargador',
  'audífono', 'audifono', 'celular', 'teléfono', 'telefono', 'ropa', 'camisa',
  'pantalón', 'pantalon', 'calcetín', 'calcetin', 'sosten', 'corbata', 'cama',
  'almohada', 'sábana', 'sabana', 'vajilla', 'cuchillo', 'tenedor', 'detergente',
  'suavizante', 'lejía', 'lejia', 'ambientador', 'insecticida', 'veneno',
];

const CATEGORY_RULES = [
  ['suplemento', ['proteína', 'proteina', 'whey', 'creatina', 'creatine', 'suplemento', 'vitamina', 'multivitam', 'bcaa', 'pre-workout', 'pre workout', 'colágeno', 'colageno', 'omega 3', 'omega-3']],
  ['bebida', ['agua', 'jugo', 'zumo', 'refresco', 'gaseosa', 'soda', 'cola', 'cerveza', 'vino', 'café', 'cafe', 'té ', 'te ', 'bebida', 'isotonica', 'isotónica', 'energizante', 'sidra', 'licor', 'whisky', 'ron ', 'vodka']],
  ['lacteo', ['leche', 'yogur', 'yogurt', 'queso', 'requesón', 'requeson', 'nata', 'crema', 'kéfir', 'kefir', 'mantequilla', 'lácteo', 'lacteo']],
  ['carne', ['pollo', 'pavo', 'carne', 'cerdo', 'ternera', 'res ', 'jamón', 'jamon', 'chorizo', 'salchicha', 'tocino', 'bacon', 'embutido', 'mortadela', 'salami', 'costilla', 'hamburguesa', 'cordero', 'pato']],
  ['pescado', ['atún', 'atun', 'salmón', 'salmon', 'pescado', 'merluza', 'sardina', 'bacalao', 'gamba', 'camarón', 'camaron', 'langostino', 'mejillón', 'mejillon', 'calamar', 'pulpo', 'marisco', 'anchoa', 'trucha']],
  ['huevo', ['huevo', 'clara de huevo', 'huevos']],
  ['fruta', ['manzana', 'plátano', 'platano', 'banana', 'naranja', 'mandarina', 'pera', 'uva', 'fresa', 'frutilla', 'arándano', 'arandano', 'frambuesa', 'piña', 'pina', 'mango', 'papaya', 'kiwi', 'sandía', 'sandia', 'melón', 'melon', 'durazno', 'melocotón', 'melocoton', 'ciruela', 'cereza', 'aguacate', 'palta', 'limón', 'limon', 'granada', 'higo', 'dátil', 'datil', 'coco', 'fruta']],
  ['verdura', ['brócoli', 'brocoli', 'coliflor', 'zanahoria', 'tomate', 'lechuga', 'espinaca', 'acelga', 'pepino', 'pimiento', 'cebolla', 'ajo', 'calabacín', 'calabacin', 'berenjena', 'judía', 'judia', 'guisante', 'champiñón', 'champinon', 'seta', 'espárrago', 'esparrago', 'alcachofa', 'remolacha', 'repollo', 'col ', 'maíz', 'maiz', 'calabaza', 'boniato', 'patata', 'papa ', 'apio', 'puerro', 'rábano', 'rabano', 'tofu', 'tempeh', 'seitán', 'seitan', 'verdura', 'ensalada', 'nopal']],
  ['legumbre', ['lenteja', 'garbanzo', 'alubia', 'frijol', 'poroto', 'soja', 'edamame', 'hummus', 'legumbre', 'altramuz']],
  ['cereal', ['arroz', 'pasta', 'pan ', 'pan_', 'pan integral', 'avena', 'muesli', 'cereal', 'quinoa', 'cuscús', 'cuscus', 'bulgur', 'tortilla', 'harina', 'bagel', 'pita', 'galleta de arroz', 'tortita', 'granola', 'fideo', 'fideos', 'espagueti', 'macarrón', 'macarron']],
  ['fruto_seco', ['almendra', 'nuez', 'avellana', 'pistacho', 'anacardo', 'cacahuete', 'maní', 'mani', 'chía', 'chia', 'lino', 'girasol', 'calabaza pipas', 'sésamo', 'sesamo', 'semilla', 'fruto seco', 'nueces']],
  ['grasa', ['aceite', 'margarina', 'manteca', 'grasa', 'mayonesa', 'manteca de cerdo']],
  ['condimento', ['sal ', 'sal_', 'pimienta', 'orégano', 'oregano', 'tomate frito', 'salsa', 'soja', 'vinagre', 'mostaza', 'kétchup', 'ketchup', 'miel', 'azúcar', 'azucar', 'mermelada', 'caldo', 'especia', 'condimento', 'aderezo', 'aliño', 'alino']],
  ['dulce', ['chocolate', 'galleta', 'pastel', 'helado', 'caramelo', 'dulce', 'bombón', 'bombon', 'tarta', 'croissant', 'magdalena', 'donut', 'brownie', 'alfajor', 'golosina', 'chicle', 'merengue', 'flan', 'pudín', 'pudin']],
  ['procesado', ['pizza', 'hamburguesa', 'perrito', 'hot dog', 'empanada', 'empanadilla', 'patata frita', 'papas fritas', 'snack', 'nachos', 'palomita', 'aceituna', 'encurtido', 'sopa', 'preparado', 'comida preparada', 'conserva', 'procesado']],
];

const TEMPLATES = {
  bebida: [42, 0.2, 10.5, 0.1, 0],
  lacteo: [95, 5.5, 6, 4.5, 0],
  carne: [210, 24, 1, 12, 0],
  pescado: [150, 21, 1, 7, 0],
  huevo: [143, 12.6, 0.7, 9.5, 0],
  fruta: [55, 0.8, 13, 0.3, 2.5],
  verdura: [35, 2, 6, 0.4, 2.5],
  legumbre: [130, 8, 20, 1.5, 6],
  cereal: [300, 8, 55, 5, 3],
  fruto_seco: [580, 20, 20, 50, 9],
  grasa: [700, 1, 2, 75, 0],
  condimento: [100, 2, 15, 3, 2],
  dulce: [420, 5, 65, 17, 2],
  procesado: [250, 7, 30, 12, 2],
  suplemento: [380, 60, 10, 5, 2],
  otro: [200, 6, 25, 8, 2],
};

function cleanName(value) {
  return String(value)
    .replace(/^\s*(en|es|pt|fr):/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();
}

function looksLikeFood(name) {
  if (!name || name.length < 3 || name.length > 140) return false;
  if (!/[a-záéíóúüñç]{3,}/i.test(name)) return false;
  if (/^[0-9\s.,%()-]+$/.test(name)) return false;
  const lower = name.toLowerCase();
  if (NON_FOOD.some((word) => lower.includes(word))) return false;
  if (/^(producto|product|test|prueba|unknown|sin nombre|item|artículo|articulo)\b/i.test(lower)) return false;
  return true;
}

function categoryFor(name) {
  const lower = name.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category;
  }
  return 'otro';
}

function countryFor(value) {
  const lower = String(value).toLowerCase();
  if (lower.includes('peru') || lower.includes('perú')) return 'PE';
  if (lower.includes('mexico') || lower.includes('méxico')) return 'MX';
  if (lower.includes('argentina')) return 'AR';
  return null;
}

const byCode = new Map();
let rejected = 0;
for (const row of rows) {
  const code = String(row.code || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(code)) {
    rejected += 1;
    continue;
  }
  const name = cleanName(row.productName);
  if (!looksLikeFood(name)) {
    rejected += 1;
    continue;
  }
  const country = countryFor(row.countries);
  if (!country) continue;
  const previous = byCode.get(code);
  if (previous) {
    // Preferimos el nombre con más letras latinas (descarta transliteraciones).
    const score = (text) => (text.match(/[a-záéíóúüñç]/gi) || []).length;
    if (score(previous[1]) >= score(name)) continue;
  }
  byCode.set(code, [code, name, categoryFor(name), country]);
}

const catalog = [...byCode.values()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([code, name, category, country]) => [code, name, category, country]);

const counts = catalog.reduce((acc, entry) => {
  acc[entry[3]] = (acc[entry[3]] || 0) + 1;
  acc[entry[2]] = (acc[entry[2]] || 0) + 1;
  return acc;
}, {});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(catalog)}\n`);
writeFileSync(
  join(dirname(out), 'barcodeCatalogMeta.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), total: catalog.length, counts, templates: TEMPLATES }, null, 2)}\n`,
);
console.log(`Catálogo local: ${catalog.length} códigos (${rows.length - rejected} válidos, ${rejected} descartados).`);
console.log(`  Argentina: ${counts.AR || 0} · Perú: ${counts.PE || 0} · México: ${counts.MX || 0}`);
console.log(`  Escrito en ${out}`);
