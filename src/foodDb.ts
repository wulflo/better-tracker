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
  // Alimentos adicionales (populares en Occidente)
  ['granola', 'Granola', 'cereal', 471, 10.0, 64.0, 20.0, 5.0, { taza: 122 }],
  ['quinoa_cocida', 'Quinoa cocida', 'cereal', 120, 4.4, 21.3, 1.9, 2.8, { taza: 185 }],
  ['bulgur_cocido', 'Bulgur cocido', 'cereal', 83, 3.1, 18.6, 0.2, 4.5, { taza: 182 }],
  ['pasta_integral', 'Pasta integral cocida', 'cereal', 124, 5.3, 26.5, 0.5, 3.9, { taza: 140 }],
  ['arroz_basmati', 'Arroz basmati cocido', 'cereal', 130, 3.5, 28.0, 0.3, 0.4, { taza: 163 }],
  ['patata_frita', 'Patatas fritas', 'procesado', 312, 3.4, 41.0, 15.0, 3.8, { porcion: 100 }],
  ['pure_patata', 'Puré de patata', 'procesado', 83, 2.0, 15.0, 1.8, 1.4, { taza: 210 }],
  ['nachos', 'Nachos', 'procesado', 490, 7.0, 62.0, 24.0, 5.0, { porcion: 30 }],
  ['filete_ternera', 'Filete de ternera', 'carne', 271, 26.0, 0.0, 18.0, 0.0, { filete: 120 }],
  ['lomo_cerdo', 'Lomo de cerdo', 'carne', 242, 27.0, 0.0, 14.0, 0.0, { filete: 120 }],
  ['costilla_cerdo', 'Costilla de cerdo', 'carne', 320, 23.0, 0.0, 25.0, 0.0, { porcion: 100 }],
  ['pechuga_pavo', 'Pechuga de pavo', 'carne', 135, 30.0, 0.0, 1.0, 0.0, { filete: 120 }],
  ['muslo_pollo', 'Muslo de pollo', 'carne', 209, 26.0, 0.0, 11.0, 0.0, { unidad: 100 }],
  ['alitas_pollo', 'Alitas de pollo', 'carne', 290, 27.0, 0.0, 19.0, 0.0, { unidad: 50 }],
  ['higado', 'Hígado de ternera', 'carne', 191, 29.0, 5.0, 5.0, 0.0, { porcion: 100 }],
  ['atun_lata', 'Atún en lata', 'pescado', 116, 26.0, 0.0, 1.0, 0.0, { lata: 160 }],
  ['sardina', 'Sardina', 'pescado', 208, 25.0, 0.0, 11.0, 0.0, { lata: 120 }],
  ['trucha', 'Trucha', 'pescado', 148, 21.0, 0.0, 6.6, 0.0, { filete: 120 }],
  ['gamba', 'Gambas', 'pescado', 99, 24.0, 0.0, 0.3, 0.0, { porcion: 100 }],
  ['mejillon', 'Mejillones', 'pescado', 172, 24.0, 7.0, 4.5, 0.0, { porcion: 100 }],
  ['bacalao_seco', 'Bacalao seco', 'pescado', 322, 71.0, 0.0, 2.5, 0.0, { porcion: 50 }],
  ['yogur_0', 'Yogur 0% grasa', 'lacteo', 56, 9.0, 4.0, 0.2, 0.0, { vaso: 125 }],
  ['queso_mozzarella', 'Mozzarella', 'lacteo', 280, 18.0, 3.1, 22.0, 0.0, { porcion: 30 }],
  ['queso_cheddar', 'Cheddar', 'lacteo', 403, 25.0, 1.3, 33.0, 0.0, { rebanada: 20 }],
  ['queso_parmesano', 'Parmesano', 'lacteo', 431, 38.0, 4.1, 29.0, 0.0, { cucharada: 5 }],
  ['queso_cabra', 'Queso de cabra', 'lacteo', 364, 22.0, 0.1, 30.0, 0.0, { porcion: 30 }],
  ['ricotta', 'Ricotta', 'lacteo', 174, 11.0, 3.0, 13.0, 0.0, { porcion: 100 }],
  ['semilla_girasol', 'Semillas de girasol', 'fruto_seco', 584, 21.0, 20.0, 51.0, 8.6, { cucharada: 15 }],
  ['semilla_chia', 'Semillas de chía', 'fruto_seco', 486, 17.0, 42.0, 31.0, 34.0, { cucharada: 15 }],
  ['semilla_lino', 'Semillas de lino', 'fruto_seco', 534, 18.0, 29.0, 42.0, 27.0, { cucharada: 15 }],
  ['mantequilla_cacahuete', 'Mantequilla de maní', 'grasa', 588, 25.0, 20.0, 50.0, 6.0, { cucharada: 16 }],
  ['cafe_negro', 'Café negro', 'bebida', 2, 0.3, 0.0, 0.0, 0.0, { taza: 240 }],
  ['te_negro', 'Té negro', 'bebida', 1, 0.0, 0.3, 0.0, 0.0, { taza: 240 }],
  ['zumo_manzana', 'Zumo de manzana', 'bebida', 46, 0.1, 11.3, 0.1, 0.2, { vaso: 250 }],
  ['vino_blanco', 'Vino blanco', 'bebida', 82, 0.1, 2.6, 0.0, 0.0, { copa: 150 }],
  ['bebida_isotonica', 'Bebida isotónica', 'bebida', 26, 0.0, 6.3, 0.0, 0.0, { botella: 500 }],
  ['salsa_tomate', 'Salsa de tomate', 'condimento', 29, 1.2, 6.0, 0.2, 1.5, { cucharada: 15 }],
  ['mayo_light', 'Mayonesa light', 'condimento', 259, 0.5, 6.0, 25.0, 0.0, { cucharada: 14 }],
  ['canela', 'Canela', 'condimento', 247, 4.0, 81.0, 1.2, 53.0, { cucharadita: 2 }],
  ['chocolate_con_leche', 'Chocolate con leche', 'dulce', 535, 7.7, 60.0, 30.0, 3.4, { porcion: 30 }],
  ['sirope_arce', 'Sirope de arce', 'dulce', 260, 0.0, 67.0, 0.1, 0.0, { cucharada: 20 }],
  ['helado_chocolate', 'Helado de chocolate', 'dulce', 216, 3.8, 28.0, 11.0, 1.5, { taza: 132 }],
  ['patatas_chips', 'Patatas chips', 'procesado', 536, 6.6, 53.0, 34.0, 4.4, { porcion: 30 }],
  ['barrita_cereal', 'Barrita de cereales', 'procesado', 400, 6.0, 65.0, 14.0, 3.0, { unidad: 25 }],
  ['barrita_proteina', 'Barrita de proteína', 'procesado', 350, 30.0, 35.0, 10.0, 5.0, { unidad: 60 }],
  ['galleta_chocolate', 'Galleta con chips', 'dulce', 488, 5.9, 68.0, 22.0, 2.4, { unidad: 15 }],
  ['hot_dog', 'Perrito caliente', 'procesado', 290, 10.0, 24.0, 17.0, 1.0, { unidad: 100 }],
  ['lasagna', 'Lasaña', 'procesado', 135, 8.0, 15.0, 4.5, 1.5, { porcion: 200 }],
  ['sopa_pollo', 'Sopa de pollo', 'procesado', 36, 2.5, 4.0, 1.0, 0.5, { taza: 245 }],
  ['ensalada_cesar', 'Ensalada César', 'procesado', 190, 8.0, 8.0, 14.0, 2.0, { porcion: 200 }],
  ['wrap_pollo', 'Wrap de pollo', 'procesado', 220, 14.0, 25.0, 7.0, 2.0, { unidad: 200 }],
  ['burrito', 'Burrito', 'procesado', 206, 9.0, 28.0, 7.0, 3.0, { unidad: 200 }],
  ['taco', 'Taco', 'procesado', 226, 9.0, 20.0, 13.0, 3.0, { unidad: 80 }],
  ['sushi', 'Sushi', 'procesado', 150, 6.0, 28.0, 1.5, 0.5, { porcion: 100 }],
  ['ramen', 'Ramen', 'procesado', 436, 10.0, 65.0, 15.0, 2.0, { taza: 240 }],
  ['paella', 'Paella', 'procesado', 150, 8.0, 22.0, 4.0, 1.5, { porcion: 200 }],
  ['tortilla_patatas', 'Tortilla de patatas', 'procesado', 180, 8.0, 14.0, 10.0, 1.5, { porcion: 100 }],
  ['gazpacho', 'Gazpacho', 'procesado', 48, 1.0, 6.0, 2.5, 1.0, { vaso: 250 }],
  ['hummus_extra', 'Hummus comercial', 'procesado', 166, 7.9, 14.3, 9.6, 6.0, { cucharada: 30 }],
  ['creatina', 'Creatina monohidrato', 'suplemento', 0, 0.0, 0.0, 0.0, 0.0, { cucharadita: 5 }],
  ['whey', 'Proteína whey', 'suplemento', 370, 80.0, 8.0, 4.0, 1.0, { porcion: 30 }],
  ['caseina', 'Caseína', 'suplemento', 360, 75.0, 10.0, 3.0, 0.0, { porcion: 30 }],
  ['bcaa', 'BCAA en polvo', 'suplemento', 0, 0.0, 0.0, 0.0, 0.0, { cucharada: 10 }],
  ['glutamina', 'Glutamina', 'suplemento', 0, 0.0, 0.0, 0.0, 0.0, { cucharadita: 5 }],
  ['omega3', 'Aceite de pescado', 'suplemento', 900, 0.0, 0.0, 100.0, 0.0, { capsula: 1 }],
  ['multivitaminico', 'Multivitamínico', 'suplemento', 0, 0.0, 0.0, 0.0, 0.0, { unidad: 1 }],
  ['preentreno', 'Pre-entreno', 'suplemento', 5, 0.0, 1.0, 0.0, 0.0, { porcion: 10 }],
  ['pan_molde', 'Pan de molde', 'cereal', 265, 8.0, 49.0, 3.0, 2.5, { rebanada: 25 }],
  ['pan_ciabatta', 'Ciabatta', 'cereal', 270, 9.0, 50.0, 4.0, 2.0, { rebanada: 40 }],
  ['pan_bagel', 'Bagel', 'cereal', 250, 10.0, 49.0, 1.5, 2.0, { unidad: 100 }],
  ['pan_na', 'Pan naan', 'cereal', 310, 9.0, 50.0, 8.0, 2.0, { unidad: 90 }],
  ['pan_tortilla', 'Tortilla de harina', 'cereal', 324, 8.8, 52.0, 9.9, 3.5, { unidad: 45 }],
  ['pan_pumpernickel', 'Pumpernickel', 'cereal', 250, 8.0, 47.0, 3.0, 6.0, { rebanada: 30 }],
  ['cereal_trigo', 'Cereales de trigo', 'cereal', 340, 10.0, 75.0, 1.5, 8.0, { taza: 40 }],
  ['avena_instantanea', 'Avena instantánea', 'cereal', 375, 13.0, 68.0, 6.0, 9.0, { taza: 40 }],
  ['harina_maiz', 'Harina de maíz', 'cereal', 361, 6.9, 76.9, 1.2, 7.3, { taza: 120 }],
  ['arroz_jazmin', 'Arroz jazmín cocido', 'cereal', 130, 2.7, 28.0, 0.3, 0.4, { taza: 158 }],
  ['arroz_arborio', 'Arroz arborio cocido', 'cereal', 130, 2.4, 28.0, 0.2, 0.4, { taza: 158 }],
  ['pasta_fideos', 'Fideos', 'cereal', 138, 4.5, 25.0, 2.0, 1.8, { taza: 140 }],
  ['ramen_seco', 'Ramen seco', 'cereal', 436, 10.0, 65.0, 15.0, 2.0, { paquete: 85 }],
  ['polenta', 'Polenta cocida', 'cereal', 70, 1.7, 15.0, 0.3, 1.0, { taza: 240 }],
  ['mijo_cocido', 'Mijo cocido', 'cereal', 119, 3.5, 23.0, 1.0, 1.3, { taza: 174 }],
  ['amaranto', 'Amaranto cocido', 'cereal', 102, 3.8, 19.0, 1.6, 2.1, { taza: 246 }],
  ['trigo_sarraceno', 'Trigo sarraceno cocido', 'cereal', 92, 3.4, 20.0, 0.6, 2.7, { taza: 168 }],
  ['pan_rallado', 'Pan rallado', 'cereal', 395, 13.0, 73.0, 4.0, 4.0, { cucharada: 15 }],
  ['galleta_salada', 'Galleta salada', 'procesado', 502, 6.7, 62.0, 24.0, 2.0, { unidad: 5 }],
  ['cracker_integral', 'Cracker integral', 'procesado', 430, 9.0, 70.0, 14.0, 8.0, { unidad: 5 }],
  ['tostada_arroz', 'Tostada de arroz', 'procesado', 387, 8.0, 80.0, 2.8, 4.2, { unidad: 9 }],
  ['solomillo_cerdo', 'Solomillo de cerdo', 'carne', 143, 26.0, 0.0, 4.0, 0.0, { filete: 120 }],
  ['paletilla_cerdo', 'Paletilla de cerdo', 'carne', 250, 22.0, 0.0, 18.0, 0.0, { porcion: 100 }],
  ['filete_pavo', 'Filete de pavo', 'carne', 147, 30.0, 0.0, 2.0, 0.0, { filete: 120 }],
  ['muslo_pavo', 'Muslo de pavo', 'carne', 190, 24.0, 0.0, 10.0, 0.0, { unidad: 100 }],
  ['pechuga_pollo_horno', 'Pechuga de pollo al horno', 'carne', 165, 31.0, 0.0, 3.6, 0.0, { filete: 120 }],
  ['pollo_entero', 'Pollo entero asado', 'carne', 239, 27.0, 0.0, 14.0, 0.0, { porcion: 100 }],
  ['carne_asada', 'Carne asada', 'carne', 250, 26.0, 0.0, 15.0, 0.0, { porcion: 100 }],
  ['carne_guisada', 'Carne guisada', 'carne', 180, 20.0, 5.0, 9.0, 1.0, { porcion: 200 }],
  ['albondigas', 'Albóndigas', 'procesado', 220, 16.0, 8.0, 14.0, 1.0, { porcion: 100 }],
  ['salami', 'Salami', 'procesado', 336, 22.0, 2.0, 27.0, 0.0, { rebanada: 15 }],

  // Base de datos nutricional extendida (CSV proporcionado)
  ['manzana_cruda_con_piel', 'Manzana cruda con piel', 'fruta', 52.0, 0.3, 13.8, 0.2, 2.4, { unidad: 180 }],
  ['banana_platano_crudo', 'Banana / Plátano crudo', 'fruta', 89.0, 1.1, 22.8, 0.3, 2.6, { unidad: 118 }],
  ['naranja_cruda', 'Naranja cruda', 'fruta', 47.0, 0.9, 11.8, 0.1, 2.4, { unidad: 131 }],
  ['pera_cruda', 'Pera cruda', 'fruta', 57.0, 0.4, 15.2, 0.1, 3.1, { unidad: 178 }],
  ['uvas_blancas_o_rojas', 'Uvas (blancas o rojas)', 'fruta', 69.0, 0.7, 18.1, 0.2, 0.9],
  ['fresa_frutilla_cruda', 'Fresa / Frutilla cruda', 'fruta', 32.0, 0.7, 7.7, 0.3, 2.0, { unidad: 12 }],
  ['kiwi_crudo', 'Kiwi crudo', 'fruta', 61.0, 1.1, 14.7, 0.5, 3.0, { unidad: 69 }],
  ['sandia_cruda', 'Sandía cruda', 'fruta', 30.0, 0.6, 7.6, 0.2, 0.4],
  ['melon_crudo', 'Melón crudo', 'fruta', 34.0, 0.8, 8.2, 0.2, 0.9],
  ['aguacate_palta_crudo', 'Aguacate / Palta crudo', 'fruta', 160.0, 2.0, 8.5, 14.7, 6.7, { unidad: 200 }],
  ['arandanos_crudos', 'Arándanos crudos', 'fruta', 57.0, 0.7, 14.5, 0.3, 2.4],
  ['mandarina_cruda', 'Mandarina cruda', 'fruta', 53.0, 0.8, 13.3, 0.3, 1.8, { unidad: 88 }],
  ['mango_crudo', 'Mango crudo', 'fruta', 60.0, 0.8, 15.0, 0.4, 1.6, { unidad: 200 }],
  ['papaya_cruda', 'Papaya cruda', 'fruta', 43.0, 0.5, 10.8, 0.3, 1.7],
  ['pina_anana_cruda', 'Piña / Ananá cruda', 'fruta', 50.0, 0.5, 13.1, 0.1, 1.4],
  ['ciruela_cruda', 'Ciruela cruda', 'fruta', 46.0, 0.7, 11.4, 0.3, 1.4, { unidad: 66 }],
  ['melocoton_durazno_crudo', 'Melocotón / Durazno crudo', 'fruta', 39.0, 0.9, 9.5, 0.3, 1.5, { unidad: 150 }],
  ['cereza_cruda', 'Cereza cruda', 'fruta', 50.0, 1.0, 12.2, 0.3, 1.6, { unidad: 8 }],
  ['frambuesa_cruda', 'Frambuesa cruda', 'fruta', 52.0, 1.2, 11.9, 0.7, 6.5],
  ['mora_cruda', 'Mora cruda', 'fruta', 43.0, 1.4, 9.6, 0.5, 5.3],
  ['higo_crudo', 'Higo crudo', 'fruta', 74.0, 0.8, 19.2, 0.3, 2.9, { unidad: 50 }],
  ['higo_seco', 'Higo seco', 'fruta', 249.0, 3.3, 63.9, 0.9, 9.8, { unidad: 20 }],
  ['datil_seco', 'Dátil seco', 'fruta', 277.0, 1.8, 75.0, 0.2, 8.0, { unidad: 24 }],
  ['uvas_pasas', 'Uvas pasas', 'fruta', 299.0, 3.1, 79.2, 0.5, 3.7],
  ['lechuga_iceberg', 'Lechuga iceberg', 'verdura', 14.0, 0.9, 3.0, 0.1, 1.2],
  ['espinaca_cruda', 'Espinaca cruda', 'verdura', 23.0, 2.9, 3.6, 0.4, 2.2],
  ['tomate_rojo_maduro_crudo', 'Tomate rojo maduro crudo', 'verdura', 18.0, 0.9, 3.9, 0.2, 1.2, { unidad: 123 }],
  ['cebolla_cruda', 'Cebolla cruda', 'verdura', 40.0, 1.1, 9.3, 0.1, 1.7, { unidad: 110 }],
  ['ajo_crudo', 'Ajo crudo', 'verdura', 149.0, 6.4, 33.1, 0.5, 2.1, { unidad: 3 }],
  ['zanahoria_cruda', 'Zanahoria cruda', 'verdura', 41.0, 0.9, 9.6, 0.2, 2.8, { unidad: 61 }],
  ['brocoli_crudo', 'Brócoli crudo', 'verdura', 34.0, 2.8, 6.6, 0.4, 2.6],
  ['coliflor_cruda', 'Coliflor cruda', 'verdura', 25.0, 1.9, 5.0, 0.3, 2.0],
  ['papa_patata_cruda_con_piel', 'Papa / Patata cruda (con piel)', 'verdura', 77.0, 2.0, 17.5, 0.1, 2.2, { unidad: 213 }],
  ['batata_boniato_crudo', 'Batata / Boniato crudo', 'verdura', 86.0, 1.6, 20.1, 0.1, 3.0, { unidad: 130 }],
  ['calabacin_zucchini_crudo', 'Calabacín / Zucchini crudo', 'verdura', 17.0, 1.2, 3.1, 0.3, 1.0, { unidad: 196 }],
  ['pimiento_rojo_crudo', 'Pimiento rojo crudo', 'verdura', 26.0, 1.0, 6.0, 0.3, 2.1, { unidad: 119 }],
  ['pimiento_verde_crudo', 'Pimiento verde crudo', 'verdura', 20.0, 0.9, 4.6, 0.2, 1.7, { unidad: 119 }],
  ['champinon_crudo', 'Champiñón crudo', 'verdura', 22.0, 3.1, 3.3, 0.3, 1.0],
  ['pepino_crudo_con_piel', 'Pepino crudo (con piel)', 'verdura', 15.0, 0.7, 3.6, 0.1, 0.5, { unidad: 300 }],
  ['berenjena_cruda', 'Berenjena cruda', 'verdura', 25.0, 1.0, 5.9, 0.2, 3.0],
  ['apio_crudo', 'Apio crudo', 'verdura', 16.0, 0.7, 3.0, 0.2, 1.6],
  ['esparrago_crudo', 'Espárrago crudo', 'verdura', 20.0, 2.2, 3.9, 0.1, 2.1],
  ['alcachofa_cruda', 'Alcachofa cruda', 'verdura', 47.0, 3.3, 10.5, 0.2, 5.4, { unidad: 128 }],
  ['remolacha_cruda', 'Remolacha cruda', 'verdura', 43.0, 1.6, 9.6, 0.2, 2.8],
  ['calabaza_cruda', 'Calabaza cruda', 'verdura', 26.0, 1.0, 6.5, 0.1, 0.5],
  ['rucula_cruda', 'Rúcula cruda', 'verdura', 25.0, 2.6, 3.7, 0.7, 1.6],
  ['puerro_crudo', 'Puerro crudo', 'verdura', 61.0, 1.5, 14.2, 0.3, 1.8],
  ['col_repollo_blanco_crudo', 'Col / Repollo blanco crudo', 'verdura', 25.0, 1.3, 5.8, 0.1, 2.5],
  ['pechuga_de_pollo_cruda', 'Pechuga de pollo (cruda)', 'carne', 120.0, 22.5, 0.0, 2.6, 0.0, { unidad: 200 }],
  ['pechuga_de_pollo_asada', 'Pechuga de pollo (asada)', 'carne', 165.0, 31.0, 0.0, 3.6, 0.0],
  ['muslo_de_pollo_crudo_con_piel', 'Muslo de pollo (crudo con piel)', 'carne', 211.0, 17.3, 0.0, 15.3, 0.0],
  ['muslo_de_pollo_sin_piel', 'Muslo de pollo (sin piel)', 'carne', 121.0, 19.3, 0.0, 4.2, 0.0],
  ['ternera_magra_cruda', 'Ternera magra (cruda)', 'carne', 143.0, 22.6, 0.0, 5.1, 0.0],
  ['entrecot_de_ternera_crudo', 'Entrecot de ternera (crudo)', 'carne', 215.0, 19.5, 0.0, 14.7, 0.0],
  ['lomo_de_cerdo_crudo', 'Lomo de cerdo (crudo)', 'carne', 143.0, 21.1, 0.0, 5.7, 0.0],
  ['costillas_de_cerdo_crudas', 'Costillas de cerdo (crudas)', 'carne', 297.0, 14.7, 0.0, 26.0, 0.0],
  ['carne_picada_de_res_80_magra_cruda', 'Carne picada de res (80% magra cruda)', 'carne', 254.0, 17.2, 0.0, 20.0, 0.0],
  ['carne_picada_de_res_95_magra_cruda', 'Carne picada de res (95% magra cruda)', 'carne', 137.0, 21.4, 0.0, 5.0, 0.0],
  ['bacon_tocino_frito', 'Bacon / Tocino (frito)', 'carne', 541.0, 37.0, 1.4, 41.8, 0.0, { unidad: 15 }],
  ['chorizo_de_cerdo', 'Chorizo de cerdo', 'carne', 455.0, 24.0, 1.9, 39.0, 0.0, { unidad: 50 }],
  ['salchicha_de_viena', 'Salchicha de Viena', 'carne', 245.0, 11.3, 3.7, 20.5, 0.0, { unidad: 45 }],
  ['jamon_cocido_york', 'Jamón cocido / York', 'carne', 106.0, 17.5, 1.0, 3.4, 0.0, { unidad: 25 }],
  ['jamon_serrano_iberico', 'Jamón serrano / ibérico', 'carne', 240.0, 30.0, 0.5, 13.0, 0.0, { unidad: 20 }],
  ['pechuga_de_pavo_fiambre', 'Pechuga de pavo (fiambre)', 'carne', 104.0, 17.0, 4.0, 2.0, 0.0, { unidad: 25 }],
  ['carne_de_cordero_magra_cruda', 'Carne de cordero (magra cruda)', 'carne', 206.0, 20.5, 0.0, 13.2, 0.0],
  ['atun_en_lata_al_agua', 'Atún en lata (al agua)', 'pescado', 86.0, 19.4, 0.0, 0.9, 0.0],
  ['atun_en_lata_en_aceite_escurrido', 'Atún en lata (en aceite escurrido)', 'pescado', 198.0, 29.0, 0.0, 8.0, 0.0],
  ['salmon_crudo_salvaje', 'Salmón crudo (salvaje)', 'pescado', 142.0, 19.8, 0.0, 6.3, 0.0],
  ['salmon_ahumado', 'Salmón ahumado', 'pescado', 117.0, 18.3, 0.0, 4.3, 0.0],
  ['merluza_cruda', 'Merluza cruda', 'pescado', 90.0, 19.0, 0.0, 1.0, 0.0],
  ['bacalao_crudo', 'Bacalao crudo', 'pescado', 82.0, 17.8, 0.0, 0.7, 0.0],
  ['trucha_cruda', 'Trucha cruda', 'pescado', 148.0, 20.8, 0.0, 6.6, 0.0],
  ['sardinas_en_lata_en_tomate', 'Sardinas en lata (en tomate)', 'pescado', 185.0, 16.5, 2.0, 12.0, 0.0],
  ['langostinos_gambas_crudos', 'Langostinos / Gambas crudos', 'pescado', 85.0, 20.1, 0.0, 0.5, 0.0],
  ['pulpo_crudo', 'Pulpo crudo', 'pescado', 82.0, 14.9, 2.2, 1.0, 0.0],
  ['calamar_crudo', 'Calamar crudo', 'pescado', 92.0, 15.6, 3.1, 1.4, 0.0],
  ['mejillones_crudos', 'Mejillones crudos', 'pescado', 86.0, 11.9, 3.7, 2.2, 0.0],
  ['ostras_crudas', 'Ostras crudas', 'pescado', 81.0, 9.5, 4.9, 2.3, 0.0],
  ['huevo_entero_crudo', 'Huevo entero (crudo)', 'lacteo', 143.0, 12.6, 0.7, 9.5, 0.0, { unidad: 50 }],
  ['huevo_frito', 'Huevo frito', 'lacteo', 196.0, 13.6, 0.8, 14.8, 0.0, { unidad: 46 }],
  ['clara_de_huevo_cruda', 'Clara de huevo (cruda)', 'lacteo', 52.0, 10.9, 0.7, 0.2, 0.0, { unidad: 33 }],
  ['yema_de_huevo_cruda', 'Yema de huevo (cruda)', 'lacteo', 322.0, 15.9, 3.6, 26.5, 0.0, { unidad: 17 }],
  ['leche_entera_de_vaca', 'Leche entera de vaca', 'lacteo', 61.0, 3.2, 4.8, 3.3, 0.0, { unidad: 240 }],
  ['leche_desnatada_de_vaca', 'Leche desnatada de vaca', 'lacteo', 34.0, 3.4, 5.0, 0.1, 0.0, { unidad: 240 }],
  ['leche_de_almendras_sin_azucar', 'Leche de almendras (sin azúcar)', 'lacteo', 15.0, 0.6, 0.3, 1.2, 0.2, { unidad: 240 }],
  ['leche_de_soja_sin_azucar', 'Leche de soja (sin azúcar)', 'lacteo', 33.0, 3.3, 1.8, 1.5, 0.6, { unidad: 240 }],
  ['leche_de_avena', 'Leche de avena', 'lacteo', 42.0, 1.0, 6.5, 1.5, 0.8, { unidad: 240 }],
  ['yogur_natural_entero', 'Yogur natural (entero)', 'lacteo', 61.0, 3.5, 4.7, 3.3, 0.0, { unidad: 125 }],
  ['yogur_natural_desnatado', 'Yogur natural (desnatado)', 'lacteo', 43.0, 3.8, 6.0, 0.2, 0.0, { unidad: 125 }],
  ['yogur_griego_natural_entero', 'Yogur griego (natural entero)', 'lacteo', 97.0, 9.0, 4.0, 5.0, 0.0, { unidad: 150 }],
  ['yogur_de_soja', 'Yogur de soja', 'lacteo', 94.0, 3.5, 12.0, 3.0, 0.5, { unidad: 125 }],
  ['queso_mozzarella_leche_entera', 'Queso Mozzarella (leche entera)', 'lacteo', 300.0, 22.2, 2.2, 22.4, 0.0],
  ['queso_brie', 'Queso Brie', 'lacteo', 334.0, 20.8, 0.5, 27.7, 0.0],
  ['queso_edam', 'Queso Edam', 'lacteo', 357.0, 25.0, 1.4, 27.8, 0.0],
  ['queso_feta', 'Queso Feta', 'lacteo', 264.0, 14.2, 4.1, 21.3, 0.0],
  ['queso_crema_tipo_philadelphia', 'Queso Crema (tipo Philadelphia)', 'lacteo', 342.0, 5.9, 4.1, 34.2, 0.0],
  ['queso_cottage_bajo_en_grasa', 'Queso Cottage (bajo en grasa)', 'lacteo', 72.0, 12.4, 2.7, 1.0, 0.0],
  ['arroz_blanco_crudo', 'Arroz blanco (crudo)', 'cereal', 365.0, 7.1, 80.0, 0.7, 1.3],
  ['arroz_blanco_cocido', 'Arroz blanco (cocido)', 'cereal', 130.0, 2.7, 28.2, 0.3, 0.4],
  ['arroz_integral_crudo', 'Arroz integral (crudo)', 'cereal', 367.0, 7.5, 76.2, 3.2, 3.6],
  ['arroz_basmati_crudo', 'Arroz Basmati (crudo)', 'cereal', 356.0, 8.5, 77.5, 0.6, 2.2],
  ['quinoa_cruda', 'Quinoa (cruda)', 'cereal', 368.0, 14.1, 64.2, 6.1, 7.0],
  ['pasta_de_trigo_cruda', 'Pasta de trigo (cruda)', 'cereal', 371.0, 13.0, 74.7, 1.5, 3.2],
  ['pasta_de_trigo_cocida', 'Pasta de trigo (cocida)', 'cereal', 158.0, 5.8, 30.9, 0.9, 1.8],
  ['pasta_integral_cruda', 'Pasta integral (cruda)', 'cereal', 348.0, 14.5, 65.0, 2.5, 8.5],
  ['fideos_de_arroz_crudos', 'Fideos de arroz (crudos)', 'cereal', 364.0, 3.5, 82.6, 0.6, 1.6],
  ['avena_en_hojuelas', 'Avena (en hojuelas)', 'cereal', 389.0, 16.9, 66.3, 6.9, 10.6],
  ['pan_blanco_de_molde', 'Pan blanco (de molde)', 'cereal', 266.0, 8.8, 50.6, 3.3, 2.7, { unidad: 28 }],
  ['pan_de_centeno', 'Pan de centeno', 'cereal', 259.0, 8.5, 48.3, 3.3, 5.8, { unidad: 32 }],
  ['pan_de_hamburguesa', 'Pan de hamburguesa', 'cereal', 277.0, 9.7, 50.2, 3.9, 2.0, { unidad: 50 }],
  ['tortilla_de_trigo_fajita', 'Tortilla de trigo (fajita)', 'cereal', 297.0, 7.9, 49.2, 7.3, 2.4, { unidad: 45 }],
  ['tortilla_de_maiz', 'Tortilla de maíz', 'cereal', 218.0, 5.7, 45.0, 2.8, 6.3, { unidad: 30 }],
  ['harina_de_trigo_refinada', 'Harina de trigo (refinada)', 'cereal', 364.0, 10.3, 76.3, 1.0, 2.7],
  ['harina_de_avena', 'Harina de avena', 'cereal', 404.0, 14.7, 65.7, 9.1, 6.5],
  ['harina_de_almendra', 'Harina de almendra', 'cereal', 590.0, 21.4, 18.6, 52.5, 9.9],
  ['lentejas_crudas', 'Lentejas (crudas)', 'legumbre', 353.0, 25.8, 60.1, 1.1, 30.5],
  ['lentejas_cocidas', 'Lentejas (cocidas)', 'legumbre', 116.0, 9.0, 20.1, 0.4, 7.9],
  ['garbanzos_crudos', 'Garbanzos (crudos)', 'legumbre', 378.0, 20.5, 63.0, 6.0, 12.2],
  ['garbanzos_cocidos', 'Garbanzos (cocidos)', 'legumbre', 164.0, 8.9, 27.4, 2.6, 7.6],
  ['alubias_frijoles_blancos_cocidos', 'Alubias / Frijoles blancos (cocidos)', 'legumbre', 139.0, 9.7, 25.1, 0.4, 6.3],
  ['frijoles_negros_cocidos', 'Frijoles negros (cocidos)', 'legumbre', 132.0, 8.9, 23.7, 0.5, 8.7],
  ['soja_cruda', 'Soja (cruda)', 'legumbre', 446.0, 36.5, 30.2, 19.9, 9.3],
  ['guisantes_arvejas_verdes_crudos', 'Guisantes / Arvejas (verdes crudos)', 'legumbre', 81.0, 5.4, 14.5, 0.4, 5.1],
  ['edamame_cocido', 'Edamame (cocido)', 'legumbre', 121.0, 11.9, 10.5, 5.2, 5.2],
  ['almendras_crudas', 'Almendras (crudas)', 'fruto_seco', 579.0, 21.1, 21.6, 49.9, 12.5],
  ['nueces', 'Nueces', 'fruto_seco', 654.0, 15.2, 13.7, 65.2, 6.7],
  ['cacahuetes_manies_tostados_secos', 'Cacahuetes / Maníes (tostados secos)', 'fruto_seco', 585.0, 23.7, 21.3, 49.7, 8.0],
  ['anacardos_castanas_de_caju_crudos', 'Anacardos / Castañas de cajú (crudos)', 'fruto_seco', 553.0, 18.2, 30.2, 43.8, 3.3],
  ['pistachos_tostados', 'Pistachos (tostados)', 'fruto_seco', 562.0, 20.2, 27.2, 45.3, 10.3],
  ['avellanas_crudas', 'Avellanas (crudas)', 'fruto_seco', 628.0, 15.0, 16.7, 60.8, 9.7],
  ['semillas_de_chia', 'Semillas de chía', 'fruto_seco', 486.0, 16.5, 42.1, 30.7, 34.4],
  ['semillas_de_calabaza', 'Semillas de calabaza', 'fruto_seco', 559.0, 30.2, 10.7, 49.0, 6.0],
  ['semillas_de_girasol', 'Semillas de girasol', 'fruto_seco', 584.0, 20.8, 20.0, 51.5, 8.6],
  ['semillas_de_sesamo', 'Semillas de sésamo', 'fruto_seco', 573.0, 17.7, 23.4, 49.7, 11.8],
  ['semillas_de_lino', 'Semillas de lino', 'fruto_seco', 534.0, 18.3, 28.9, 42.2, 27.3],
  ['crema_de_cacahuete_sin_azucar_anadido', 'Crema de cacahuete (sin azúcar añadido)', 'fruto_seco', 588.0, 25.1, 20.0, 50.4, 6.0],
  ['crema_de_almendras', 'Crema de almendras', 'fruto_seco', 614.0, 21.0, 18.8, 55.5, 10.4],
  ['aceite_de_oliva_virgen_extra', 'Aceite de oliva virgen extra', 'grasa', 884.0, 0.0, 0.0, 100.0, 0.0],
  ['aceite_de_girasol', 'Aceite de girasol', 'grasa', 884.0, 0.0, 0.0, 100.0, 0.0],
  ['aceite_de_coco', 'Aceite de coco', 'grasa', 862.0, 0.0, 0.0, 100.0, 0.0],
  ['azucar_blanco', 'Azúcar blanco', 'dulce', 387.0, 0.0, 100.0, 0.0, 0.0],
  ['azucar_moreno', 'Azúcar moreno', 'dulce', 377.0, 0.1, 97.3, 0.0, 0.0],
  ['chocolate_negro_70_85_cacao', 'Chocolate negro (70-85% cacao)', 'dulce', 598.0, 7.8, 45.9, 42.6, 10.9],
  ['mayonesa_tradicional', 'Mayonesa (tradicional)', 'condimento', 680.0, 1.0, 0.6, 75.0, 0.0, { unidad: 15 }],
  ['salsa_de_soja', 'Salsa de soja', 'condimento', 53.0, 8.1, 4.9, 0.6, 0.8, { unidad: 15 }],
  ['salsa_bbq', 'Salsa BBQ', 'condimento', 180.0, 0.8, 43.0, 0.4, 0.7, { unidad: 15 }],
  ['vinagre_balsamico', 'Vinagre balsámico', 'condimento', 88.0, 0.5, 17.0, 0.0, 0.0, { unidad: 15 }],
  ['pizza_margarita_clasica_masa_fina', 'Pizza Margarita (clásica masa fina)', 'procesado', 266.0, 11.4, 33.3, 9.8, 2.3],
  ['pizza_de_pepperoni', 'Pizza de Pepperoni', 'procesado', 298.0, 12.5, 31.4, 13.6, 2.1],
  ['hamburguesa_con_queso_comida_rapida', 'Hamburguesa con queso (comida rápida)', 'procesado', 295.0, 15.4, 31.7, 11.8, 1.4, { unidad: 115 }],
  ['hamburguesa_de_pollo_empanado', 'Hamburguesa de pollo empanado', 'procesado', 287.0, 13.6, 35.2, 10.5, 1.5, { unidad: 150 }],
  ['papas_fritas_comida_rapida', 'Papas fritas (comida rápida)', 'procesado', 312.0, 3.4, 41.4, 14.7, 3.8],
  ['nuggets_de_pollo_fritos', 'Nuggets de pollo (fritos)', 'procesado', 296.0, 15.1, 14.7, 19.5, 1.2, { unidad: 16 }],
  ['aros_de_cebolla_fritos', 'Aros de cebolla fritos', 'procesado', 411.0, 4.2, 43.5, 24.5, 2.6],
  ['perrito_caliente_hot_dog', 'Perrito caliente / Hot dog', 'procesado', 290.0, 10.0, 28.0, 15.0, 1.2, { unidad: 110 }],
  ['macarrones_con_queso_preparados', 'Macarrones con queso (preparados)', 'procesado', 164.0, 6.3, 18.8, 7.1, 0.9],
  ['lasana_de_carne', 'Lasaña de carne', 'procesado', 135.0, 7.9, 10.8, 6.5, 1.3],
  ['espaguetis_a_la_carbonara', 'Espaguetis a la carbonara', 'procesado', 240.0, 9.0, 22.0, 13.0, 1.0],
  ['raviolis_de_queso_cocidos', 'Raviolis de queso (cocidos)', 'procesado', 170.0, 7.2, 25.4, 4.5, 1.5],
  ['pollo_tikka_masala', 'Pollo Tikka Masala', 'procesado', 126.0, 8.2, 5.1, 7.8, 1.1],
  ['sushi_maki_de_salmon', 'Sushi (Maki de salmón)', 'procesado', 138.0, 5.9, 24.8, 1.3, 0.8, { unidad: 15 }],
  ['sushi_nigiri_de_salmon', 'Sushi (Nigiri de salmón)', 'procesado', 145.0, 7.2, 23.0, 2.1, 0.6, { unidad: 30 }],
  ['arroz_frito_chino', 'Arroz frito chino', 'procesado', 163.0, 5.5, 26.0, 4.2, 1.2],
  ['pad_thai_de_pollo', 'Pad Thai de pollo', 'procesado', 185.0, 7.8, 24.5, 6.5, 1.5],
  ['ramen_de_cerdo_tonkotsu', 'Ramen de cerdo (Tonkotsu)', 'procesado', 115.0, 5.5, 12.0, 4.5, 1.0],
  ['gyozas_dumplings_al_vapor', 'Gyozas / Dumplings al vapor', 'procesado', 155.0, 7.0, 20.0, 5.0, 1.2, { unidad: 25 }],
  ['rollo_de_primavera_frito', 'Rollo de primavera (frito)', 'procesado', 250.0, 5.0, 30.0, 12.0, 2.0, { unidad: 50 }],
  ['tortilla_de_patatas_espanola', 'Tortilla de patatas / española', 'procesado', 135.0, 4.5, 14.0, 7.0, 1.5],
  ['ensalada_cesar_con_pollo_y_aderezo', 'Ensalada César (con pollo y aderezo)', 'procesado', 190.0, 9.2, 7.5, 14.2, 1.6],
  ['sopa_de_fideos_con_pollo', 'Sopa de fideos con pollo', 'procesado', 36.0, 1.8, 4.7, 1.0, 0.4],
  ['sopa_de_tomate', 'Sopa de tomate', 'procesado', 30.0, 1.0, 5.0, 0.5, 1.0],
  ['guiso_de_lentejas_con_chorizo', 'Guiso de lentejas con chorizo', 'procesado', 145.0, 8.0, 15.2, 5.5, 4.5],
  ['estofado_de_ternera_con_patatas', 'Estofado de ternera con patatas', 'procesado', 110.0, 9.0, 10.0, 4.0, 1.5],
  ['asado_argentino_tira_de_asado', 'Asado argentino (tira de asado)', 'procesado', 320.0, 18.0, 0.0, 27.0, 0.0],
  ['milanesa_de_carne_frita', 'Milanesa de carne (frita)', 'procesado', 310.0, 21.0, 18.0, 16.0, 1.5, { unidad: 150 }],
  ['milanesa_de_carne_al_horno', 'Milanesa de carne (al horno)', 'procesado', 250.0, 21.0, 22.0, 8.5, 1.8, { unidad: 150 }],
  ['milanesa_de_pollo_frita', 'Milanesa de pollo (frita)', 'procesado', 315.0, 18.0, 20.0, 18.0, 1.5, { unidad: 150 }],
  ['choripan_pan_y_chorizo', 'Choripán (pan y chorizo)', 'procesado', 325.0, 12.0, 24.0, 20.0, 2.0, { unidad: 180 }],
  ['empanada_de_carne_frita', 'Empanada de carne (frita)', 'procesado', 310.0, 9.5, 33.0, 15.5, 2.0, { unidad: 100 }],
  ['empanada_de_carne_al_horno', 'Empanada de carne (al horno)', 'procesado', 260.0, 10.0, 34.0, 9.0, 2.0, { unidad: 100 }],
  ['locro_argentino', 'Locro argentino', 'procesado', 140.0, 6.0, 18.0, 5.0, 4.0],
  ['tacos_al_pastor', 'Tacos al pastor', 'procesado', 220.0, 12.0, 21.0, 9.5, 2.0, { unidad: 150 }],
  ['burrito_de_carne_y_frijoles', 'Burrito de carne y frijoles', 'procesado', 206.0, 8.5, 30.5, 5.2, 3.1, { unidad: 200 }],
  ['quesadilla_de_queso_y_pollo', 'Quesadilla de queso y pollo', 'procesado', 245.0, 13.0, 20.0, 12.0, 1.5, { unidad: 120 }],
  ['nachos_con_queso', 'Nachos con queso', 'procesado', 305.0, 6.0, 35.0, 16.0, 3.0],
  ['guacamole', 'Guacamole', 'procesado', 150.0, 2.1, 8.0, 13.5, 6.0],
  ['hummus_tradicional', 'Hummus tradicional', 'procesado', 166.0, 7.9, 14.3, 9.6, 6.0],
  ['falafel_frito', 'Falafel (frito)', 'procesado', 333.0, 13.3, 31.8, 17.8, 4.9, { unidad: 20 }],
  ['pure_de_patatas_con_leche_y_mantequilla', 'Puré de patatas (con leche y mantequilla)', 'procesado', 113.0, 2.0, 16.5, 4.5, 1.5],
  ['gnocchi_noquis_de_patata_hervidos', 'Gnocchi / Ñoquis de patata (hervidos)', 'procesado', 133.0, 3.8, 29.0, 0.2, 1.5],
  ['salsa_bolonesa_casera', 'Salsa Boloñesa (casera)', 'procesado', 122.0, 8.5, 5.2, 7.4, 1.4],
  ['tostadas_francesas', 'Tostadas francesas', 'procesado', 229.0, 7.6, 24.8, 11.1, 1.5],
  ['hot_cakes_pancakes_simples', 'Hot Cakes / Pancakes (simples)', 'procesado', 227.0, 6.4, 28.3, 9.8, 0.0, { unidad: 40 }],
  ['crepe_dulce_solo_masa', 'Crepe dulce (solo masa)', 'procesado', 220.0, 7.0, 27.0, 9.0, 0.8, { unidad: 40 }],
  ['brownie_de_chocolate', 'Brownie de chocolate', 'dulce', 466.0, 6.1, 50.4, 28.8, 3.1, { unidad: 60 }],
  ['helado_de_vainilla', 'Helado de vainilla', 'dulce', 207.0, 3.5, 23.6, 11.0, 0.9],
  ['helado_de_chocolate', 'Helado de chocolate', 'dulce', 216.0, 3.8, 28.0, 11.0, 1.2],
  ['galletas_de_chispas_de_chocolate', 'Galletas de chispas de chocolate', 'dulce', 488.0, 5.4, 66.6, 23.7, 2.8, { unidad: 15 }],
  ['galletas_oreo', 'Galletas Oreo', 'dulce', 480.0, 4.5, 70.0, 20.0, 2.5, { unidad: 11 }],
  ['croissant_medialuna_de_mantequilla', 'Croissant / Medialuna de mantequilla', 'cereal', 406.0, 8.2, 45.8, 21.0, 2.6, { unidad: 50 }],
  ['alfajor_de_maicena_con_dulce_de_leche', 'Alfajor de maicena con dulce de leche', 'dulce', 385.0, 5.0, 60.0, 14.0, 1.0, { unidad: 60 }],
  ['alfajor_de_chocolate_tipo_havanna', 'Alfajor de chocolate (tipo havanna)', 'dulce', 420.0, 6.0, 55.0, 20.0, 2.0, { unidad: 50 }],
  ['dulce_de_leche', 'Dulce de leche', 'dulce', 315.0, 7.0, 55.0, 7.0, 0.0],
  ['muffin_de_arandanos', 'Muffin de arándanos', 'dulce', 377.0, 4.8, 55.1, 15.4, 1.5, { unidad: 110 }],
  ['donut_dona_glaseada', 'Donut / Dona glaseada', 'dulce', 452.0, 4.9, 51.3, 25.3, 1.5, { unidad: 50 }],
  ['tarta_de_queso_cheesecake', 'Tarta de queso / Cheesecake', 'dulce', 321.0, 5.5, 25.5, 22.5, 0.4, { unidad: 120 }],
  ['tiramisu', 'Tiramisú', 'dulce', 285.0, 4.5, 29.0, 16.5, 0.5, { unidad: 100 }],
  ['agua_mineral', 'Agua mineral', 'bebida', 0.0, 0.0, 0.0, 0.0, 0.0],
  ['coca_cola_normal', 'Coca-Cola (Normal)', 'bebida', 38.0, 0.0, 10.6, 0.0, 0.0, { unidad: 330 }],
  ['coca_cola_zero_light', 'Coca-Cola (Zero/Light)', 'bebida', 0.0, 0.0, 0.0, 0.0, 0.0, { unidad: 330 }],
  ['jugo_de_naranja_exprimido_natural', 'Jugo de naranja (exprimido natural)', 'bebida', 45.0, 0.7, 10.4, 0.2, 0.2, { unidad: 250 }],
  ['cerveza_rubia_regular', 'Cerveza rubia regular', 'bebida', 43.0, 0.5, 3.6, 0.0, 0.0, { unidad: 330 }],
  ['cafe_solo_sin_azucar', 'Café solo (sin azúcar)', 'bebida', 2.0, 0.1, 0.0, 0.0, 0.0, { unidad: 250 }],
  ['te_verde_infusion_sin_azucar', 'Té verde (infusión sin azúcar)', 'bebida', 1.0, 0.0, 0.2, 0.0, 0.0, { unidad: 250 }],
  ['yerba_mate_infusion_sin_azucar', 'Yerba Mate (infusión sin azúcar)', 'bebida', 12.0, 0.5, 2.0, 0.0, 0.0, { unidad: 250 }],
  ['bebida_isotonica_tipo_gatorade', 'Bebida isotónica (tipo Gatorade)', 'bebida', 25.0, 0.0, 6.0, 0.0, 0.0, { unidad: 500 }],
  ['leche_chocolatada_preparada', 'Leche chocolatada (preparada)', 'bebida', 83.0, 3.5, 11.0, 2.5, 0.5, { unidad: 250 }],
  ['batido_de_proteinas_whey_en_agua', 'Batido de proteínas (Whey en agua)', 'suplemento', 33.0, 6.6, 0.8, 0.3, 0.0, { unidad: 300 }],
  ['polvo_de_proteina_whey_concentrado', 'Polvo de proteína Whey (Concentrado)', 'suplemento', 375.0, 75.0, 8.0, 5.0, 0.0, { unidad: 30 }],
  ['polvo_de_proteina_aislada_de_soja', 'Polvo de proteína aislada de soja', 'suplemento', 335.0, 88.0, 1.5, 0.5, 0.0, { unidad: 30 }],
  ['creatina_monohidratada', 'Creatina monohidratada', 'suplemento', 0.0, 0.0, 0.0, 0.0, 0.0, { unidad: 5 }],
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

