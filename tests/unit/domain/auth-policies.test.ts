/**
 * Richtlinien der Authentifizierung (NFA-SEC-04, -05, -07, -08).
 *
 * Reine Funktionen — jeder Grenzfall ist ohne Datenbank, Uhr oder Kryptografie
 * prüfbar.
 */
import { describe, expect, it } from 'vitest';

import {
  clearFailedAttempts,
  isLocked,
  LOCKOUT_DURATION_MS,
  type LockoutState,
  MAX_FAILED_LOGINS,
  registerFailedAttempt,
  remainingLockoutMs,
} from '@/domain/auth/lockout-policy';
import {
  isPasswordAcceptable,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePassword,
} from '@/domain/auth/password-policy';
import {
  formatRecoveryCode,
  isWellFormedRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_COUNT,
} from '@/domain/auth/recovery-code';
import {
  computeSessionExpiry,
  isSessionExpired,
  SESSION_LIFETIME_MS,
  SESSION_TOUCH_INTERVAL_MS,
  shouldTouchSession,
} from '@/domain/auth/session-policy';
import {
  isWellFormedTotpCode,
  normalizeTotpCode,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
} from '@/domain/auth/totp-policy';

const never = (): boolean => false;
const always = (): boolean => true;

describe('Passwortrichtlinie (NFA-SEC-04)', () => {
  it('verlangt mindestens zwölf Zeichen', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validatePassword('kurz', never)).toEqual([
      { kind: 'TOO_SHORT', minLength: 12 },
    ]);
    expect(validatePassword('a'.repeat(11), never)).toHaveLength(1);
    expect(validatePassword('a'.repeat(12), never)).toEqual([]);
  });

  it('lehnt kompromittierte Passwörter ab', () => {
    expect(validatePassword('a'.repeat(20), always)).toEqual([{ kind: 'COMPROMISED' }]);
  });

  it('meldet alle Verstöße gemeinsam, nicht nur den ersten', () => {
    const violations = validatePassword('kurz', always);
    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.kind).sort()).toEqual([
      'COMPROMISED',
      'TOO_SHORT',
    ]);
  });

  it('begrenzt die Länge nach oben, um teures Hashing nicht angreifbar zu machen', () => {
    expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH), never)).toEqual([]);
    expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH + 1), never)).toEqual([
      { kind: 'TOO_LONG', maxLength: MAX_PASSWORD_LENGTH },
    ]);
  });

  it('fasst das Ergebnis als Ja/Nein zusammen', () => {
    expect(isPasswordAcceptable('ein-langes-passwort', never)).toBe(true);
    expect(isPasswordAcceptable('kurz', never)).toBe(false);
  });
});

describe('Sperre nach Fehlversuchen (NFA-SEC-08)', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const unlocked: LockoutState = { failedLogins: 0, lockedUntil: null };

  it('sperrt nach zehn Fehlversuchen für 15 Minuten', () => {
    expect(MAX_FAILED_LOGINS).toBe(10);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);

    let state = unlocked;
    for (let attempt = 1; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      state = registerFailedAttempt(state, now);
      expect(state.lockedUntil, `Versuch ${String(attempt)} darf noch nicht sperren`).toBeNull();
      expect(state.failedLogins).toBe(attempt);
    }

    state = registerFailedAttempt(state, now);
    expect(state.lockedUntil).toEqual(new Date(now.getTime() + LOCKOUT_DURATION_MS));
  });

  it('setzt den Zähler beim Sperren zurück, damit nach Ablauf nicht sofort erneut gesperrt wird', () => {
    const state = registerFailedAttempt({ failedLogins: 9, lockedUntil: null }, now);
    expect(state.failedLogins).toBe(0);
  });

  it('erkennt eine laufende Sperre und ihr Ende', () => {
    const lockedUntil = new Date(now.getTime() + 60_000);
    expect(isLocked({ failedLogins: 0, lockedUntil }, now)).toBe(true);
    expect(isLocked({ failedLogins: 0, lockedUntil }, new Date(now.getTime() + 60_000))).toBe(false);
    expect(isLocked(unlocked, now)).toBe(false);
  });

  it('gibt die verbleibende Sperrdauer an', () => {
    const lockedUntil = new Date(now.getTime() + 90_000);
    expect(remainingLockoutMs({ failedLogins: 0, lockedUntil }, now)).toBe(90_000);
    expect(remainingLockoutMs(unlocked, now)).toBe(0);
    expect(
      remainingLockoutMs({ failedLogins: 0, lockedUntil }, new Date(now.getTime() + 120_000)),
    ).toBe(0);
  });

  it('räumt den Zustand nach erfolgreicher Anmeldung ab', () => {
    expect(clearFailedAttempts()).toEqual({ failedLogins: 0, lockedUntil: null });
  });
});

