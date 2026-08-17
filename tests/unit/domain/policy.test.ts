/**
 * Die zentrale Berechtigungsfrage (FA-UI-14, FA-ROLE-01, -06).
 *
 * Bis M7 war `can()` eine Attrappe mit einer echten Aufgabe: Sie prüfte, ob
 * eine Handlung zum Gegenstand **passt**, und lieferte sonst immer `true`. Seit
 * M8 prüft sie zusätzlich, ob der Akteur das Recht **hält** — und damit hängt an
 * ihr die Sichtbarkeit jeder Aktion in der Oberfläche.
 *
 * Zwei Zusagen sind hier besonders zu prüfen:
 *
 * - **Der Katalog ist geschlossen** (FA-ROLE-06): Ein unbekannter Schlüssel
 *   gewährt nichts. Nur deshalb braucht die Datenbank keine
 *   Fremdschlüsselprüfung auf den Katalog.
 * - **Der Katalog ist abgeleitet**, nicht danebengestellt: Er entsteht aus
 *   derselben Tabelle, die sagt, welche Handlung zu welchem Gegenstand passt.
 *   Ein zweites Verzeichnis wäre die erste Stelle, an der beide auseinanderlaufen.
 */
import { describe, expect, it } from 'vitest';

import {
  actorOf,
  ALL_PERMISSION_KEYS,
  BASE_PERMISSIONS,
  can,
  isPermissionKey,
  omnipotentActor,
  PERMITTED,
} from '@/domain/policy/can';

describe('FA-ROLE-06 Der Katalog ist geschlossen und abgeleitet', () => {
  it('enthält genau die Kombinationen aus der Handlungstabelle', () => {
    const fromTable = Object.entries(PERMITTED).flatMap(([subject, actions]) =>
      actions.map((action) => `${subject}.${action}`),
    );

    expect([...ALL_PERMISSION_KEYS].sort()).toEqual([...fromTable].sort());
  });

  it('erkennt gültige Schlüssel und verwirft alles andere', () => {
    expect(isPermissionKey('invoice.issue')).toBe(true);
    expect(isPermissionKey('organization.administer')).toBe(true);

    // Die Handlung passt nicht zum Gegenstand: Ein Beleg wird nicht archiviert.
    expect(isPermissionKey('invoice.archive')).toBe(false);
    // Frei erfunden.
    expect(isPermissionKey('invoice.destroy')).toBe(false);
    expect(isPermissionKey('')).toBe(false);
    expect(isPermissionKey('invoice')).toBe(false);
  });

  it('gewährt ein unbekannter Schlüssel nichts', () => {
    // Genau diese Eigenschaft ersetzt die Fremdschlüsselprüfung in der
    // Datenbank: Ein Tippfehler in einer Rolle erweitert keine Rechte.
    const actor = actorOf(['invoice.destroy', 'alles', 'invoice.archive']);

    expect(actor.permissions.has('invoice.issue')).toBe(false);
    // Übrig bleiben ausschließlich die Grundrechte.
    expect([...actor.permissions].sort()).toEqual([...BASE_PERMISSIONS].sort());
  });
});

describe('Grundrechte', () => {
  it('trägt jedes Konto ohne Rolle die Grundrechte', () => {
    const actor = actorOf([]);

    // Den Namen des eigenen Arbeitgebers zu kennen und das eigene Passwort zu
    // ändern sind keine Rechtefragen.
    expect(can(actor, 'read', 'companyProfile')).toBe(true);
    expect(can(actor, 'update', 'security')).toBe(true);
  });

  it('gehören Firmendaten zu ändern und Belege zu lesen nicht dazu', () => {
    const actor = actorOf([]);

    expect(can(actor, 'update', 'companyProfile')).toBe(false);
    expect(can(actor, 'read', 'invoice')).toBe(false);
  });
});

describe('FA-UI-14 Die Frage nach der Berechtigung', () => {
  it('verlangt beides: passende Handlung und gehaltenes Recht', () => {
    const actor = actorOf(['invoice.issue']);

    expect(can(actor, 'issue', 'invoice')).toBe(true);
    // Recht nicht gehalten.
    expect(can(actor, 'cancel', 'invoice')).toBe(false);
  });

  it('weist eine Handlung ab, die zum Gegenstand nicht passt', () => {
    // Auch mit allen Rechten: Ein Kunde wird nicht festgeschrieben.
    const actor = omnipotentActor();

    expect(can(actor, 'issue', 'customer')).toBe(false);
    expect(can(actor, 'archive', 'invoice')).toBe(false);
    expect(can(actor, 'recordPayment', 'catalogItem')).toBe(false);
  });

  it('erlaubt mit allen Rechten jede vorgesehene Handlung', () => {
    const actor = omnipotentActor();

    for (const [subject, actions] of Object.entries(PERMITTED)) {
      for (const action of actions) {
        expect(
          can(actor, action, subject as Parameters<typeof can>[2]),
          `${subject}.${action}`,
        ).toBe(true);
      }
    }
  });

  it('trennt Vorlagen von den Firmendaten', () => {
    // Bis M7 behalf sich die Vorlagenseite mit `companyProfile.update` — zwei
    // verschiedene Dinge unter einem Recht.
    const actor = actorOf(['template.update']);

    expect(can(actor, 'update', 'template')).toBe(true);
    expect(can(actor, 'update', 'companyProfile')).toBe(false);
  });

  it('kennt den Datenexport und die Rechteverwaltung als eigene Rechte', () => {
    expect(can(actorOf(['export.run']), 'run', 'export')).toBe(true);
    expect(can(actorOf([]), 'run', 'export')).toBe(false);

    expect(can(actorOf(['organization.administer']), 'administer', 'organization')).toBe(true);
    expect(can(actorOf(['invoice.issue']), 'administer', 'organization')).toBe(false);
  });
});
