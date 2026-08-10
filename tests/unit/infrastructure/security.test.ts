/**
 * Kryptografische Bausteine und Sicherheits-Header
 * (NFA-SEC-03, -06, -07, -10, -17).
 */
import { describe, expect, it } from 'vitest';

import {
  compromisedPasswordCount,
  isCompromisedPassword,
} from '@/infrastructure/auth/compromised-passwords';
import { hashPassword, verifyPassword } from '@/infrastructure/auth/password-hasher';
import {
  clearedSessionCookieOptions,
  isSecureContext,
  sessionCookieOptions,
} from '@/infrastructure/auth/session-cookie';
import {
  constantTimeEquals,
  generateCsrfToken,
  generateRecoveryCodeRaw,
  generateSessionToken,
  hashToken,
  SESSION_TOKEN_BYTES,
} from '@/infrastructure/auth/tokens';
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from '@/infrastructure/auth/totp';
import { isSameOrigin } from '@/infrastructure/security/csrf';
import { isValidCsrfPair } from '@/infrastructure/security/csrf-verify';
import { buildSecurityHeaders } from '@/infrastructure/security/security-headers';

describe('Argon2id (NFA-SEC-03)', () => {
  it('nutzt Argon2id mit 64 MB Speicher und drei Iterationen', async () => {
    const hash = await hashPassword('ein hinreichend langes Passwort');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=65536');
    expect(hash).toContain('t=3');
    expect(hash).toContain('p=1');
  });

  it('prüft richtige und falsche Passwörter', async () => {
    const hash = await hashPassword('ein hinreichend langes Passwort');
    expect(await verifyPassword(hash, 'ein hinreichend langes Passwort')).toBe(true);
    expect(await verifyPassword(hash, 'etwas anderes')).toBe(false);
  });

  it('erzeugt für dasselbe Passwort unterschiedliche Hashes (Salt)', async () => {
    const [first, second] = await Promise.all([hashPassword('gleiches'), hashPassword('gleiches')]);
    expect(first).not.toBe(second);
  });

  it('meldet einen unbrauchbaren Hash als Nichtübereinstimmung, statt zu werfen', async () => {
    expect(await verifyPassword('kein-gültiger-hash', 'irgendwas')).toBe(false);
  });
});

describe('Sitzungstoken (NFA-SEC-06)', () => {
  it('hat mindestens 256 Bit Entropie', () => {
    expect(SESSION_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(256);
    // base64url von 32 Byte ergibt 43 Zeichen ohne Auffüllung.
    expect(generateSessionToken()).toHaveLength(43);
  });

  it('erzeugt bei jedem Aufruf ein anderes Token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateSessionToken()));
    expect(tokens.size).toBe(200);
  });

  it('legt nur den Hash ab, aus dem sich das Token nicht ableiten lässt', () => {
    const token = generateSessionToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });

  it('erzeugt CSRF-Token mit ausreichender Länge', () => {
    expect(generateCsrfToken().length).toBeGreaterThanOrEqual(43);
  });

  it('erzeugt Wiederherstellungscodes aus dem vorgesehenen Alphabet', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(generateRecoveryCodeRaw()).toMatch(/^[ABCDEFGHJKLMNPQRSTVWXYZ23456789]{16}$/);
    }
  });
});

describe('constantTimeEquals', () => {
  it('vergleicht inhaltlich korrekt', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});

describe('Sitzungscookie (NFA-SEC-07)', () => {
  it('ist HttpOnly, SameSite=Lax und pfadweit gültig', () => {
    const expiresAt = new Date('2026-08-17T12:00:00Z');
    const options = sessionCookieOptions(expiresAt, 'https://rechnung.example.org');

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.expires).toEqual(expiresAt);
  });

  it('setzt Secure, sobald die Anwendung über HTTPS ausgeliefert wird', () => {
    expect(isSecureContext('https://rechnung.example.org')).toBe(true);
    expect(sessionCookieOptions(new Date(), 'https://rechnung.example.org').secure).toBe(true);
    // Ohne diese Ausnahme wäre die Anmeldung im lokalen Betrieb unmöglich.
    expect(isSecureContext('http://localhost:3000')).toBe(false);
  });

  it('löscht das Cookie beim Abmelden', () => {
    const options = clearedSessionCookieOptions('https://rechnung.example.org');
    expect(options.maxAge).toBe(0);
    expect(options.httpOnly).toBe(true);
  });
});