describe('Sitzungsrichtlinie (NFA-SEC-07)', () => {
  const now = new Date('2026-08-10T12:00:00Z');

  it('läuft nach sieben Tagen ab', () => {
    expect(SESSION_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(computeSessionExpiry(now)).toEqual(new Date(now.getTime() + SESSION_LIFETIME_MS));
  });

  it('erkennt den Ablauf einschließlich des Grenzpunkts', () => {
    const expiresAt = new Date(now.getTime() + 1000);
    expect(isSessionExpired(expiresAt, now)).toBe(false);
    expect(isSessionExpired(expiresAt, new Date(now.getTime() + 1000))).toBe(true);
    expect(isSessionExpired(expiresAt, new Date(now.getTime() + 2000))).toBe(true);
  });

  it('schreibt den Aktivitätszeitpunkt nur in Abständen fort', () => {
    expect(shouldTouchSession(now, now)).toBe(false);
    expect(
      shouldTouchSession(now, new Date(now.getTime() + SESSION_TOUCH_INTERVAL_MS - 1)),
    ).toBe(false);
    expect(shouldTouchSession(now, new Date(now.getTime() + SESSION_TOUCH_INTERVAL_MS))).toBe(true);
  });
});

describe('TOTP-Richtlinie (NFA-SEC-05)', () => {
  it('nutzt sechsstellige Codes im 30-Sekunden-Takt', () => {
    expect(TOTP_DIGITS).toBe(6);
    expect(TOTP_PERIOD_SECONDS).toBe(30);
  });

  it('entfernt die Gruppierung, wie Apps sie anzeigen', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
    expect(normalizeTotpCode(' 123456 ')).toBe(' 123456 '.replace(/[\s-]/g, ''));
  });

  it('erkennt gültige und ungültige Codeformate', () => {
    expect(isWellFormedTotpCode('123456')).toBe(true);
    expect(isWellFormedTotpCode('123 456')).toBe(true);
    expect(isWellFormedTotpCode('12345')).toBe(false);
    expect(isWellFormedTotpCode('1234567')).toBe(false);
    expect(isWellFormedTotpCode('abcdef')).toBe(false);
  });
});

describe('Wiederherstellungscodes (NFA-SEC-05)', () => {
  it('werden zu zehn Stück ausgegeben', () => {
    expect(RECOVERY_CODE_COUNT).toBe(10);
  });

  it('meidet leicht verwechselbare Zeichen', () => {
    for (const character of ['I', 'O', 'U', '0', '1']) {
      expect(RECOVERY_CODE_ALPHABET, `${character} sollte nicht enthalten sein`).not.toContain(
        character,
      );
    }
  });

  it('gruppiert zu vier Blöcken', () => {
    expect(formatRecoveryCode('ABCDEFGHJKLMNPQR')).toBe('ABCD-EFGH-JKLM-NPQR');
  });

  it('normalisiert Eingaben unabhängig von Schreibweise und Trennern', () => {
    expect(normalizeRecoveryCode('abcd-efgh jklm-npqr')).toBe('ABCDEFGHJKLMNPQR');
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isWellFormedRecoveryCode('ABCD-EFGH-JKLM-NPQR')).toBe(true);
    expect(isWellFormedRecoveryCode('abcd efgh jklm npqr')).toBe(true);
    expect(isWellFormedRecoveryCode('ABCD-EFGH-JKLM')).toBe(false);
    // Enthält die ausgeschlossenen Zeichen O und I.
    expect(isWellFormedRecoveryCode('ABCO-EFGI-JKLM-NPQR')).toBe(false);
  });
});
