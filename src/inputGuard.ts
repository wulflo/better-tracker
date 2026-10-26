// Permite pegar solo texto sin formato; bloquea archivos, HTML rico y arrastre.

function hardenField(el: Element): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('spellcheck', 'false');
  }
}

function hardenTree(root: ParentNode): void {
  if (root instanceof Element) hardenField(root);
  root.querySelectorAll?.('input, textarea').forEach(hardenField);
}

export function installInputGuard(): void {
  // Allow only plain-text paste. Rich HTML, files and images are discarded.
  document.addEventListener('paste', (e: ClipboardEvent) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      e.preventDefault();
      let text = cd.getData('text/plain');
      // Single-line inputs must not receive newlines from pasted text.
      if (target.tagName === 'INPUT') text = text.replace(/[\r\n]+/g, ' ');
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const next = target.value.slice(0, start) + text + target.value.slice(end);
      // Use the native setter so React's onChange / value tracker sees the change.
      const proto = target.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(target, next);
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

  // Apply hardening to inputs rendered later by React.
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof Element) hardenTree(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  hardenTree(document);
}
