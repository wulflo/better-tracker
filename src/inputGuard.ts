// Bloqueo global de pegado y arrastre de texto/archivos.
export function installInputGuard(): void {
  const block = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener('paste', block, true);
  document.addEventListener('cut', block, true);
  document.addEventListener('drop', block, true);
  document.addEventListener('dragover', block, true);
  document.addEventListener('contextmenu', (e) => {
    // Disable paste in context menu by blocking the event entirely on inputs
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) e.preventDefault();
  }, true);
  document.addEventListener('beforeinput', (e: any) => {
    const t = e.inputType || '';
    if (t.startsWith('insertFromPaste') || t.startsWith('insertFromDrop') || t.startsWith('insertFromYank')) {
      e.preventDefault();
    }
  }, true);
  // Disable autocomplete/spellcheck globally
  document.querySelectorAll('input, textarea').forEach(el => {
    (el as HTMLInputElement).setAttribute('autocomplete', 'off');
    (el as HTMLInputElement).setAttribute('autocorrect', 'off');
    (el as HTMLInputElement).setAttribute('autocapitalize', 'off');
    (el as HTMLInputElement).setAttribute('spellcheck', 'false');
  });
}