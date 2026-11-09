# Metodología

Todas las cifras son estimaciones orientativas. No son diagnóstico médico ni sustituyen una valoración profesional.

## Composición corporal

La app calcula todas las ecuaciones que tengan datos suficientes, las muestra por separado y las combina en un **consenso ponderado**. Es una referencia orientativa, no una medición de laboratorio.

### Métodos

Todas las medidas de longitud se usan en centímetros.

**Marina (Navy, Hodgdon & Beckett, 1984)**

- Hombres: `495 / (1.0324 − 0.19077·log10(cintura − cuello) + 0.15456·log10(altura)) − 450`.
- Mujeres: `495 / (1.29579 − 0.35004·log10(cintura + cadera − cuello) + 0.221·log10(altura)) − 450`.

Requiere sexo, altura, cuello y cintura; en mujeres también cadera. En hombres usa el abdomen al ombligo si está informado y, si no, la cintura.

**RFM (Relative Fat Mass, Woolcott & Bergman, 2018)**

- Hombres: `64 − 20·(altura / cintura)`.
- Mujeres: `76 − 20·(altura / cintura)`.

Solo necesita cintura y altura. Es útil cuando falta peso o cuello.

**Deurenberg (1991)**

`1.2·IMC + 0.23·edad − 10.8·sexo − 5.4`, con `sexo = 1` en hombres y `0` en mujeres.

**CUN-BAE (Gómez-Ambrosi et al., 2012)**

`−44.988 + 0.503·edad + 10.689·sexo + 3.172·IMC − 0.026·IMC² + 0.181·IMC·sexo − 0.020·IMC·edad − 0.005·IMC²·sexo + 0.00021·IMC²·edad`, con `sexo = 0` en hombres y `1` en mujeres.

**Ejército de EE. UU. (Vogel et al., 1988)**

- Hombres: `76.5·log10(abdomen − cuello) − 68.7·log10(altura) + 46.9`.
- Mujeres: `105.3·log10(peso) − 0.2·muñeca − 0.533·cuello − 1.574·antebrazo + 0.173·cadera − 0.515·altura − 35.6`, con el peso en kg.

La ecuación masculina usa el abdomen al ombligo (o la cintura si falta). La femenina necesita peso, muñeca, cuello, antebrazo, cadera y altura.

**Ejército actual, una medida (2023)**

- Hombres: `−26.97 − 0.12·peso_lb + 1.99·abdomen_pulg`.
- Mujeres: `−9.15 − 0.015·peso_lb + 1.27·abdomen_pulg`.

Solo necesita peso y abdomen al ombligo, convertidos desde kg y cm.

**Marines (Wright et al., 1980)**

- Hombres: `0.740·abdomen − 1.249·cuello + 0.985`.
- Mujeres: `1.051·brazo − 1.522·antebrazo − 0.879·cuello + 0.326·abdomen + 0.597·muslo + 0.707`.

La ecuación femenina requiere brazo, antebrazo, cuello, abdomen y muslo.

**Friedl & Vogel (1997)**

- Hombres: `0.771·(abdomen − cuello) − 0.132·altura + 4.29`.

### Consenso y confianza

- Cada método aporta un **error estándar publicado (SEE)**. La fiabilidad se deriva de él como `1 − (SEE − 3)/6`, limitada a `0.45–0.98`, y se eleva al cuadrado para el peso. Cada entrada adicional a partir de dos añade un 4% de peso.
- Los métodos se agrupan por **familia de medidas** (abdominal, cintura-cadera, cintura-altura, IMC y multi-sitio). Cada familia aporta como máximo el peso medio de sus métodos, de modo que varias ecuaciones abdominales correlacionadas no eclipsan a las de IMC o multi-sitio.
- El valor mostrado es la media ponderada por esos pesos; el rango va del mínimo al máximo de los métodos disponibles.
- La **confianza** (15–95%) combina la fiabilidad media, la cobertura de medidas, el acuerdo entre métodos y su número.
- La **cobertura** solo cuenta medidas que alguna ecuación puede aprovechar para ese sexo. Pecho y pantorrilla siguen en la silueta, pero no aumentan la cobertura porque ninguna ecuación de grasa los usa.
- Si falta el abdomen al ombligo, las ecuaciones que lo necesitan usan la cintura como aproximación; si falta la cintura, usan el abdomen.

### Derivados

