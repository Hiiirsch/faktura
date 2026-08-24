'use client';

import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import { FOCUS_RING, SECONDARY_BUTTON_CLASS } from './form';
import { ICON_STROKE } from './icon';

/**
 * Belegvorschau in der Gestaltung der Anwendung (M12, FA-PDF-02, FA-UI-01).
 *
 * **Warum nicht mehr der eingebaute Betrachter.** Er ist eine eigene Anwendung
 * im Browser: eigenes Grau, eigene Werkzeugleiste, eigene Schrift, eigene
 * Vorstellung von Rändern — und er kennt weder unsere Tokens noch das dunkle
 * Schema. `#toolbar=0` blendet in Chromium einiges aus, in anderen Browsern
 * nichts; es ist eine Bitte, keine Zusage. Mitten in einer Oberfläche, deren
 * Werte alle aus `globals.css` kommen, war das der einzige Fremdkörper.
 *
 * **Der Preis, offen benannt.** `pdfjs-dist` ist mit Abstand die größte
 * Abhängigkeit im Browser: Kern und Worker zusammen rund 1,6 MB entpackt. Für
 * den Vorlageneditor wurde Monaco aus genau diesem Grund abgelehnt — der
 * Unterschied ist die Häufigkeit: Eine Belegvorschau sieht man bei **jedem**
 * Beleg, einen Vorlageneditor selten. Beides bewusst entschieden, nicht
 * übersehen.
 *
 * Drei Dinge, die dabei zu beachten waren:
 *
 * - **Der Worker läuft unter der CSP.** `worker-src 'self' blob:` steht deshalb
 *   ausdrücklich in `security-headers.ts`; ohne die Angabe fällt der Browser
 *   über `child-src` auf `script-src` zurück, und `strict-dynamic` lässt eine
 *   Adresse dort nicht gelten.
 * - **Kein WebAssembly** (`useWasm: false`). Sonst lädt pdf.js für die
 *   Bilddekodierung eine eigene Datei nach, und die Richtlinie bräuchte
 *   `'wasm-unsafe-eval'`. Ein Beleg trägt bestenfalls ein Logo; der Gewinn
 *   stünde in keinem Verhältnis zur Lockerung.
 * - **Keine Datei aus dem Netz.** Der Worker wird mitgebaut und von unserer
 *   eigenen Herkunft geladen (NFA-COMP-06); ein CDN gibt es hier nicht.
 */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_ZOOM_INDEX = 2;

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly pageCount: number }
  | { readonly kind: 'failed' };

