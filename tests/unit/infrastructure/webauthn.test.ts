/**
 * Die Herkunftsableitung für Passkeys (M9, FA-PASS-01).
 *
 * **Warum das eigene Tests bekommt, obwohl es drei Zeilen sind.** Ein falsches
 * `rpID` ist ein stiller Totalausfall: Passkeys lassen sich anlegen, aber nie
 * benutzen, und der Browser lehnt wortlos ab. Genau diese Klasse Fehler ist beim
 * Browsertest zu M9 aufgetreten — mit `127.0.0.1` als Adresse kam die Zeremonie
 * nie zustande, weil eine IP-Adresse als `rpID` unzulässig ist.
 */
import { describe, expect, it } from 'vitest';

import {
  expectedOrigin,
  isPasskeyCapableOrigin,
  parseUserHandle,
  relyingPartyId,
  userHandleFor,
} from '@/infrastructure/auth/webauthn';

describe('FA-PASS-01 Herkunft und Domain', () => {
  it('nimmt aus der Adresse nur die Domain', () => {
    expect(relyingPartyId('https://faktura.example.org')).toBe('faktura.example.org');
    expect(relyingPartyId('http://localhost:3000')).toBe('localhost');
  });

  it('normalisiert die Herkunft auf Schema, Domain und Anschluss', () => {
    // Ein abschließender Schrägstrich oder ein Pfad in `APP_URL` ergibt dieselbe
    // Herkunft, die der Browser sendet — sonst schlüge jede Prüfung fehl.
    expect(expectedOrigin('https://faktura.example.org/')).toBe('https://faktura.example.org');
    expect(expectedOrigin('http://localhost:3000/app')).toBe('http://localhost:3000');
  });

  it('erlaubt Passkeys nur im sicheren Kontext', () => {
    expect(isPasskeyCapableOrigin('https://faktura.example.org')).toBe(true);
    expect(isPasskeyCapableOrigin('http://localhost:3000')).toBe(true);
    expect(isPasskeyCapableOrigin('http://faktura.example.org')).toBe(false);
  });

  it('weist IP-Adressen ab, auch die des eigenen Rechners', () => {
    // Sicherer Kontext, aber als `rpID` unzulässig — der Knopf dürfte dort gar
    // nicht erst erscheinen.
    expect(isPasskeyCapableOrigin('http://127.0.0.1:3000')).toBe(false);
    expect(isPasskeyCapableOrigin('https://192.168.1.10')).toBe(false);
    expect(isPasskeyCapableOrigin('http://[::1]:3000')).toBe(false);
  });
});

describe('FA-PASS-06 Die Kennung im Passkey', () => {
  it('trennt die beiden Identitäten', () => {
    // Eine Mandanten- und eine Betreiberkennung könnten gleich lauten; ohne
    // Präfix führte ein Passkey in das falsche Konto.
    expect(userHandleFor('user', 'abc')).not.toBe(userHandleFor('admin', 'abc'));
    expect(parseUserHandle(userHandleFor('admin', 'abc'))).toEqual({ kind: 'admin', id: 'abc' });
  });

  it('weist an, was nicht von uns stammt', () => {
    expect(parseUserHandle('abc')).toBeNull();
    expect(parseUserHandle('root:abc')).toBeNull();
    expect(parseUserHandle('user:')).toBeNull();
  });
});
