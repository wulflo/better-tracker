import type { Food, FoodCategory, FoodLogItem, MealSlot, VaultEvent } from './types';

/**
 * Base local de alimentos comunes.
 *
 * Los valores son orientativos por 100 g (o 100 ml en líquidos). No sustituyen
 * una tabla de composición oficial ni el consejo de un profesional. El usuario
 * puede añadir sus propios alimentos; esos se guardan como eventos de la bóveda.
 */
type FoodRow = [
  id: string,
  name: string,
  category: FoodCategory,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  units?: Record<string, number>,
];

export const FOOD_CATEGORIES: Array<{ id: FoodCategory; label: string }> = [
  { id: 'fruta', label: 'Frutas' },
  { id: 'verdura', label: 'Verduras' },
  { id: 'cereal', label: 'Cereales y tubérculos' },
  { id: 'legumbre', label: 'Legumbres' },
  { id: 'carne', label: 'Carnes' },
  { id: 'pescado', label: 'Pescados y marisco' },
  { id: 'huevo', label: 'Huevos' },
  { id: 'lacteo', label: 'Lácteos' },
  { id: 'fruto_seco', label: 'Frutos secos y semillas' },
  { id: 'grasa', label: 'Grasas y aceites' },
  { id: 'bebida', label: 'Bebidas' },
  { id: 'condimento', label: 'Condimentos y salsas' },
  { id: 'dulce', label: 'Dulces' },
  { id: 'procesado', label: 'Preparados y procesados' },
  { id: 'suplemento', label: 'Suplementos' },
  { id: 'otro', label: 'Otros' },
];

export const MEAL_SLOTS: Array<{ id: MealSlot; label: string }> = [
  { id: 'desayuno', label: 'Desayuno' },
  { id: 'comida', label: 'Comida' },
  { id: 'cena', label: 'Cena' },
  { id: 'snack', label: 'Snack' },
];

export const UNIT_LABELS: Record<string, string> = {
  g: 'gramos',
  ml: 'mililitros',
  unidad: 'unidad',
  taza: 'taza',
  cucharada: 'cucharada',
  cucharadita: 'cucharadita',
  porcion: 'porción',
  rebanada: 'rebanada',
  vaso: 'vaso',
  lata: 'lata',
  botella: 'botella',
  copa: 'copa',
  filete: 'filete',
  punado: 'puñado',
};

const UNIT_ORDER = [
  'g',
  'ml',
  'unidad',
  'taza',
  'cucharada',
  'cucharadita',
  'porcion',
  'rebanada',
  'vaso',
  'lata',
  'botella',
  'copa',
  'filete',
  'punado',
];

const DEFAULT_UNITS: Record<FoodCategory, Record<string, number>> = {
  fruta: { taza: 150, unidad: 150 },
  verdura: { taza: 150, unidad: 100 },
  cereal: { taza: 160, cucharada: 15 },
  legumbre: { taza: 180, cucharada: 15 },
  carne: { porcion: 150, filete: 120 },
  pescado: { porcion: 150, filete: 120 },
  huevo: { unidad: 50 },
  lacteo: { taza: 240, porcion: 100 },
  fruto_seco: { punado: 30, cucharada: 15 },
  grasa: { cucharada: 15, cucharadita: 5 },
  bebida: { vaso: 250, taza: 240, lata: 330, botella: 500, ml: 1 },
  condimento: { cucharada: 15, cucharadita: 5 },
  dulce: { porcion: 30, unidad: 30, cucharada: 15 },
  procesado: { porcion: 100, unidad: 60, rebanada: 30 },
  suplemento: { porcion: 30, cucharada: 30 },
  otro: { porcion: 100 },
};

