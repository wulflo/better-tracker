# Privacy Policy — Better Fitness Tracker

Last updated: November 2026

Better Fitness Tracker is a local-first app for training, body composition, nutrition,
and weekly load. This policy explains what the app does with your data. It
applies to the desktop app distributed through GitHub Releases, the Microsoft
Store (MSIX), and Android.

## Summary

- No accounts, ads, telemetry, analytics, or tracking.
- Your data stays in the vault folder you choose on your device.
- The app only uses the network when you ask it to.

## Data the app stores

All content you create — workouts, routines, measurements, nutrition logs,
habits, settings, and backups — is written to the vault folder you select.
On desktop it lives in `<vault>/omega`, with daily copies in
`<vault>/longlife`. On Android the vault is a folder you choose with the
system picker.

The data is plain JSON. It is not encrypted by the app. You control the
folder, its backups, and any synchronization you configure yourself (for
example, FolderSync). Better Fitness Tracker does not operate any server, cloud
storage, or account system.

## Data the app does not collect

- No name, email address, password, or account.
- No device identifiers sent to us.
- No usage analytics, crash reports, or behavioral profiles.
- No advertising SDKs or third-party trackers.
- No sale or sharing of personal data.

## Network connections

The app makes a network request only in these cases:

1. **Manual update check.** When you press “Check for updates” in Settings on
   a build installed from GitHub Releases, the app reads the release manifest
   from GitHub and may download the new package. No personal data is sent.
   Builds installed from the Microsoft Store do not include this updater and
   are updated by the Microsoft Store.
2. **Optional barcode lookup.** When you search a barcode, the code you typed
   is sent to Open Food Facts (`world.openfoodfacts.org`) to look up the
   product. Nothing is sent in the background. If you do not use the barcode
   lookup, no request is made.

## Microsoft Store

When you install Better Fitness Tracker from the Microsoft Store, Microsoft may
collect diagnostic and usage information according to the Microsoft Privacy
Statement and your Windows settings. That collection is controlled by
Microsoft, not by Better Fitness Tracker, and the app itself does not send telemetry.
Store builds receive updates through the Microsoft Store.

## Security

Because everything is local, the security of your data depends on your device,
your operating system account, and the backups you keep. Keep the vault folder
private and encrypt it yourself if you store sensitive information. Backups in
`longlife` are copies of the same plain JSON data.

## Children

Better Fitness Tracker is not directed at children and does not knowingly collect
personal information from anyone.

## Changes

If this policy changes, the updated version will be published in this
repository with a new date.

## Contact

Questions about this policy or the app can be sent through the project
repository:

<https://github.com/wulflo/better-tracker>

---

# Política de privacidad — Better Fitness Tracker

Última actualización: noviembre de 2026

Better Fitness Tracker es una app local-first para entrenamiento, composición corporal,
nutrición y carga semanal. Esta política explica qué hace la app con tus datos.
Se aplica a la app de escritorio distribuida por GitHub Releases, a la
Microsoft Store (MSIX) y a Android.

## Resumen

- Sin cuentas, anuncios, telemetría, analítica ni rastreo.
- Tus datos se quedan en la carpeta de bóveda que elijas en tu dispositivo.
- La app solo usa la red cuando tú se lo pides.

## Datos que guarda la app

Todo el contenido que creas —entrenamientos, rutinas, medidas, registros de
nutrición, hábitos, ajustes y copias de seguridad— se escribe en la carpeta de
bóveda que seleccionas. En escritorio vive en `<bóveda>/omega`, con copias
diarias en `<bóveda>/longlife`. En Android la bóveda es una carpeta que eliges
con el selector del sistema.

Los datos son JSON en claro. La app no los cifra. Tú controlas la carpeta, sus
copias y cualquier sincronización que configures por tu cuenta (por ejemplo,
FolderSync). Better Fitness Tracker no opera servidores, almacenamiento en la nube ni
sistemas de cuentas.

## Datos que la app no recopila

- Ni nombre, ni correo, ni contraseña, ni cuenta.
- Ningún identificador de dispositivo enviado a nosotros.
- Ninguna analítica de uso, informe de fallos ni perfil de comportamiento.
- Ningún SDK de publicidad ni rastreador de terceros.
- Ninguna venta ni cesión de datos personales.

## Conexiones de red

La app hace una petición de red solo en estos casos:

1. **Comprobación manual de actualizaciones.** Cuando pulsas «Buscar
   actualizaciones» en Ajustes en una build instalada desde GitHub Releases,
   la app lee el manifiesto de la release en GitHub y puede descargar el
   paquete nuevo. No se envía ningún dato personal. Las builds instaladas desde
   la Microsoft Store no incluyen este actualizador y se actualizan desde la
   propia Store.
2. **Consulta opcional de código de barras.** Cuando buscas un código, el
   código que escribiste se envía a Open Food Facts
   (`world.openfoodfacts.org`) para buscar el producto. No se envía nada en
   segundo plano. Si no usas el lector de códigos, no se hace ninguna petición.

## Microsoft Store

Si instalas Better Fitness Tracker desde la Microsoft Store, Microsoft puede recopilar
información de diagnóstico y uso según la Declaración de privacidad de
Microsoft y la configuración de Windows. Esa recopilación la controla
Microsoft, no Better Fitness Tracker, y la app no envía telemetría. Las builds de la
Store reciben las actualizaciones a través de la Microsoft Store.

## Seguridad

Como todo es local, la seguridad de tus datos depende de tu dispositivo, de tu
cuenta del sistema operativo y de las copias que mantengas. Mantén la carpeta
de la bóveda en privado y cífrala tú mismo si guardas información sensible. Las
copias de `longlife` son copias de los mismos datos JSON en claro.

## Menores

Better Fitness Tracker no está dirigida a menores y no recopila conscientemente
información personal de nadie.

## Cambios

Si esta política cambia, la versión actualizada se publicará en este
repositorio con una fecha nueva.

## Contacto

Las preguntas sobre esta política o sobre la app se pueden enviar a través del
repositorio del proyecto:

<https://github.com/wulflo/better-tracker>