export function PdfViewer({
  src,
  title,
  className,
}: {
  readonly src: string;
  readonly title: string;
  readonly className: string;
}): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /* Das geladene Dokument überlebt das Blättern; `unknown`, weil der Typ aus
     einem dynamischen Import stammt und die Domain-Regel kein `any` erlaubt. */
  const documentRef = useRef<PdfDocument | null>(null);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  /** Setzt eine Seite auf die Leinwand — in der Auflösung des Bildschirms. */
  const drawPage = useCallback(async (page: number, zoom: number): Promise<void> => {
    const pdf = documentRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (pdf === null || canvas === null || container === null) {
      return;
    }

    const rendered = await pdf.getPage(page);

    /*
     * Die Breite gibt der Platz vor, nicht das Blatt: Eine Vorschau, die
     * seitlich hinausläuft, ist keine. Der Zoom wirkt darauf, nicht statt
     * dessen.
     */
    const unscaled = rendered.getViewport({ scale: 1 });
    const fit = (container.clientWidth || unscaled.width) / unscaled.width;
    const ratio = window.devicePixelRatio || 1;
    const viewport = rendered.getViewport({ scale: fit * zoom * ratio });

    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    await rendered.render({ canvas, canvasContext: context, viewport }).promise;
  }, []);

  // Laden: bei jeder neuen Adresse von vorn.
  useEffect(() => {
    let abgebrochen = false;

    async function load(): Promise<void> {
      setState({ kind: 'loading' });

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const response = await fetch(src, { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`Antwort ${String(response.status)}`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdf = (await pdfjs.getDocument({
          data: bytes,
          /*
           * **Kein WebAssembly.** pdf.js zieht es sonst für die Bilddekodierung
           * heran und lädt dafür eine eigene Datei nach; unter der Richtlinie
           * bräuchte das `'wasm-unsafe-eval'` im `script-src`. Ein Beleg trägt
           * bestenfalls ein Logo — der Gewinn stünde in keinem Verhältnis zu
           * einer Lockerung der Richtlinie.
           */
          useWasm: false,
        }).promise) as unknown as PdfDocument;

        if (abgebrochen) {
          return;
        }

        documentRef.current = pdf;
        setPageNumber(1);
        setState({ kind: 'ready', pageCount: pdf.numPages });
      } catch {
        if (!abgebrochen) {
          documentRef.current = null;
          setState({ kind: 'failed' });
        }
      }
    }

    void load();

    return () => {
      abgebrochen = true;
    };
  }, [src]);

  // Zeichnen: nach dem Laden, beim Blättern, beim Zoomen.
  useEffect(() => {
    if (state.kind !== 'ready') {
      return;
    }
    void drawPage(pageNumber, ZOOM_STEPS[zoomIndex] ?? 1);
  }, [drawPage, pageNumber, state, zoomIndex]);

  const pageCount = state.kind === 'ready' ? state.pageCount : 0;

  return (
    // `data-document` nennt die gezeigte Datei. Im DOM steht sonst nichts
    // darüber — anders als beim `<iframe>`, dessen `src` sichtbar war.
    <div className={className} data-document={src}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={messages.preview.previousPage}
            disabled={pageNumber <= 1}
            onClick={() => {
              setPageNumber((current) => Math.max(1, current - 1));
            }}
            className={`${SECONDARY_BUTTON_CLASS} size-9 px-0`}
          >
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          </button>
          <span className="text-ui tabular-nums text-ink-muted">
            {state.kind === 'ready'
              ? `${messages.preview.page} ${String(pageNumber)} ${messages.preview.of} ${String(pageCount)}`
              : messages.preview.loading}
          </span>
          <button
            type="button"
            aria-label={messages.preview.nextPage}
            disabled={state.kind !== 'ready' || pageNumber >= pageCount}
            onClick={() => {
              setPageNumber((current) => Math.min(pageCount, current + 1));
            }}
            className={`${SECONDARY_BUTTON_CLASS} size-9 px-0`}
          >
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={messages.preview.zoomOut}
            disabled={zoomIndex <= 0}
            onClick={() => {
              setZoomIndex((current) => Math.max(0, current - 1));
            }}
            className={`${SECONDARY_BUTTON_CLASS} size-9 px-0`}
          >
            <Minus aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoomIndex(DEFAULT_ZOOM_INDEX);
            }}
            className={`text-ui tabular-nums text-ink-muted ${FOCUS_RING}`}
          >
            {`${String(Math.round((ZOOM_STEPS[zoomIndex] ?? 1) * 100))} %`}
          </button>
          <button
            type="button"
            aria-label={messages.preview.zoomIn}
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            onClick={() => {
              setZoomIndex((current) => Math.min(ZOOM_STEPS.length - 1, current + 1));
            }}
            className={`${SECONDARY_BUTTON_CLASS} size-9 px-0`}
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="overflow-auto p-4" data-testid="pdf-viewer-canvas">
        {state.kind === 'failed' ? (
          <p className="text-ui text-ink-muted">{messages.preview.failed}</p>
        ) : (
          /*
           * Das Blatt bleibt weiß, auch im dunklen Schema — dieselbe Regel wie
           * beim `--sheet`-Token: Papier ist Papier.
           */
          <canvas ref={canvasRef} aria-label={title} className="mx-auto block bg-sheet shadow-sheet" />
        )}
      </div>
    </div>
  );
}

/** Der Ausschnitt von pdf.js, den diese Ansicht benutzt. */
type PdfDocument = {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
};

type PdfViewport = { readonly width: number; readonly height: number };

type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void> };
};
