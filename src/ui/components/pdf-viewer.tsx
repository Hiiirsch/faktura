'use client';

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import { messages } from '@/i18n/de';

import { FOCUS_RING, ICON_BUTTON_CLASS } from './form';
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
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/**
 * Wie groß das Blatt gesetzt wird.
 *
 * **Zwei Einpassungen und eine Stufe**, nicht nur eine Zahl: „Passt in die
 * Breite" und „passt in die Höhe" hängen an der Fläche und müssen sich mit ihr
 * ändern — beim Wechsel ins Vollbild, beim Ziehen am Fenster. Als feste Zahl
 * gespeichert wären sie beim ersten Größenwechsel falsch.
 *
 * Die Stufe ist ein Vielfaches der Breiteneinpassung, nicht der Blattgröße:
 * „100 %" heißt „füllt die Spalte", und das ist die Größe, mit der die Vorschau
 * beginnt.
 */
type Zoom =
  | { readonly mode: 'width' }
  | { readonly mode: 'height' }
  | { readonly mode: 'factor'; readonly factor: number };

const DEFAULT_ZOOM: Zoom = { mode: 'width' };

/** Die Polsterung des rollenden Rahmens (`p-4`) in Punkten. */
const PADDING_PX = 16;

/** Die nächste Stufe über bzw. unter dem aktuellen Vielfachen. */
function stepFrom(factor: number, direction: 1 | -1): number {
  const steps = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  return steps.find((step) => (direction === 1 ? step > factor + 0.01 : step < factor - 0.01)) ?? factor;
}

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
  /** Der rollende Rahmen — an ihm wird gezogen. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Das ganze Bauteil — es geht als Ganzes in den Vollbildmodus. */
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Woher der Zug begann: Zeigerposition und Rollstand in diesem Moment. */
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  /** Die laufende Zeichnung — eine neue bricht sie ab, statt daneben zu laufen. */
  const renderTaskRef = useRef<PdfRenderTask | null>(null);
  /* Das geladene Dokument überlebt das Blättern; `unknown`, weil der Typ aus
     einem dynamischen Import stammt und die Domain-Regel kein `any` erlaubt. */
  const documentRef = useRef<PdfDocument | null>(null);

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<Zoom>(DEFAULT_ZOOM);
  /** Das zuletzt gesetzte Vielfache — für die Anzeige und für die Stufen. */
  const [shownFactor, setShownFactor] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  /** Setzt eine Seite auf die Leinwand — in der Auflösung des Bildschirms. */
  const drawPage = useCallback(async (page: number, requested: Zoom): Promise<void> => {
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

    /*
     * Die Höheneinpassung misst am **rollenden** Rahmen, nicht am Messrahmen:
     * Nur er kennt die verfügbare Höhe. Die Polsterung geht ab, sonst stünde
     * das Blatt eine Zeile zu hoch und der Rahmen rollte um genau diesen Rest.
     */
    const scroller = scrollRef.current;
    const availableHeight = Math.max(0, (scroller?.clientHeight ?? 0) - PADDING_PX * 2);
    const fitHeight =
      availableHeight > 0 ? availableHeight / unscaled.height : fit;

    const factor =
      requested.mode === 'factor'
        ? requested.factor
        : requested.mode === 'height'
          ? fitHeight / fit
          : 1;

    /*
     * **Zwei Maße, nicht eines.**
     *
     * Die Leinwand hat eine Bildgröße (`width`/`height`) und eine Anzeigegröße
     * (CSS). Die erste bestimmt die Schärfe, die zweite die Größe auf dem
     * Blatt. Hier stand `style.width = '100%'`: Die Anzeige hing damit am
     * Container, und Vergrößern erhöhte nur die Auflösung — sichtbar änderte
     * sich nichts. Gemessen im Browser: Bild 462 → 577 Punkte, Anzeige
     * unverändert 430.
     *
     * Jetzt trägt die Anzeige den Zoom und die Bildgröße zusätzlich die
     * Punktdichte des Bildschirms. Über die Containerbreite hinaus rollt der
     * Rahmen — dafür steht `overflow-auto` daran.
     */
    const displayScale = fit * factor;
    const ratio = window.devicePixelRatio || 1;
    const viewport = rendered.getViewport({ scale: displayScale * ratio });

    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${String(Math.round(unscaled.width * displayScale))}px`;
    canvas.style.height = `${String(Math.round(unscaled.height * displayScale))}px`;

    // Was tatsächlich gesetzt wurde, steht danach auf dem Knopf.
    setShownFactor(factor);

    /*
     * **Erst abbrechen, dann zeichnen.** Zwei Zeichnungen auf derselben
     * Leinwand weist pdf.js ab, und das trifft im Alltag zu: Wer zweimal schnell
     * auf „Größer" drückt, löst die zweite aus, während die erste läuft. Der
     * Abbruch endet in einer Ablehnung, die hier erwartet wird und nichts
     * bedeutet — die neue Zeichnung ist ja schon unterwegs.
     */
    renderTaskRef.current?.cancel();

    const task = rendered.render({ canvas, canvasContext: context, viewport });
    renderTaskRef.current = task;

    try {
      await task.promise;
    } catch {
      // Abgebrochen oder gescheitert: Beides ist kein Grund, die Ansicht
      // abzuräumen — auf der Leinwand steht dann eben noch das Vorherige.
    } finally {
      if (renderTaskRef.current === task) {
        renderTaskRef.current = null;
      }
    }
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

  /*
   * Zeichnen: nach dem Laden, beim Blättern, beim Zoomen — und beim Wechsel
   * ins Vollbild, weil dort eine andere Spalte gilt.
   *
   * **Ein** Effekt, nicht zwei. Vorher stand der Vollbildfall in einem eigenen
   * mit fast denselben Abhängigkeiten: Bei jeder Änderung liefen beide, also
   * zwei Zeichnungen gleichzeitig auf derselben Leinwand. pdf.js weist das mit
   * einer Ausnahme ab („Cannot use the same canvas during multiple render
   * operations"), die als unbehandelter Seitenfehler endete. Aufgefallen ist
   * sie in einer Browserprobe zu einer ganz anderen Frage.
   */
  useEffect(() => {
    if (state.kind !== 'ready') {
      return;
    }
    void drawPage(pageNumber, zoom);
  }, [drawPage, fullscreen, pageNumber, state, zoom]);

  /*
   * Und bei geänderter Breite erneut: Die Grundgröße ist „passt in die Spalte",
   * und die Spalte ändert sich mit dem Fenster. Ohne das bliebe das Blatt in
   * der Breite von vorhin stehen.
   */
  useEffect(() => {
    if (state.kind !== 'ready') {
      return;
    }

    const handler = (): void => {
      void drawPage(pageNumber, zoom);
    };

    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
    };
  }, [drawPage, pageNumber, state, zoom]);

  /*
   * **Das Blatt lässt sich mit der Maus greifen und schieben** (M12).
   *
   * Der Handgriff eines PDF-Betrachters, nachgebaut über Zeigerereignisse: Was
   * der Zeiger zurücklegt, legt der Rollstand in die Gegenrichtung zurück.
   *
   * Drei Feinheiten, die man erst beim Ausprobieren merkt:
   *
   * - `setPointerCapture` hält den Zug fest, auch wenn der Zeiger dabei den
   *   Rahmen verlässt. Ohne das bliebe das Blatt an der Kante hängen, sobald
   *   man zu weit zieht — und ein losgelassener Knopf außerhalb käme nie an.
   * - **Nur die Maus.** Auf einem Berührungsbildschirm rollt der Browser von
   *   sich aus, und zwar besser: mit Schwung und Fangkante. Ein nachgebauter
   *   Zug daneben wäre eine zweite, schlechtere Mechanik.
   * - Der Zeiger wechselt zur geschlossenen Hand, solange gezogen wird. Ohne
   *   Rückmeldung weiß niemand, ob er das Blatt hat oder daneben greift.
   */
  const startDrag = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const rahmen = scrollRef.current;
    if (rahmen === null || event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: rahmen.scrollLeft,
      top: rahmen.scrollTop,
    };
    rahmen.setPointerCapture(event.pointerId);
    setDragging(true);
  }, []);

  const moveDrag = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const rahmen = scrollRef.current;
    const start = dragRef.current;
    if (rahmen === null || start === null) {
      return;
    }

    rahmen.scrollLeft = start.left - (event.clientX - start.x);
    rahmen.scrollTop = start.top - (event.clientY - start.y);
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const rahmen = scrollRef.current;
    if (rahmen !== null && rahmen.hasPointerCapture(event.pointerId)) {
      rahmen.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }, []);

  /*
   * **Vollbild** (M12).
   *
   * Über die Schnittstelle des Browsers, nicht über ein `position: fixed` mit
   * hohem `z-index`: Nur so verschwindet auch alles, was der Browser selbst
   * um die Seite legt, und `Escape` tut ohne Zutun das Erwartete. Der Zustand
   * kommt aus `fullscreenchange` und nicht aus dem eigenen Klick — wer über
   * `Escape` oder die Taste des Browsers hinausgeht, soll denselben Weg
   * nehmen.
   */
  const toggleFullscreen = useCallback((): void => {
    const wurzel = rootRef.current;
    if (wurzel === null) {
      return;
    }

    if (document.fullscreenElement === null) {
      void wurzel.requestFullscreen().catch(() => {
        // Verweigert der Browser den Vollbildmodus, bleibt die Ansicht wie sie
        // ist. Eine Vorschau, die deshalb abbricht, wäre die schlechtere Wahl.
      });
      return;
    }

    void document.exitFullscreen().catch(() => {
      /* dasselbe in der Gegenrichtung */
    });
  }, []);

  useEffect(() => {
    const handler = (): void => {
      setFullscreen(document.fullscreenElement !== null);
    };

    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, []);

  /**
   * Eine Stufe größer oder kleiner.
   *
   * Aus einer Einpassung heraus wird von dem Vielfachen aus weitergezählt, das
   * gerade **tatsächlich** gilt — sonst spränge das Blatt beim ersten Klick auf
   * eine Größe, die mit dem Gesehenen nichts zu tun hat.
   */
  const zoomBy = useCallback(
    (direction: 1 | -1): void => {
      setZoom({ mode: 'factor', factor: stepFrom(shownFactor, direction) });
    },
    [shownFactor],
  );

  const goToPage = useCallback(
    (direction: 1 | -1): void => {
      setPageNumber((current) => {
        const next = current + direction;
        if (next < 1 || (state.kind === 'ready' && next > state.pageCount)) {
          return current;
        }
        return next;
      });
    },
    [state],
  );

  /*
   * **Zoom mit Strg und Mausrad**, wie in jedem Betrachter.
   *
   * Der Zuhörer wird von Hand angemeldet und nicht über `onWheel`: React meldet
   * Radereignisse **passiv** an, und ein passiver Zuhörer darf
   * `preventDefault()` nicht — der Browser zöge dann seine eigene Seitenlupe
   * auf, während das Blatt sich ebenfalls ändert. Zwei Zooms übereinander sind
   * schlimmer als keiner.
   */
  useEffect(() => {
    const rahmen = scrollRef.current;
    if (rahmen === null) {
      return;
    }

    const handler = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1 : -1);
    };

    rahmen.addEventListener('wheel', handler, { passive: false });
    return () => {
      rahmen.removeEventListener('wheel', handler);
    };
  }, [zoomBy]);

  const pageCount = state.kind === 'ready' ? state.pageCount : 0;

  return (
    // `data-document` nennt die gezeigte Datei. Im DOM steht sonst nichts
    // darüber — anders als beim `<iframe>`, dessen `src` sichtbar war.
    <div
      ref={rootRef}
      /*
       * Im Vollbild gilt nicht mehr die Höhe der Spalte, sondern die des
       * Bildschirms — und die Fläche braucht einen eigenen Grund: Der
       * Vollbildmodus zeigt nur dieses Element, alles dahinter ist fort.
       */
      className={fullscreen ? 'flex h-screen w-screen flex-col bg-surface' : className}
      data-document={src}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={messages.preview.previousPage}
            disabled={pageNumber <= 1}
            onClick={() => {
              goToPage(-1);
            }}
            className={ICON_BUTTON_CLASS}
          >
            <ChevronLeft aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
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
              goToPage(1);
            }}
            className={ICON_BUTTON_CLASS}
          >
            <ChevronRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={messages.preview.zoomOut}
            disabled={shownFactor <= ZOOM_STEPS[0]}
            onClick={() => {
              zoomBy(-1);
            }}
            className={ICON_BUTTON_CLASS}
          >
            <Minus aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
          </button>

          {/*
            Ein Knopf, der sagt, was er zeigt, und beim Drücken weiterschaltet:
            Breite → Höhe → Breite. In der Stufenansicht steht der Prozentwert
            und führt zurück auf „passt in die Breite".
          */}
          <button
            type="button"
            aria-label={messages.preview.fitMode}
            onClick={() => {
              setZoom((current) => (current.mode === 'width' ? { mode: 'height' } : DEFAULT_ZOOM));
            }}
            className={`min-w-16 text-ui tabular-nums text-ink-muted ${FOCUS_RING}`}
          >
            {zoom.mode === 'width'
              ? messages.preview.fitWidth
              : zoom.mode === 'height'
                ? messages.preview.fitHeight
                : `${String(Math.round(shownFactor * 100))} %`}
          </button>

          <button
            type="button"
            aria-label={messages.preview.zoomIn}
            disabled={shownFactor >= (ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 3)}
            onClick={() => {
              zoomBy(1);
            }}
            className={ICON_BUTTON_CLASS}
          >
            <Plus aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
          </button>

          <button
            type="button"
            aria-label={fullscreen ? messages.preview.exitFullscreen : messages.preview.fullscreen}
            onClick={toggleFullscreen}
            className={ICON_BUTTON_CLASS}
          >
            {fullscreen ? (
              <Minimize2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
            ) : (
              <Maximize2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={ICON_STROKE} />
            )}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        /*
         * Blättern mit den Pfeiltasten — **links und rechts**. Hoch und runter
         * bleiben beim Rollen: Auf einem Blatt, das höher ist als sein Rahmen,
         * ist das die häufigere Absicht, und sie dem Blättern zu geben hieße,
         * das Naheliegende wegzunehmen.
         *
         * `tabIndex` macht den Rahmen anfahrbar; ohne ihn erreichten die Tasten
         * ihn nie.
         */
        tabIndex={0}
        role="group"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToPage(1);
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToPage(-1);
          }
        }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={
          `min-h-0 flex-1 overflow-auto p-4 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`
        }
      >
        {/*
          Gemessen wird an diesem Rahmen, nicht am rollenden darüber: Dessen
          `clientWidth` enthält die Polsterung, und das Blatt wäre jedes Mal
          32 Punkte zu breit.
        */}
        <div ref={containerRef} className="min-w-0">
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
    </div>
  );
}

/** Der Ausschnitt von pdf.js, den diese Ansicht benutzt. */
type PdfDocument = {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
};

type PdfViewport = { readonly width: number; readonly height: number };

type PdfRenderTask = {
  readonly promise: Promise<void>;
  cancel(): void;
};

type PdfPage = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): PdfRenderTask;
};
