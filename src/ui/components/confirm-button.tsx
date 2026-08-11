'use client';

import type { ReactNode } from 'react';

import { SECONDARY_BUTTON_CLASS } from './form';

/**
 * Absendeknopf mit Rückfrage (NFA-QUAL-12).
 *
 * Destruktive und unumkehrbare Aktionen — Festschreiben, Stornieren, Entwurf
 * löschen — verlangen eine Bestätigung mit erklärendem Text. Der Text nennt
 * die Folge, nicht nur die Frage: „Wirklich?" hilft niemandem bei der
 * Entscheidung.
 */
export function ConfirmButton({
  message,
  children,
  className,
}: {
  readonly message: string;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <button
      type="submit"
      className={className ?? SECONDARY_BUTTON_CLASS}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