/** Peso total (g/ml) de los alimentos registrados. */
export function mealGrams(items: FoodLogItem[]): number {
  return Math.round(
    items.reduce((total, item) => total + (Number.isFinite(item.grams) ? item.grams : 0), 0),
  );
}

/**
 * Recalcula un alimento ya añadido cuando el usuario cambia cantidad, medida o
 * comida. Si el alimento original no está en la base (p. ej. un producto
 * escaneado que se borró), escalamos por gramos para no perder los macros.
 */
export function resizeFoodLogItem(
  item: FoodLogItem,
  food: Food | undefined,
  quantity: number,
  unit: string,
  meal: MealSlot = item.meal,
): FoodLogItem {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (food) {
    const preview = calcFood(food, safeQuantity, unit);
    return { ...item, meal, quantity: safeQuantity, unit, ...preview };
  }
  const oldUnitGrams = item.quantity > 0 ? item.grams / item.quantity : 0;
  const grams = unit === 'g' || unit === 'ml'
    ? safeQuantity
    : safeQuantity * (oldUnitGrams || 0);
  const factor = item.grams > 0 ? grams / item.grams : 0;
  const scale = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    ...item,
    meal,
    quantity: safeQuantity,
    unit,
    grams: Math.round(grams * 10) / 10,
    kcal: Math.round(item.kcal * factor),
    protein: scale(item.protein),
    carbs: scale(item.carbs),
    fat: scale(item.fat),
    fiber: scale(item.fiber),
  };
}

