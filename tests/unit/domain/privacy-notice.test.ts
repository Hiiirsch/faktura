/**
 * Die Datenschutzhinweise gegen die Wirklichkeit (M13, NFA-COMP-08).
 *
 * **Warum dieser Test der eigentliche Punkt des Bausteins ist.** Eine
 * Datenschutzerklärung nennt Fristen. Schreibt man sie als Zahl in einen Text,
 * gibt es zwei Wahrheiten — und die zweite ist die, die nach einer Änderung
 * nicht mehr stimmt. Eine Erklärung, die neben der Wirklichkeit herläuft, ist
 * schlimmer als keine: Sie ist eine Zusage, die niemand hält.
 *
 * Hier wird deshalb geprüft, dass jede genannte Frist **die Konstante ist**,
 * die der Code auch anwendet. Wer eine Sitzung auf 14 Tage verlängert und die
 * Auskunft vergisst, kommt hier nicht vorbei.
 *
 * Dieselbe Bauart wie `template-variables.test.ts`, wo die Referenz gegen den
 * tatsächlichen Gültigkeitsbereich der Engine gehalten wird.
 */
import { describe, expect, it } from 'vitest';

import { INVITATION_TTL_MS } from '@/domain/auth/invitation-policy';
import { LOCKOUT_DURATION_MS, MAX_FAILED_LOGINS } from '@/domain/auth/lockout-policy';
import { PASSWORD_RESET_TTL_MS } from '@/domain/auth/password-reset-policy';
import { PENDING_LOGIN_TTL_MS } from '@/domain/auth/pending-login-policy';
import { SESSION_LIFETIME_MS } from '@/domain/auth/session-policy';
import { TRUSTED_DEVICE_TTL_MS } from '@/domain/auth/trusted-device-policy';
import {
  formatRetention,
  PRIVACY_ASSURANCES,
  STORED_DATA,
} from '@/domain/legal/privacy-notice';

function retentionOf(fragment: string): number | null {
  const datum = STORED_DATA.find((entry) => entry.subject.includes(fragment));
  if (datum === undefined) {
    throw new Error(`Keine Angabe zu „${fragment}" in den Datenschutzhinweisen`);
  }
  return datum.retentionMs;
}

describe('NFA-COMP-08 Die Fristen stammen aus der Domäne', () => {
  it('nennt für die Sitzung die Lebensdauer der Sitzung', () => {
    expect(retentionOf('Sitzung')).toBe(SESSION_LIFETIME_MS);
  });

  it('nennt für den zweiten Anmeldeschritt dessen Frist', () => {
    expect(retentionOf('Anmeldeschritt')).toBe(PENDING_LOGIN_TTL_MS);
  });

  it('nennt für das vertraute Gerät dessen Frist', () => {
    expect(retentionOf('Vertrautes Gerät')).toBe(TRUSTED_DEVICE_TTL_MS);
  });

  it('nennt für Einladung und Zurücksetzung ihre Fristen', () => {
    expect(retentionOf('Einladung')).toBe(INVITATION_TTL_MS);
    expect(retentionOf('Zurücksetzung')).toBe(PASSWORD_RESET_TTL_MS);
  });

  it('nennt für die Sperre ihre Dauer und die Zahl der Versuche', () => {
    expect(retentionOf('Fehlversuche')).toBe(LOCKOUT_DURATION_MS);

    const datum = STORED_DATA.find((entry) => entry.subject.includes('Fehlversuche'));
    expect(datum?.retentionNote).toContain(String(MAX_FAILED_LOGINS));
  });

  it('nennt zu jeder Angabe einen Zweck — Art. 13 verlangt beides', () => {
    for (const datum of STORED_DATA) {
      expect(datum.purpose.length).toBeGreaterThan(0);
    }
  });

  it('erklärt jede Angabe ohne Frist, statt sie offenzulassen', () => {
    // „Ohne Frist" allein wäre keine Auskunft, sondern eine Lücke.
    for (const datum of STORED_DATA.filter((entry) => entry.retentionMs === null)) {
      expect(datum.retentionNote ?? '').not.toBe('');
    }
  });

  it('führt die Zusagen des Katalogs auf', () => {
    const text = PRIVACY_ASSURANCES.join(' ');

    expect(text).toContain('keine Daten an Dritte'); // NFA-COMP-05
    expect(text).toContain('Analysedienste'); // NFA-COMP-06
    expect(text).toContain('unveränderlich'); // NFA-COMP-02
    expect(text).toContain('Cookies');
  });
});

describe('formatRetention', () => {
  it('setzt Tage, Stunden und Minuten in deutscher Form', () => {
    expect(formatRetention(SESSION_LIFETIME_MS)).toBe('7 Tage');
    expect(formatRetention(TRUSTED_DEVICE_TTL_MS)).toBe('30 Tage');
    expect(formatRetention(PASSWORD_RESET_TTL_MS)).toBe('1 Tag');
    expect(formatRetention(PENDING_LOGIN_TTL_MS)).toBe('5 Minuten');
    expect(formatRetention(LOCKOUT_DURATION_MS)).toBe('15 Minuten');
  });

  it('sagt „1 Stunde", nicht „1 Stunden"', () => {
    expect(formatRetention(60 * 60 * 1000)).toBe('1 Stunde');
    expect(formatRetention(2 * 60 * 60 * 1000)).toBe('2 Stunden');
    expect(formatRetention(60 * 1000)).toBe('1 Minute');
  });
});
