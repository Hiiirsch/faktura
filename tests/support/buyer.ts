/**
 * Empfänger für Testbelege (M5.7).
 *
 * Seit `Invoice.customerId` optional ist, trägt ein Entwurf keinen Kunden mehr,
 * sondern einen `DraftBuyer` in einer von drei Quellen. Die drei Aufbauer stehen
 * hier, damit die Tests bei einer Erweiterung der Empfängerangaben an **einer**
 * Stelle nachziehen.
 */
import {
  type BuyerFields,
  type DraftBuyer,
  EMPTY_BUYER_FIELDS,
} from '@/domain/invoice/buyer';

/** Empfänger aus den Stammdaten — der Regelfall. */
export function customerBuyer(customerId: string): DraftBuyer {
  return { mode: 'CUSTOMER', customerId, fields: EMPTY_BUYER_FIELDS, freeText: null };
}

/** Empfänger in eigenen Feldern am Beleg. */
export function fieldsBuyer(fields: Partial<BuyerFields>): DraftBuyer {
  return {
    mode: 'FIELDS',
    customerId: null,
    fields: { ...EMPTY_BUYER_FIELDS, ...fields },
    freeText: null,
  };
}

/** Empfänger als freier Anschriftenblock. */
export function freeBuyer(freeText: string): DraftBuyer {
  return { mode: 'FREE', customerId: null, fields: EMPTY_BUYER_FIELDS, freeText };
}