export function normalizeBarcode(code: string): string {
  return String(code ?? '').replace(/\D/g, '');
}

function barcodeVariants(code: string): string[] {
  const clean = normalizeBarcode(code);
  if (!clean) return [];
  return [...new Set([
    clean,
    clean.replace(/^0+/, ''),
    clean.padStart(12, '0'),
    clean.padStart(13, '0'),
  ])].filter(Boolean);
}

/**
 * Busca un alimento por EAN/UPC. Open Food Facts devuelve EAN-13; los lectores
 * de UPC-A suelen entregar 12 dígitos, así que comparamos variantes con y sin
 * ceros a la izquierda.
 */
export function findFoodByBarcode(foods: Food[], code: string): Food | null {
  const variants = barcodeVariants(code);
  if (!variants.length) return null;
  return (
    foods.find((food) => {
      if (!food.barcode) return false;
      const stored = barcodeVariants(food.barcode);
      return stored.some((variant) => variants.includes(variant));
    }) ?? null
  );
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
      const haystack = normalize(`${food.name} ${food.category} ${food.barcode ?? ''}`);
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
      barcode: typeof raw.barcode === 'string' && normalizeBarcode(raw.barcode)
        ? normalizeBarcode(raw.barcode)
        : undefined,
      source: typeof raw.source === 'string' ? raw.source : undefined,
      quantityLabel: typeof raw.quantityLabel === 'string' ? raw.quantityLabel : null,
      servingLabel: typeof raw.servingLabel === 'string' ? raw.servingLabel : null,
    });
  }
  return [...map.values()];
}