- Masa grasa = peso × promedio de % grasa / 100.
- Masa magra = peso − masa grasa.
- IMC = peso / altura² (m).
- Índice cintura/cadera (WHR) y cintura/altura (WHtR).

## Gasto energético y macros

- BMR Mifflin-St Jeor: `10·peso + 6.25·altura − 5·edad + constante`, con `+5` hombres, `−161` mujeres y `−78` si no se especifica.
- BMR Katch-McArdle: `370 + 21.6·masa magra`.
- BMR Cunningham: `500 + 22·masa magra`.
- Factor de actividad según minutos semanales: `1.2` (<60), `1.375` (60–149), `1.55` (150–299), `1.725` (≥300).
- Calorías objetivo: TDEE × `0.85` (definición), `1.10` (volumen) o `1.0` (mantenimiento).
- Proteína: `2.0 g/kg` en definición, `1.8 g/kg` en el resto.
- Grasa: máximo entre `0.6 g/kg` y el `24%` de las calorías.
- Carbohidratos: calorías restantes.
- Agua: `35 ml/kg` + `500 ml` por cada 60 minutos de entrenamiento semanal repartidos por día.
- Fibra: `14 g` por cada 1000 kcal.

Si faltan altura, edad o sexo, la app usa valores neutros (170 cm, 30 años, constante neutra) y lo indica en las notas.

## Saciedad dual

Es una heurística de dos vías, en escala 0–100:

- **Presión gástrica**: `50·fibra/objetivo + 30·agua/objetivo + 20·proteína/objetivo`.
- **Señal bioquímica**: `45·proteína/objetivo + 35·fibra/objetivo + 20·grasa/objetivo`.
- **Combinada**: promedio de ambas.

Se clasifica como equilibrada (≥55/≥55), presión baja/bioquímica alta, presión alta/bioquímica baja o ambas bajas. Los objetivos salen de los macros y el agua calculados. No modela hormonas reales; solo orienta hábitos.

## Fuerza

- 1RM Epley: `peso·(1 + reps/30)`, para hasta 12 repeticiones.
- 1RM Brzycki: `peso·36/(37 − reps)`, para menos de 37 repeticiones.

La interfaz usa Epley para las estimaciones visibles. Con muchas repeticiones la estimación pierde fiabilidad.

## Carga por zonas

Cada zona tiene rangos semanales de series y minutos, y horas de recuperación (`src/zones.ts`). La app suma series, minutos y volumen de los últimos 7 días y avisa cuando:

- se superan las series o minutos recomendados;
- se vuelve a cargar una zona antes de la recuperación indicada;
- el total semanal supera 600 minutos.

Los rangos son heurísticas de programación, no prescripciones individuales.

## Mesociclos y recordatorios

- Los planes pueden tener mesociclos de varias semanas con deload opcional.
- Los recordatorios se comprueban cada 30 segundos mientras la app está abierta y usan notificaciones del sistema si el usuario las concede. No se programan en el sistema operativo ni se envían a ningún servidor.

## Fuentes

- Hodgdon, J. E. & Beckett, M. B. (1984). Prediction of percent body fat for U.S. Navy men and women.
- Woolcott, O. O. & Bergman, R. N. (2018). Relative fat mass (RFM) as a new estimator of whole-body fat percentage.
- Deurenberg, P. et al. (1991). Body mass index as a measure of body fatness.
- Gómez-Ambrosi, J. et al. (2012). Body mass index classification misses subjects with increased cardiometabolic risk factors.
- Vogel, J. A. et al. (1988). Prediction of body fatness from anthropometry in U.S. Army men and women.
- Wright, H. F. et al. (1980). Prediction of percent body fat in U.S. Marine Corps men and women.
- Friedl, K. E. & Vogel, J. A. (1997). Validity of percent body fat predicted from circumferences.
- U.S. Army (2023). One-site body-fat estimation (AR 600-9).
- Mifflin, M. D. et al. (1990). A new predictive equation for resting energy expenditure.
- Katch, F. I. & McArdle, W. D. (1973). Prediction of body density from simple anthropometric measurements.
- Cunningham, J. J. (1980). A reanalysis of the factors influencing basal metabolic rate in normal adults.
- Epley, B. (1985). Poundage chart.
- Brzycki, M. (1993). Strength testing: predicting a one-rep max from reps-to-fatigue.