const ROWS: FoodRow[] = [
  // Frutas
  ['manzana', 'Manzana', 'fruta', 52, 0.3, 13.8, 0.2, 2.4, { unidad: 180 }],
  ['platano', 'Plátano', 'fruta', 89, 1.1, 22.8, 0.3, 2.6, { unidad: 120 }],
  ['naranja', 'Naranja', 'fruta', 47, 0.9, 11.8, 0.1, 2.4, { unidad: 180 }],
  ['mandarina', 'Mandarina', 'fruta', 53, 0.8, 13.3, 0.3, 1.8, { unidad: 90 }],
  ['pera', 'Pera', 'fruta', 57, 0.4, 15.2, 0.1, 3.1, { unidad: 170 }],
  ['uva', 'Uvas', 'fruta', 69, 0.7, 18.1, 0.2, 0.9, { taza: 150 }],
  ['fresa', 'Fresas', 'fruta', 32, 0.7, 7.7, 0.3, 2.0, { taza: 150, unidad: 12 }],
  ['arandano', 'Arándanos', 'fruta', 57, 0.7, 14.5, 0.3, 2.4, { taza: 150 }],
  ['frambuesa', 'Frambuesas', 'fruta', 52, 1.2, 11.9, 0.7, 6.5, { taza: 120 }],
  ['pina', 'Piña', 'fruta', 50, 0.5, 13.1, 0.1, 1.4, { taza: 165, rebanada: 80 }],
  ['mango', 'Mango', 'fruta', 60, 0.8, 15.0, 0.4, 1.6, { unidad: 200, taza: 165 }],
  ['papaya', 'Papaya', 'fruta', 43, 0.5, 10.8, 0.3, 1.7, { taza: 145 }],
  ['kiwi', 'Kiwi', 'fruta', 61, 1.1, 14.7, 0.5, 3.0, { unidad: 75 }],
  ['sandia', 'Sandía', 'fruta', 30, 0.6, 7.6, 0.2, 0.4, { taza: 150 }],
  ['melon', 'Melón', 'fruta', 34, 0.8, 8.2, 0.2, 0.9, { taza: 160 }],
  ['melocoton', 'Melocotón', 'fruta', 39, 0.9, 9.5, 0.3, 1.5, { unidad: 150 }],
  ['ciruela', 'Ciruela', 'fruta', 46, 0.7, 11.4, 0.3, 1.4, { unidad: 70 }],
  ['cereza', 'Cerezas', 'fruta', 63, 1.1, 16.0, 0.2, 2.1, { taza: 150 }],
  ['aguacate', 'Aguacate', 'fruta', 160, 2.0, 8.5, 14.7, 6.7, { unidad: 200, cucharada: 15 }],
  ['limon', 'Limón', 'fruta', 29, 1.1, 9.3, 0.3, 2.8, { unidad: 60 }],
  ['granada', 'Granada', 'fruta', 83, 1.7, 18.7, 1.2, 4.0, { taza: 175 }],
  ['higo', 'Higo', 'fruta', 74, 0.8, 19.2, 0.3, 2.9, { unidad: 50 }],
  ['datil', 'Dátil', 'fruta', 282, 2.5, 75.0, 0.4, 8.0, { unidad: 8 }],
  ['pasas', 'Pasas', 'fruta', 299, 3.1, 79.2, 0.5, 3.7, { cucharada: 15 }],
  ['coco', 'Coco', 'fruta', 354, 3.3, 15.2, 33.5, 9.0, { taza: 80 }],
  ['caqui', 'Caqui', 'fruta', 70, 0.6, 18.6, 0.2, 3.6, { unidad: 170 }],
  ['chirimoya', 'Chirimoya', 'fruta', 75, 1.6, 17.7, 0.7, 3.0, { unidad: 200 }],
  ['membrillo', 'Membrillo', 'fruta', 57, 0.4, 15.3, 0.1, 1.9, { unidad: 180 }],
  ['nispero', 'Níspero', 'fruta', 47, 0.4, 12.1, 0.2, 1.7, { unidad: 35 }],
  ['pomelo', 'Pomelo', 'fruta', 42, 0.8, 10.7, 0.1, 1.6, { unidad: 250 }],

  // Verduras
  ['brocoli', 'Brócoli', 'verdura', 34, 2.8, 6.6, 0.4, 2.6, { taza: 90 }],
  ['coliflor', 'Coliflor', 'verdura', 25, 1.9, 5.0, 0.3, 2.0, { taza: 100 }],
  ['zanahoria', 'Zanahoria', 'verdura', 41, 0.9, 9.6, 0.2, 2.8, { unidad: 60, taza: 128 }],
  ['tomate', 'Tomate', 'verdura', 18, 0.9, 3.9, 0.2, 1.2, { unidad: 120, taza: 180 }],
  ['lechuga', 'Lechuga', 'verdura', 15, 1.4, 2.9, 0.2, 1.3, { taza: 50 }],
  ['espinaca', 'Espinacas', 'verdura', 23, 2.9, 3.6, 0.4, 2.2, { taza: 30 }],
  ['acelga', 'Acelgas', 'verdura', 19, 1.8, 3.7, 0.2, 1.6, { taza: 36 }],
  ['pepino', 'Pepino', 'verdura', 15, 0.7, 3.6, 0.1, 0.5, { unidad: 200, taza: 120 }],
  ['pimiento', 'Pimiento', 'verdura', 31, 1.0, 6.0, 0.3, 2.1, { unidad: 120, taza: 150 }],
  ['cebolla', 'Cebolla', 'verdura', 40, 1.1, 9.3, 0.1, 1.7, { unidad: 150, taza: 160 }],
  ['ajo', 'Ajo', 'verdura', 149, 6.4, 33.1, 0.5, 2.1, { unidad: 3, cucharadita: 3 }],
  ['calabacin', 'Calabacín', 'verdura', 17, 1.2, 3.1, 0.3, 1.0, { unidad: 180, taza: 120 }],
  ['berenjena', 'Berenjena', 'verdura', 25, 1.0, 5.9, 0.2, 3.0, { unidad: 250, taza: 82 }],
  ['judia_verde', 'Judías verdes', 'verdura', 31, 1.8, 7.0, 0.2, 3.4, { taza: 100 }],
  ['guisante', 'Guisantes', 'verdura', 81, 5.4, 14.5, 0.4, 5.7, { taza: 145 }],
  ['champinon', 'Champiñones', 'verdura', 22, 3.1, 3.3, 0.3, 1.0, { taza: 70 }],
  ['seta', 'Setas', 'verdura', 28, 3.1, 5.0, 0.3, 2.0, { taza: 70 }],
  ['esparrago', 'Espárragos', 'verdura', 20, 2.2, 3.9, 0.1, 2.0, { unidad: 20 }],
  ['alcachofa', 'Alcachofa', 'verdura', 47, 3.3, 10.5, 0.2, 5.4, { unidad: 120 }],
  ['remolacha', 'Remolacha', 'verdura', 43, 1.6, 9.6, 0.2, 2.8, { taza: 136 }],
  ['repollo', 'Repollo', 'verdura', 25, 1.3, 5.8, 0.1, 2.5, { taza: 89 }],
  ['col_rizada', 'Col rizada', 'verdura', 35, 2.9, 4.4, 1.5, 4.1, { taza: 67 }],
  ['coles_bruselas', 'Coles de Bruselas', 'verdura', 43, 3.4, 9.0, 0.3, 3.8, { taza: 88 }],
  ['maiz_dulce', 'Maíz dulce', 'verdura', 96, 3.4, 21.0, 1.5, 2.4, { taza: 154, unidad: 90 }],
  ['calabaza', 'Calabaza', 'verdura', 26, 1.0, 6.5, 0.1, 0.5, { taza: 245 }],
  ['boniato', 'Boniato', 'verdura', 86, 1.6, 20.1, 0.1, 3.0, { unidad: 150, taza: 200 }],
  ['patata', 'Patata', 'verdura', 77, 2.0, 17.5, 0.1, 2.2, { unidad: 150, taza: 150 }],
  ['apio', 'Apio', 'verdura', 16, 0.7, 3.0, 0.2, 1.6, { unidad: 40, taza: 120 }],
  ['puerro', 'Puerro', 'verdura', 61, 1.5, 14.2, 0.3, 1.8, { taza: 89 }],
  ['rabano', 'Rábano', 'verdura', 16, 0.7, 3.4, 0.1, 1.6, { unidad: 15 }],
  ['tofu', 'Tofu', 'verdura', 76, 8.1, 1.9, 4.8, 0.3, { porcion: 100 }],
  ['tempeh', 'Tempeh', 'verdura', 192, 20.3, 7.6, 10.8, 0.0, { porcion: 100 }],
  ['seitan', 'Seitán', 'verdura', 140, 25.0, 14.0, 2.0, 0.6, { porcion: 100 }],
  ['edamame', 'Edamame', 'verdura', 121, 11.9, 8.9, 5.2, 5.2, { taza: 155 }],

  // Legumbres
  ['lentejas', 'Lentejas cocidas', 'legumbre', 116, 9.0, 20.1, 0.4, 7.9, { taza: 198 }],
  ['garbanzos', 'Garbanzos cocidos', 'legumbre', 164, 8.9, 27.4, 2.6, 7.6, { taza: 164 }],
  ['alubias', 'Alubias cocidas', 'legumbre', 127, 8.7, 22.8, 0.5, 6.4, { taza: 177 }],
  ['judias_blancas', 'Judías blancas cocidas', 'legumbre', 139, 9.7, 25.1, 0.4, 6.3, { taza: 179 }],
  ['guisantes_cocidos', 'Guisantes cocidos', 'legumbre', 84, 5.4, 15.8, 0.2, 5.5, { taza: 160 }],
  ['soja_cocida', 'Soja cocida', 'legumbre', 172, 18.2, 8.4, 9.0, 6.0, { taza: 172 }],
  ['altramuces', 'Altramuces', 'legumbre', 119, 15.6, 9.9, 2.9, 5.4, { porcion: 50 }],
  ['hummus', 'Hummus', 'legumbre', 166, 7.9, 14.3, 9.6, 6.0, { cucharada: 30 }],

  // Cereales y tubérculos
  ['arroz_blanco', 'Arroz blanco cocido', 'cereal', 130, 2.7, 28.2, 0.3, 0.4, { taza: 158 }],
  ['arroz_integral', 'Arroz integral cocido', 'cereal', 111, 2.6, 23.0, 0.9, 1.8, { taza: 195 }],
  ['pasta', 'Pasta cocida', 'cereal', 131, 5.0, 25.0, 1.1, 1.8, { taza: 140, porcion: 180 }],
  ['pan_blanco', 'Pan blanco', 'cereal', 265, 9.0, 49.0, 3.2, 2.7, { rebanada: 30, unidad: 30 }],
  ['pan_integral', 'Pan integral', 'cereal', 247, 13.0, 41.0, 3.4, 7.0, { rebanada: 35, unidad: 35 }],
  ['pan_centeno', 'Pan de centeno', 'cereal', 259, 8.5, 48.0, 3.3, 5.8, { rebanada: 35 }],
  ['avena', 'Avena cruda', 'cereal', 389, 16.9, 66.3, 6.9, 10.6, { taza: 80, cucharada: 10 }],
  ['muesli', 'Muesli', 'cereal', 367, 10.0, 66.0, 5.0, 8.0, { taza: 80 }],
  ['cereal_maiz', 'Cereal de maíz', 'cereal', 357, 7.5, 84.0, 0.4, 3.0, { taza: 30 }],
  ['quinoa', 'Quinoa cocida', 'cereal', 120, 4.4, 21.3, 1.9, 2.8, { taza: 185 }],
  ['cuscus', 'Cuscús cocido', 'cereal', 112, 3.8, 23.2, 0.2, 1.4, { taza: 157 }],
  ['bulgur', 'Bulgur cocido', 'cereal', 83, 3.1, 18.6, 0.2, 4.5, { taza: 182 }],
  ['tortilla_maiz', 'Tortilla de maíz', 'cereal', 218, 5.7, 45.0, 2.8, 6.0, { unidad: 30 }],
  ['tortita_arroz', 'Tortita de arroz', 'cereal', 387, 8.2, 81.5, 2.8, 4.0, { unidad: 9 }],
  ['harina_trigo', 'Harina de trigo', 'cereal', 364, 10.3, 76.3, 1.0, 2.7, { taza: 120, cucharada: 8 }],
  ['harina_avena', 'Harina de avena', 'cereal', 389, 16.9, 66.3, 6.9, 10.6, { taza: 90 }],
  ['pan_pita', 'Pan de pita', 'cereal', 275, 9.1, 55.0, 1.2, 2.2, { unidad: 60 }],
  ['bagel', 'Bagel', 'cereal', 250, 10.0, 49.0, 1.5, 2.3, { unidad: 100 }],
  ['tortilla_trigo', 'Tortilla de trigo', 'cereal', 306, 8.0, 49.0, 8.0, 3.0, { unidad: 40 }],
  ['galleta_avena', 'Galleta de avena', 'cereal', 450, 7.0, 70.0, 16.0, 6.0, { unidad: 15 }],

  // Carnes
  ['pollo_pechuga', 'Pechuga de pollo', 'carne', 165, 31.0, 0.0, 3.6, 0.0, { porcion: 150, filete: 120 }],
  ['pollo_muslo', 'Muslo de pollo', 'carne', 209, 26.0, 0.0, 10.9, 0.0, { unidad: 120 }],
  ['pavo_pechuga', 'Pechuga de pavo', 'carne', 135, 29.0, 0.0, 1.6, 0.0, { porcion: 150 }],
  ['ternera_solomillo', 'Solomillo de ternera', 'carne', 217, 26.0, 0.0, 12.0, 0.0, { filete: 150 }],
  ['carne_picada_5', 'Carne picada 5%', 'carne', 137, 21.0, 0.0, 5.0, 0.0, { porcion: 150 }],
  ['carne_picada_15', 'Carne picada 15%', 'carne', 250, 18.0, 0.0, 20.0, 0.0, { porcion: 150 }],
  ['cerdo_lomo', 'Lomo de cerdo', 'carne', 143, 26.0, 0.0, 3.5, 0.0, { filete: 130 }],
  ['cerdo_costilla', 'Costilla de cerdo', 'carne', 277, 24.0, 0.0, 20.0, 0.0, { porcion: 150 }],
  ['cordero', 'Cordero', 'carne', 294, 25.0, 0.0, 21.0, 0.0, { porcion: 150 }],
  ['conejo', 'Conejo', 'carne', 173, 33.0, 0.0, 3.5, 0.0, { porcion: 150 }],
  ['jamon_serrano', 'Jamón serrano', 'carne', 241, 31.0, 0.5, 12.0, 0.0, { rebanada: 20 }],
  ['jamon_cocido', 'Jamón cocido', 'carne', 145, 21.0, 1.5, 6.0, 0.0, { rebanada: 30 }],
  ['chorizo', 'Chorizo', 'carne', 455, 24.0, 2.0, 38.0, 0.0, { rebanada: 20, unidad: 50 }],
  ['salchicha', 'Salchicha', 'carne', 300, 12.0, 2.0, 27.0, 0.0, { unidad: 50 }],
  ['bacon', 'Bacon', 'carne', 541, 37.0, 1.4, 42.0, 0.0, { rebanada: 15 }],
  ['higado_ternera', 'Hígado de ternera', 'carne', 135, 20.0, 3.9, 3.6, 0.0, { porcion: 100 }],
  ['pato', 'Pato', 'carne', 337, 19.0, 0.0, 28.0, 0.0, { porcion: 150 }],

  // Pescados y marisco
  ['salmon', 'Salmón', 'pescado', 208, 20.0, 0.0, 13.0, 0.0, { filete: 150, porcion: 150 }],
  ['atun_fresco', 'Atún fresco', 'pescado', 132, 28.0, 0.0, 1.0, 0.0, { filete: 150 }],
  ['atun_agua', 'Atún en lata al agua', 'pescado', 116, 26.0, 0.0, 1.0, 0.0, { lata: 80, porcion: 100 }],
  ['atun_aceite', 'Atún en lata al aceite', 'pescado', 198, 25.0, 0.0, 10.0, 0.0, { lata: 80 }],
  ['merluza', 'Merluza', 'pescado', 86, 17.0, 0.0, 1.8, 0.0, { filete: 150 }],
  ['bacalao', 'Bacalao', 'pescado', 82, 18.0, 0.0, 0.7, 0.0, { filete: 150 }],
  ['dorada', 'Dorada', 'pescado', 96, 19.0, 0.0, 2.0, 0.0, { filete: 150 }],
  ['lubina', 'Lubina', 'pescado', 97, 18.0, 0.0, 3.0, 0.0, { filete: 150 }],
  ['sardinas', 'Sardinas', 'pescado', 208, 25.0, 0.0, 11.0, 0.0, { lata: 90, unidad: 20 }],
  ['boquerones', 'Boquerones', 'pescado', 131, 18.0, 0.0, 6.0, 0.0, { porcion: 100 }],
  ['gambas', 'Gambas', 'pescado', 99, 24.0, 0.2, 0.3, 0.0, { porcion: 100 }],
  ['langostinos', 'Langostinos', 'pescado', 87, 20.0, 0.0, 0.9, 0.0, { unidad: 20 }],
  ['mejillones', 'Mejillones', 'pescado', 172, 24.0, 7.4, 4.5, 0.0, { porcion: 150 }],
  ['almejas', 'Almejas', 'pescado', 148, 25.0, 5.1, 2.0, 0.0, { porcion: 150 }],
  ['calamar', 'Calamar', 'pescado', 92, 15.0, 3.1, 1.4, 0.0, { porcion: 150 }],
  ['pulpo', 'Pulpo', 'pescado', 82, 15.0, 2.2, 1.0, 0.0, { porcion: 150 }],

  // Huevos
  ['huevo', 'Huevo', 'huevo', 143, 12.6, 0.7, 9.5, 0.0, { unidad: 50 }],
  ['clara_huevo', 'Clara de huevo', 'huevo', 52, 10.9, 0.7, 0.2, 0.0, { unidad: 30 }],
  ['huevo_codorniz', 'Huevo de codorniz', 'huevo', 158, 13.0, 0.4, 11.0, 0.0, { unidad: 9 }],

  // Lácteos
  ['leche_entera', 'Leche entera', 'lacteo', 61, 3.2, 4.8, 3.3, 0.0, { vaso: 250, ml: 1 }],
  ['leche_semidesnatada', 'Leche semidesnatada', 'lacteo', 46, 3.2, 4.8, 1.6, 0.0, { vaso: 250, ml: 1 }],
  ['leche_desnatada', 'Leche desnatada', 'lacteo', 35, 3.4, 5.0, 0.1, 0.0, { vaso: 250, ml: 1 }],
  ['yogur_natural', 'Yogur natural', 'lacteo', 61, 3.5, 4.7, 3.3, 0.0, { unidad: 125 }],
  ['yogur_griego', 'Yogur griego', 'lacteo', 97, 4.0, 3.6, 8.0, 0.0, { unidad: 150 }],
  ['yogur_desnatado', 'Yogur desnatado', 'lacteo', 56, 10.0, 3.6, 0.4, 0.0, { unidad: 125 }],
  ['queso_fresco', 'Queso fresco', 'lacteo', 98, 11.0, 3.4, 4.0, 0.0, { porcion: 50 }],
  ['queso_curado', 'Queso curado', 'lacteo', 402, 25.0, 1.0, 33.0, 0.0, { porcion: 30, rebanada: 20 }],
  ['requeson', 'Requesón', 'lacteo', 98, 11.0, 3.5, 4.0, 0.0, { porcion: 100 }],
  ['mantequilla', 'Mantequilla', 'lacteo', 717, 0.9, 0.1, 81.0, 0.0, { cucharada: 14, cucharadita: 5 }],
  ['nata', 'Nata', 'lacteo', 340, 2.0, 3.0, 36.0, 0.0, { cucharada: 15, ml: 1 }],
  ['kefir', 'Kéfir', 'lacteo', 43, 3.5, 4.5, 1.0, 0.0, { vaso: 250, ml: 1 }],
  ['leche_almendra', 'Bebida de almendra', 'lacteo', 24, 0.6, 0.6, 1.6, 0.4, { vaso: 250, ml: 1 }],
  ['leche_soja', 'Bebida de soja', 'lacteo', 33, 3.3, 1.8, 1.8, 0.6, { vaso: 250, ml: 1 }],
  ['leche_avena', 'Bebida de avena', 'lacteo', 45, 1.0, 7.0, 1.5, 0.8, { vaso: 250, ml: 1 }],

  // Frutos secos y semillas
  ['almendra', 'Almendra', 'fruto_seco', 579, 21.0, 21.6, 49.9, 12.5, { unidad: 1.2 }],
  ['nuez', 'Nuez', 'fruto_seco', 654, 15.2, 13.7, 65.2, 6.7, { unidad: 5 }],
  ['avellana', 'Avellana', 'fruto_seco', 628, 15.0, 16.7, 60.8, 9.7, { unidad: 1.2 }],
  ['pistacho', 'Pistacho', 'fruto_seco', 560, 20.0, 27.0, 45.0, 10.0, { unidad: 1.5 }],
  ['anacardo', 'Anacardo', 'fruto_seco', 553, 18.0, 30.0, 44.0, 3.3, { unidad: 1.5 }],
  ['cacahuete', 'Cacahuete', 'fruto_seco', 567, 25.8, 16.1, 49.2, 8.5, { unidad: 1 }],
  ['chia', 'Semillas de chía', 'fruto_seco', 486, 16.5, 42.1, 30.7, 34.4, { cucharada: 12 }],
  ['lino', 'Semillas de lino', 'fruto_seco', 534, 18.3, 28.9, 42.2, 27.3, { cucharada: 10 }],
  ['girasol', 'Semillas de girasol', 'fruto_seco', 584, 20.8, 20.0, 51.5, 8.6, { cucharada: 15 }],
  ['calabaza_pipas', 'Pipas de calabaza', 'fruto_seco', 559, 30.2, 10.7, 49.0, 6.0, { cucharada: 15 }],
  ['sesamo', 'Sésamo', 'fruto_seco', 573, 17.7, 23.4, 49.7, 11.8, { cucharada: 9 }],
  ['crema_cacahuete', 'Crema de cacahuete', 'fruto_seco', 588, 25.0, 20.0, 50.0, 6.0, { cucharada: 16 }],

  // Grasas y aceites
  ['aceite_oliva', 'Aceite de oliva', 'grasa', 884, 0.0, 0.0, 100.0, 0.0, { cucharada: 14, cucharadita: 5, ml: 1 }],
  ['aceite_girasol', 'Aceite de girasol', 'grasa', 884, 0.0, 0.0, 100.0, 0.0, { cucharada: 14, ml: 1 }],
  ['aceite_coco', 'Aceite de coco', 'grasa', 892, 0.0, 0.0, 99.0, 0.0, { cucharada: 14, ml: 1 }],
  ['mayonesa', 'Mayonesa', 'grasa', 680, 1.0, 1.0, 75.0, 0.0, { cucharada: 15 }],
  ['margarina', 'Margarina', 'grasa', 717, 0.2, 0.7, 80.5, 0.0, { cucharada: 14 }],

  // Bebidas
  ['agua', 'Agua', 'bebida', 0, 0.0, 0.0, 0.0, 0.0, { vaso: 250, botella: 500, ml: 1 }],
  ['cafe', 'Café solo', 'bebida', 2, 0.1, 0.0, 0.0, 0.0, { taza: 240, ml: 1 }],
  ['cafe_leche', 'Café con leche', 'bebida', 42, 2.0, 4.8, 1.5, 0.0, { taza: 240, ml: 1 }],
  ['te', 'Té', 'bebida', 1, 0.0, 0.2, 0.0, 0.0, { taza: 240, ml: 1 }],
  ['zumo_naranja', 'Zumo de naranja', 'bebida', 45, 0.7, 10.4, 0.2, 0.2, { vaso: 250, ml: 1 }],
  ['refresco_cola', 'Refresco de cola', 'bebida', 42, 0.0, 10.6, 0.0, 0.0, { lata: 330, vaso: 250, ml: 1 }],
  ['refresco_zero', 'Refresco zero', 'bebida', 0.4, 0.0, 0.1, 0.0, 0.0, { lata: 330, ml: 1 }],
  ['cerveza', 'Cerveza', 'bebida', 43, 0.5, 3.6, 0.0, 0.0, { lata: 330, vaso: 250, ml: 1 }],
  ['vino_tinto', 'Vino tinto', 'bebida', 85, 0.1, 2.6, 0.0, 0.0, { copa: 150, ml: 1 }],
  ['batido_proteina', 'Batido de proteína', 'bebida', 380, 75.0, 8.0, 4.0, 1.0, { cucharada: 30, vaso: 250 }],
  ['isotonica', 'Bebida isotónica', 'bebida', 24, 0.0, 6.0, 0.0, 0.0, { botella: 500, vaso: 250, ml: 1 }],

  // Condimentos y salsas
  ['sal', 'Sal', 'condimento', 0, 0.0, 0.0, 0.0, 0.0, { cucharadita: 5 }],
  ['pimienta', 'Pimienta', 'condimento', 251, 10.4, 64.0, 3.3, 25.3, { cucharadita: 2 }],
  ['oregano', 'Orégano', 'condimento', 265, 9.0, 69.0, 4.3, 42.5, { cucharadita: 1 }],
  ['tomate_frito', 'Tomate frito', 'condimento', 82, 1.7, 12.0, 2.5, 1.5, { cucharada: 15 }],
  ['salsa_soja', 'Salsa de soja', 'condimento', 53, 8.1, 4.9, 0.6, 0.8, { cucharada: 15, ml: 1 }],
  ['vinagre', 'Vinagre', 'condimento', 21, 0.0, 0.9, 0.0, 0.0, { cucharada: 15, ml: 1 }],
  ['mostaza', 'Mostaza', 'condimento', 66, 4.0, 5.0, 3.0, 4.0, { cucharadita: 5 }],
  ['ketchup', 'Kétchup', 'condimento', 101, 1.0, 25.0, 0.1, 0.3, { cucharada: 15 }],
  ['miel', 'Miel', 'condimento', 304, 0.3, 82.4, 0.0, 0.2, { cucharada: 21 }],
  ['azucar', 'Azúcar', 'condimento', 387, 0.0, 100.0, 0.0, 0.0, { cucharadita: 4, cucharada: 12 }],
  ['mermelada', 'Mermelada', 'condimento', 250, 0.4, 62.0, 0.1, 1.0, { cucharada: 20 }],
  ['caldo_pollo', 'Caldo de pollo', 'condimento', 4, 0.5, 0.2, 0.1, 0.0, { taza: 240, ml: 1 }],

  // Dulces
  ['chocolate_negro', 'Chocolate negro 85%', 'dulce', 598, 7.8, 22.0, 46.0, 10.0, { porcion: 20, unidad: 10 }],
  ['chocolate_leche', 'Chocolate con leche', 'dulce', 535, 7.7, 59.4, 29.7, 3.4, { porcion: 20, unidad: 10 }],
  ['galleta_maria', 'Galleta María', 'dulce', 436, 6.0, 75.0, 13.0, 2.0, { unidad: 7 }],
  ['croissant', 'Croissant', 'dulce', 406, 8.2, 45.0, 21.0, 2.6, { unidad: 60 }],
  ['magdalena', 'Magdalena', 'dulce', 430, 6.0, 55.0, 20.0, 1.8, { unidad: 60 }],
  ['helado_vainilla', 'Helado de vainilla', 'dulce', 207, 3.5, 24.0, 11.0, 0.7, { porcion: 100, cucharada: 30 }],
  ['tarta_queso', 'Tarta de queso', 'dulce', 321, 6.0, 25.0, 21.0, 1.0, { porcion: 100 }],

  // Preparados y procesados
  ['patatas_fritas', 'Patatas fritas', 'procesado', 312, 3.4, 41.0, 15.0, 3.8, { porcion: 30 }],
  ['pizza_margarita', 'Pizza margarita', 'procesado', 266, 11.0, 33.0, 10.0, 2.3, { porcion: 120 }],
  ['hamburguesa', 'Hamburguesa', 'procesado', 295, 13.0, 30.0, 13.0, 1.5, { unidad: 120 }],
  ['perrito', 'Perrito caliente', 'procesado', 247, 10.0, 18.0, 15.0, 1.0, { unidad: 100 }],
  ['empanadilla', 'Empanadilla', 'procesado', 250, 8.0, 30.0, 11.0, 1.0, { unidad: 80 }],
  ['palomitas', 'Palomitas', 'procesado', 387, 12.0, 78.0, 4.5, 15.0, { porcion: 30 }],
  ['aceitunas', 'Aceitunas', 'procesado', 115, 0.8, 6.0, 10.7, 3.2, { unidad: 4, porcion: 30 }],
  ['encurtidos', 'Encurtidos', 'procesado', 11, 0.6, 2.0, 0.2, 1.2, { porcion: 30 }],

  // Suplementos
  ['proteina_suero', 'Proteína de suero', 'suplemento', 380, 75.0, 8.0, 4.0, 1.0, { cucharada: 30, porcion: 30 }],
  ['barrita_proteica', 'Barrita proteica', 'suplemento', 350, 30.0, 30.0, 12.0, 8.0, { unidad: 50 }],
  ['levadura_nutricional', 'Levadura nutricional', 'suplemento', 385, 45.0, 35.0, 5.0, 20.0, { cucharada: 5 }],
  ['cacao_polvo', 'Cacao en polvo', 'suplemento', 228, 19.6, 57.9, 13.7, 33.2, { cucharada: 5 }],
];

