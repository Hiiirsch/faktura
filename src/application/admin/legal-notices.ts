/**
 * Impressum und Datenschutzzusatz des Betreibers (M13, NFA-COMP-07, -08).
 *
 * **Wem diese Angaben gehören.** Beim Logo und beim Briefpapier gilt „gehört
 * dem Mandanten", weil der Beleg ein Dokument seines Ausstellers ist. Hier ist
 * es umgekehrt: Das Telemedium bietet an, wer die Installation betreibt. Bei
 * drei Mandanten gäbe es sonst keine Antwort auf die Frage, wessen Impressum
 * unter `/impressum` steht.
 *
 * **Faktura liefert keinen Inhalt.** Was hier steht, ist eine Aussage des
 * Betreibers über sich selbst — die Anwendung stellt sie nicht auf und prüft
 * sie nicht. Sie sorgt nur dafür, dass sie erreichbar ist.
 */
import type { PlatformContext } from '@/infrastructure/repositories/platform-context';
import {
  findPlatformSettings,
  savePlatformSettings,
  type PlatformSettingsView,
} from '@/infrastructure/repositories/platform-repository';
import { createPlatformAuditRow } from '@/infrastructure/repositories/platform-repository';

export type { PlatformSettingsView };

/**
 * Liest die Angaben — **ohne Nachweis**, und das ist Absicht.
 *
 * Die öffentlichen Seiten müssen ohne jede Sitzung antworten; ein Impressum
 * hinter einer Anmeldung wäre keins. Dieselbe Art Ausnahme wie `pingDatabase()`
 * für den Healthcheck: Was hier herauskommt, ist ohnehin für jeden bestimmt.
 */
export async function getLegalNotices(): Promise<PlatformSettingsView> {
  return findPlatformSettings();
}

/** Leert Leerräume zu `null` — „nur Leerzeichen" ist kein hinterlegter Text. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Schreibt die Angaben — **nur mit Nachweis**, und protokolliert.
 *
 * Der Vorgang steht ausschließlich im Protokoll der **Verwaltung**: Er hat
 * keinen Bezug zu einem Unternehmen, und in dessen Protokoll hätte er keinen
 * Platz. Deshalb `createPlatformAuditRow` und nicht `recordPlatformAuditEntry`,
 * das beide Seiten bedient und eine Organisation verlangt.
 *
 * Der Inhalt selbst steht **nicht** im Protokoll — es genügt, dass jemand ihn
 * geändert hat und wann. Ein Impressum in dreißig Versionen im Protokoll
 * abzulegen hilft niemandem.
 */
export async function saveLegalNotices(
  platform: PlatformContext,
  values: { readonly imprint: string; readonly privacyAddendum: string },
  ipAddress: string | null,
): Promise<void> {
  const imprint = orNull(values.imprint);
  const privacyAddendum = orNull(values.privacyAddendum);

  await savePlatformSettings(platform, { imprint, privacyAddendum });

  await createPlatformAuditRow(platform, {
    organizationId: null,
    entityType: 'PlatformSettings',
    entityId: 'platform',
    action: 'UPDATED',
    ipAddress,
    detailsJson: JSON.stringify({
      imprint: imprint === null ? 'entfernt' : 'gesetzt',
      privacyAddendum: privacyAddendum === null ? 'entfernt' : 'gesetzt',
    }),
  });
}
