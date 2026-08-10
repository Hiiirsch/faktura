/**
 * Belegarten (NFA-ARCH-09, Spec §13). Als Aufzählung modelliert, damit weitere
 * Belegarten — Angebot, Auftragsbestätigung — später ergänzt werden können,
 * ohne die Pipeline aufzubrechen.
 */

export const DOCUMENT_TYPES = ['INVOICE', 'CREDIT_NOTE'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'INVOICE';

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}
