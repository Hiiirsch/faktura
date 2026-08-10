/**
 * Ergebnistyp für Operationen, die fachlich scheitern können, ohne dass das ein
 * Programmierfehler wäre — etwa das Parsen einer Benutzereingabe.
 *
 * Ausnahmen bleiben den Verletzungen von Invarianten vorbehalten.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Entpackt ein Ergebnis oder wirft. Nur dort verwenden, wo der Fehlerfall bereits
 * ausgeschlossen ist — etwa bei Literalen in Tests oder Seed-Daten.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw new Error(`Erwartetes Ergebnis war fehlerhaft: ${JSON.stringify(result.error)}`);
}
