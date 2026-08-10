/**
 * Ergebnistyp der Domain-Schicht. Fachliche Fehlschläge werden als Wert
 * zurückgegeben, nicht geworfen — nur so lassen sich Validierungspfade
 * vollständig testen (FA-CALC-10).
 */
import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, ok, unwrap } from '@/domain/shared/result';

describe('Result', () => {
  it('trägt einen Erfolgswert', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    expect(unwrap(result)).toBe(42);
  });

  it('trägt einen Fehlerwert', () => {
    const result = err({ kind: 'EMPTY' });
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
    if (isErr(result)) {
      expect(result.error.kind).toBe('EMPTY');
    }
  });

  it('wirft beim Entpacken eines Fehlers', () => {
    expect(() => unwrap(err({ kind: 'MALFORMED' }))).toThrow(/MALFORMED/);
  });
});
