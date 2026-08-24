'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { PdfViewer } from './pdf-viewer';

/**
 * Die Belegvorschau, die sich nach dem Speichern selbst erneuert (M12,
 * FA-PDF-02).
 *
 * **Warum das nicht von allein geschah.** Die Vorschau ist ein `<iframe>` auf
 * die PDF-Route. Beim Speichern läuft eine Server Action, und die Seite wird
 * danach neu gesetzt — nur betrifft das den Rahmen, nicht seinen Inhalt: Ein
 * `<iframe>` mit **derselben** Adresse lädt nicht neu, gleich wie oft das
 * umgebende Bauteil rendert. Man sah seine Änderungen erst nach einem
 * Neuladen der ganzen Seite.
 *
 * Die Lösung ist dieselbe wie beim Briefpapier, nur mit einer anderen Quelle
 * für die Version: Dort ist es die Kennung der Datei, hier der Zeitpunkt des
 * Speicherns. Neue Adresse, neuer Abruf.
 *
 * **Warum ein Fensterereignis und kein Prop.** Der Editor ist eine
 * Client-Komponente, die Vorschau steht in einer anderen Spalte derselben
 * Server-Komponente. Ein gemeinsamer Zustand müsste beide unter einen
 * Client-Baum zwingen — die halbe Seite würde zur Client-Komponente, damit ein
 * Rahmen von einer Zahl erfährt. Ein Ereignis am `window` kostet nichts und
 * hält die Grenze da, wo sie ist.
 */
export const INVOICE_SAVED_EVENT = 'faktura:invoice-saved';

/** Meldet allen Vorschauen, dass sich der Beleg geändert hat. */
export function announceInvoiceSaved(): void {
  window.dispatchEvent(new CustomEvent(INVOICE_SAVED_EVENT));
}

export function DocumentPreview({
  src,
  title,
  className,
}: {
  readonly src: string;
  readonly title: string;
  readonly className: string;
}): ReactNode {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const handler = (): void => {
      setVersion((current) => current + 1);
    };

    window.addEventListener(INVOICE_SAVED_EVENT, handler);
    return () => {
      window.removeEventListener(INVOICE_SAVED_EVENT, handler);
    };
  }, []);

  /*
   * Die Version wandert in die Adresse und in den `key`.
   *
   * In die Adresse, damit wirklich neu abgerufen wird; in den `key`, damit
   * React die Ansicht austauscht statt nur ihr Attribut zu ändern — sonst
   * behielte sie Seitenzahl und Zoomstand einer Datei, die es nicht mehr gibt.
   */
  const versioned = version === 0 ? src : `${src}&v=${String(version)}`;

  return <PdfViewer key={version} src={versioned} title={title} className={className} />;
}
