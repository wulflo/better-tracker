/* Aplica el tema guardado antes del primer pintado. Va como archivo externo
   porque la CSP de Tauri no permite scripts en línea. */
(function () {
  try {
    var mode = localStorage.getItem('bt.theme');
    var accent = localStorage.getItem('bt.accent');
    var root = document.documentElement;
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
    if (accent) root.dataset.accent = accent;
  } catch (error) {
    /* Sin almacenamiento se usa el tema oscuro por defecto. */
  }
})();
