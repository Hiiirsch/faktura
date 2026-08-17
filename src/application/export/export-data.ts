/**
 * Vollständiger Datenexport (NFA-COMP-03).
 *
 * **Wozu er da ist.** Die Anwendung läuft auf einem eigenen Server, und die
 * Daten darin sind die Buchhaltung eines Unternehmens. Wer sie einem anderen
 * Programm übergeben, an den Steuerberater weiterreichen oder schlicht
 * nachsehen will, was gespeichert ist, soll das können, ohne die Datenbank zu
 * öffnen. Der Export ist die Antwort auf „gehört das hier eigentlich mir".
 *
 * **Warum JSON und nicht CSV.** Ein Beleg ist keine Tabellenzeile: Er hat
 * Positionen, Zahlungen und zwei eingefrorene Snapshots. In CSV zerfällt er in
 * mehrere Dateien, deren Zusammenhang nur noch über Kennungen besteht — ein
 * Export, den man vor dem Lesen erst wieder zusammensetzen muss. JSON hält den
 * Beleg beisammen und ist ebenso maschinenlesbar.
 *
 * **Was drin ist und was nicht.** Drin: Firmenstammdaten, Kunden, Katalog,
 * Belege mit Positionen und Zahlungen, Vorlagen, Nummernkreise und das
 * Protokoll. Nicht drin: Konten, Passworthashes, Sitzungen, TOTP-Geheimnisse
 * und Wiederherstellungscodes. Das ist keine Auslassung — ein Export ist ein
 * Dokument, das weitergereicht wird, und Zugangsdaten gehören dort nicht
 * hinein. Wer den ganzen Bestand braucht, nimmt die Sicherung (NFA-BETR-05).
 *
 * Die abgelegten PDF-Dateien sind ebenfalls nicht enthalten: Sie stecken in
 * der Sicherung, und ein Export mit eingebetteten Binärdaten wäre weder
 * lesbar noch klein.
 */
import type { Authorized } from '@/application/auth/authorize';
import { logger } from '@/infrastructure/logging/logger';
import { listAuditEntries } from '@/infrastructure/repositories/audit-repository';
import { listCatalogItems } from '@/infrastructure/repositories/catalog-repository';
import { findCompanyProfile } from '@/infrastructure/repositories/company-repository';
import { listCustomers } from '@/infrastructure/repositories/customer-repository';
import { listInvoicesForExport } from '@/infrastructure/repositories/invoice-repository';
import { listSequencesWithPrefix } from '@/infrastructure/repositories/number-sequence-repository';
import { listTemplates } from '@/infrastructure/repositories/template-repository';

/**
 * Fassung des Exportformats.
 *
 * Sie steht ganz oben in der Datei, damit ein Leseprogramm sie findet, bevor
 * es rät. Ändert sich der Aufbau, zählt sie hoch — das ist billiger als
 * später zu erraten, aus welcher Zeit eine Datei stammt.
 */
export const EXPORT_FORMAT_VERSION = 1;

export type DataExport = {
  readonly formatVersion: number;
  readonly exportedAt: string;
  readonly organizationId: string;
  readonly company: unknown;
  readonly customers: readonly unknown[];
  readonly catalogItems: readonly unknown[];
  readonly invoices: readonly unknown[];
  readonly templates: readonly unknown[];
  readonly numberSequences: readonly unknown[];
  readonly auditLog: readonly unknown[];
};

/** Der Dateiname trägt den Zeitpunkt — sortierbar wie bei der Sicherung. */
export function exportFileName(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/gu, '-').replace(/-\d{3}Z$/u, 'Z');
  return `faktura-export-${stamp}.json`;
}

export async function exportOrganizationData(
  context: Authorized<'export.run'>,
  actorId: string,
  now: Date = new Date(),
): Promise<{ readonly fileName: string; readonly json: string }> {
  const [company, customers, catalogItems, invoices, templates, numberSequences, auditLog] =
    await Promise.all([
      findCompanyProfile(context),
      // Auch archivierte: Ein Export, der Archiviertes weglässt, ist nicht
      // vollständig.
      listCustomers(context, { includeArchived: true, search: '' }),
      listCatalogItems(context, true),
      listInvoicesForExport(context),
      listTemplates(context),
      listSequencesWithPrefix(context, ''),
      listAuditEntries(context),
    ]);

  const data: DataExport = {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    organizationId: context.organizationId,
    company,
    customers,
    catalogItems,
    invoices,
    templates,
    numberSequences,
    auditLog,
  };

  // Eingerückt: Ein Export wird gelesen, nicht nur verarbeitet.
  const json = JSON.stringify(data, null, 2);

  logger.info('export.created', {
    actorId,
    customers: customers.length,
    invoices: invoices.length,
    bytes: json.length,
  });

  return { fileName: exportFileName(now), json };
}