describe('CSRF-Schutz (NFA-SEC-10)', () => {
  it('akzeptiert nur ein übereinstimmendes Paar aus Cookie und Formularfeld', () => {
    expect(isValidCsrfPair('token-abc', 'token-abc')).toBe(true);
    expect(isValidCsrfPair('token-abc', 'token-xyz')).toBe(false);
  });

  it('lehnt fehlende oder leere Werte ab', () => {
    expect(isValidCsrfPair(undefined, 'token')).toBe(false);
    expect(isValidCsrfPair('token', undefined)).toBe(false);
    expect(isValidCsrfPair('', '')).toBe(false);
    expect(isValidCsrfPair('token', 42)).toBe(false);
    expect(isValidCsrfPair('token', null)).toBe(false);
  });

  it('prüft die Herkunft gegen die konfigurierte Basis-URL', () => {
    const appUrl = 'https://rechnung.example.org';
    expect(isSameOrigin('https://rechnung.example.org', appUrl)).toBe(true);
    expect(isSameOrigin('https://rechnung.example.org:443', appUrl)).toBe(true);
    expect(isSameOrigin('https://angreifer.example.com', appUrl)).toBe(false);
    expect(isSameOrigin('http://rechnung.example.org', appUrl)).toBe(false);
  });

  it('lehnt eine fehlende oder unlesbare Herkunftsangabe ab', () => {
    const appUrl = 'https://rechnung.example.org';
    expect(isSameOrigin(null, appUrl)).toBe(false);
    expect(isSameOrigin('', appUrl)).toBe(false);
    expect(isSameOrigin('kein-uri', appUrl)).toBe(false);
  });
});

describe('Sicherheits-Header (NFA-SEC-17)', () => {
  const production = buildSecurityHeaders({ nonce: 'TESTNONCE', isDevelopment: false });

  it('setzt alle geforderten Header', () => {
    expect(production['X-Content-Type-Options']).toBe('nosniff');
    expect(production['X-Frame-Options']).toBe('DENY');
    expect(production['Referrer-Policy']).toBe('no-referrer');
    expect(production['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(production['Strict-Transport-Security']).toContain('preload');
    expect(production['Content-Security-Policy']).toBeDefined();
  });

  it('erlaubt Skripte nur mit Nonce, nie über unsafe-inline', () => {
    const csp = production['Content-Security-Policy'] ?? '';
    expect(csp).toContain("script-src 'self' 'nonce-TESTNONCE' 'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('sperrt Einbettung und Basis-URI', () => {
    const csp = production['Content-Security-Policy'] ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it('setzt HSTS im Entwicklungsbetrieb nicht, um HTTPS dort nicht zu erzwingen', () => {
    const development = buildSecurityHeaders({ nonce: 'N', isDevelopment: true });
    expect(development['Strict-Transport-Security']).toBeUndefined();
    expect(development['Content-Security-Policy']).toContain('unsafe-eval');
  });
});

describe('TOTP (NFA-SEC-05)', () => {
  it('erzeugt ein Base32-Geheimnis', () => {
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('baut eine otpauth-URI mit Aussteller und Konto', () => {
    const uri = buildTotpUri(generateTotpSecret(), 'buchhaltung@example.org', 'Faktura');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('issuer=Faktura');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  it('weist einen falschen Code zurück', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, '000000', 'Faktura')).toBe(false);
    expect(verifyTotpCode(secret, 'keine-zahl', 'Faktura')).toBe(false);
  });
});

describe('Liste kompromittierter Passwörter (NFA-SEC-04)', () => {
  it('enthält die bekannten Massenpasswörter', () => {
    expect(isCompromisedPassword('123456')).toBe(true);
    expect(isCompromisedPassword('password')).toBe(true);
    expect(isCompromisedPassword('qwerty')).toBe(true);
  });

  it('erkennt auch die reine Großschreibvariante', () => {
    expect(isCompromisedPassword('Password')).toBe(true);
    expect(isCompromisedPassword('PASSWORD')).toBe(true);
  });

  it('lässt ein unauffälliges Passwort durch', () => {
    expect(isCompromisedPassword('Zwetschgenkuchen-mit-Streuseln-7')).toBe(false);
  });

  it('lädt die vollständige Liste', () => {
    expect(compromisedPasswordCount()).toBeGreaterThanOrEqual(99_000);
  });
});
