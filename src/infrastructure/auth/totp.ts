/**
 * Zeitbasierte Einmalkennwörter (NFA-SEC-05, Spec §11.1).
 *
 * `otpauth` bringt keine eigenen Abhängigkeiten mit und arbeitet vollständig
 * lokal — es entsteht kein Netzwerkverkehr (NFA-COMP-05).
 */
import { Secret, TOTP } from 'otpauth';

import {
  normalizeTotpCode,
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW,
} from '@/domain/auth/totp-policy';

/** 160 Bit Geheimnis, wie in RFC 4226 für SHA-1 empfohlen. */
const TOTP_SECRET_BYTES = 20;

function createTotp(secretBase32: string, accountLabel: string, issuer: string): TOTP {
  return new TOTP({
    issuer,
    label: accountLabel,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: TOTP_SECRET_BYTES }).base32;
}

/**
 * Erzeugt die `otpauth://`-URI, die als QR-Code angezeigt wird. Sie enthält das
 * Geheimnis und darf deshalb nie protokolliert werden (NFA-BETR-10).
 */
export function buildTotpUri(secretBase32: string, accountLabel: string, issuer: string): string {
  return createTotp(secretBase32, accountLabel, issuer).toString();
}

/**
 * Prüft einen eingegebenen Code. Toleriert ein Zeitfenster in jede Richtung,
 * um Uhrenversatz zwischen Telefon und Server auszugleichen.
 */
export function verifyTotpCode(secretBase32: string, code: string, issuer: string): boolean {
  const normalized = normalizeTotpCode(code);
  const totp = createTotp(secretBase32, 'verify', issuer);
  return totp.validate({ token: normalized, window: TOTP_WINDOW }) !== null;
}
