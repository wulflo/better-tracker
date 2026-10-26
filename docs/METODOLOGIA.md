# Metodología

Todas las cifras son estimaciones orientativas. No son diagnóstico médico ni sustituyen una valoración profesional.

## Composición corporal

La app calcula cada método que tenga datos suficientes y muestra el promedio y el rango. No pondera por precisión: es una referencia, no una medición de laboratorio.

### Marina (Navy, Hodgdon & Beckett, 1984)

- Hombres: `495 / (1.0324 − 0.19077·log10(cintura − cuello) + 0.15456·log10(altura)) − 450`.
- Mujeres: `495 / (1.29579 − 0.35004·log10(cintura + cadera − cuello) + 0.221·log10(altura)) − 450`.

Requiere sexo, altura, cuello y cintura; en mujeres también cadera.

### RFM (Relative Fat Mass, Woolcott & Bergman, 2018)

- Hombres: `64 − 20·(altura / cintura)`.
- Mujeres: `76 − 20·(altura / cintura)`.

Solo necesita cintura y altura. Es útil cuando falta peso o cuello.

### Deurenberg (1991)

`1.2·IMC + 0.23·edad − 10.8·sexo − 5.4`, con `sexo = 1` en hombres y `0` en mujeres.

### CUN-BAE (Gómez-Ambrosi et al., 2012)

`−44.988 + 0.503·edad + 10.689·sexo + 3.172·IMC − 0.026·IMC² + 0.181·IMC·sexo − 0.020·IMC·edad − 0.005·IMC²·sexo + 0.00021·IMC²·edad`, con `sexo = 0` en hombres y `1` en mujeres.

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
- Mifflin, M. D. et al. (1990). A new predictive equation for resting energy expenditure.
- Katch, F. I. & McArdle, W. D. (1973). Prediction of body density from simple anthropometric measurements.
- Cunningham, J. J. (1980). A reanalysis of the factors influencing basal metabolic rate in normal adults.
- Epley, B. (1985). Poundage chart.
- Brzycki, M. (1993). Strength testing: predicting a one-rep max from reps-to-fatigue.
