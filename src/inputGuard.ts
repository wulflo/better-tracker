// Permite pegar solo texto sin formato; bloquea archivos, HTML rico y arrastre.
export function installInputGuard(): void {
  document.addEventListener('paste', (e: ClipboardEvent) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const text = cd.getData('text/plain');
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      e.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      e.preventDefault();
    }
  }, true);
  document.addEventListener('drop', (e) => e.preventDefault(), true);
  document.addEventListener('dragover', (e) => e.preventDefault(), true);
  document.addEventListener('contextmenu', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) e.preventDefault();
  }, true);
  document.addEventListener('beforeinput', (e: any) => {
    const t = e.inputType || '';
    if (t.startsWith('insertFromPaste') || t.startsWith('insertFromDrop') || t.startsWith('insertFromYank')) {
      e.preventDefault();
    }
  }, true);
  document.querySelectorAll('input, textarea').forEach(el => {
    (el as HTMLInputElement).setAttribute('autocomplete', 'off');
    (el as HTMLInputElement).setAttribute('autocorrect', 'off');
    (el as HTMLInputElement).setAttribute('autocapitalize', 'off');
    (el as HTMLInputElement).setAttribute('spellcheck', 'false');
  });
}