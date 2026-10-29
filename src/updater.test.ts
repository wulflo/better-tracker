import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './updater';

describe('detección de versiones', () => {
  it('detecta la actualización de 0.9.3 a 0.9.4', () => {
    expect(isNewerVersion('0.9.4', '0.9.3')).toBe(true);
    expect(isNewerVersion('0.9.3', '0.9.4')).toBe(false);
  });

  it('compara componentes numéricos, no cadenas', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.9.10', '0.9.9')).toBe(true);
  });

  it('ignora prefijos v y sufijos de revisión', () => {
    expect(isNewerVersion('v0.9.4', '0.9.3')).toBe(true);
    expect(isNewerVersion('0.9.4-1', '0.9.4')).toBe(false);
    expect(isNewerVersion('0.9.4+linux', '0.9.4')).toBe(false);
  });

  it('trata versiones incompletas como ceros', () => {
    expect(isNewerVersion('1', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.9', '0.9.0')).toBe(false);
  });
});
