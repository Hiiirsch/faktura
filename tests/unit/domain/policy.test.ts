/**
 * FA-UI-14 — Sichtbarkeit und Aktivierung aller Aktionen laufen über eine
 * zentrale `can()`-Funktion.
 *
 * Der Test hält zwei Dinge fest: dass die Funktion heute jede vorgesehene
 * Handlung erlaubt (V1 kennt keine Rollen) und dass sie trotzdem eine Aussage
 * trifft — sie unterscheidet, welche Handlung zu welchem Gegenstand gehört.
 * Eine Funktion, die bedingungslos `true` liefert, wäre keine Anlaufstelle für
 * ein späteres Rollenmodell, sondern eine Attrappe.
 */
import { describe, expect, it } from 'vitest';

import { can } from '@/domain/policy/can';

describe('can()', () => {
  it('erlaubt in V1 jede vorgesehene Handlung', () => {
    expect(can('create', 'invoice')).toBe(true);
    expect(can('issue', 'invoice')).toBe(true);
    expect(can('cancel', 'invoice')).toBe(true);
    expect(can('recordPayment', 'invoice')).toBe(true);
    expect(can('create', 'customer')).toBe(true);
    expect(can('archive', 'customer')).toBe(true);
    expect(can('update', 'companyProfile')).toBe(true);
  });

  it('weist Handlungen ab, die zum Gegenstand nicht gehören', () => {
    // Ein Kunde wird nicht festgeschrieben und nicht storniert.
    expect(can('issue', 'customer')).toBe(false);
    expect(can('cancel', 'customer')).toBe(false);
    // Kunden und Katalogeinträge werden archiviert, nie gelöscht (Spec §4.1).
    expect(can('delete', 'customer')).toBe(false);
    expect(can('delete', 'catalogItem')).toBe(false);
    // Das Firmenprofil entsteht mit der Organisation und wird nur gepflegt.
    expect(can('create', 'companyProfile')).toBe(false);
    expect(can('delete', 'companyProfile')).toBe(false);
    // Der Nummernkreis wird eingestellt, nicht angelegt oder entfernt.
    expect(can('create', 'numbering')).toBe(false);
    expect(can('archive', 'numbering')).toBe(false);
  });
});