export const FOODS: Food[] = ROWS.map(([id, name, category, kcal, protein, carbs, fat, fiber, units]) => ({
  id,
  name,
  category,
  per100: { kcal, protein, carbs, fat, fiber },
  units: { ...DEFAULT_UNITS[category], ...(units ?? {}) },
}));

export function foodUnits(food: Food): string[] {
  return UNIT_ORDER.filter((unit) => unit === 'g' || food.units[unit] !== undefined);
}

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export function defaultQuantity(unit: string): number {
  return unit === 'g' || unit === 'ml' ? 100 : 1;
}

export function unitGrams(food: Food, unit: string): number {
  if (unit === 'g' || unit === 'ml') return 1;
  return food.units[unit] ?? 100;
}

export function calcFood(
  food: Food,
  quantity: number,
  unit: string,
): { grams: number; kcal: number; protein: number; carbs: number; fat: number; fiber: number } {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const grams = safeQuantity * unitGrams(food, unit);
  const factor = grams / 100;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    grams: round(grams),
    kcal: Math.round(food.per100.kcal * factor),
    protein: round(food.per100.protein * factor),
    carbs: round(food.per100.carbs * factor),
    fat: round(food.per100.fat * factor),
    fiber: round(food.per100.fiber * factor),
  };
}

export function mealTotals(items: FoodLogItem[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
} {
  const total = items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  return {
    kcal: Math.round(total.kcal),
    protein: Math.round(total.protein * 10) / 10,
    carbs: Math.round(total.carbs * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    fiber: Math.round(total.fiber * 10) / 10,
  };
}

export function searchFoods(foods: Food[], query: string, limit = 10): Food[] {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const q = normalize(query.trim());
  if (!q) return foods.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  return foods
    .filter((food) => {
      const haystack = normalize(`${food.name} ${food.category}`);
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, limit);
}

export function categoryLabel(category: FoodCategory): string {
  return FOOD_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

export function reduceCustomFoods(events: VaultEvent[]): Food[] {
  const map = new Map<string, Food>();
  for (const event of events) {
    if (event.kind !== 'food.saved') continue;
    const raw = event.payload as Partial<Food> | null;
    if (!raw || typeof raw.id !== 'string' || !raw.name) continue;
    const category = FOOD_CATEGORIES.some((c) => c.id === raw.category) ? (raw.category as FoodCategory) : 'otro';
    const per100 = raw.per100 ?? { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    map.set(raw.id, {
      id: raw.id,
      name: String(raw.name).trim(),
      category,
      per100: {
        kcal: Math.max(0, Number(per100.kcal) || 0),
        protein: Math.max(0, Number(per100.protein) || 0),
        carbs: Math.max(0, Number(per100.carbs) || 0),
        fat: Math.max(0, Number(per100.fat) || 0),
        fiber: Math.max(0, Number(per100.fiber) || 0),
      },
      units: { ...DEFAULT_UNITS[category], ...(raw.units ?? {}) },
      custom: true,
    });
  }
  return [...map.values()];
}
