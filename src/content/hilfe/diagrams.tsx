import type { ReactNode } from 'react';

/**
 * Die Abbildungen des Handbuchs (M16.1, FA-DOC-04).
 *
 * **Inline-SVG mit `currentColor`, keine Bilddateien** — dieselbe Bauart wie
 * die Marke seit M9, und aus demselben Grund: Eine Bilddatei bliebe nachts in
 * ihrem Grauton stehen. So erben die Zeichnungen die Schriftfarbe und folgen
 * dem Farbschema, ohne davon zu wissen.
 *
 * **Sie zeigen Zusammenhänge, keine Bildschirme.** Ein umbenannter Knopf macht
 * eine Zustandsfolge nicht falsch; einen Screenshot macht er falsch. Deshalb
 * stehen hier Abläufe — was die Bedienung angeht, zeigen die erzeugten
 * Bildschirmfotos daneben.
 *
 * **Sie liegen beim Inhalt und nicht in `src/ui/`**, weil sie Inhalt sind: Die
 * Beschriftungen sind deutscher Fließtext wie in den MDX-Dateien nebenan und
 * gehören zu derselben benannten Ausnahme von „alle Texte in `de.ts`".
 * `tests/architecture/design-tokens.test.ts` prüft `src/content` seither mit —
 * ein Verzeichnis mit Komponenten, das kein Wächter ansieht, wäre die Stelle,
 * an der die erste Literalfarbe steht.
 */

/** Maße des Rasters, in Nutzerkoordinaten des SVG. */
const BOX_WIDTH = 132;
const BOX_HEIGHT = 44;

function Figure({
  label,
  viewBox,
  children,
}: {
  /** Was die Zeichnung zeigt — für Screenreader, die kein Bild lesen. */
  readonly label: string;
  readonly viewBox: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <figure className="my-6 max-w-text">
      <svg
        viewBox={viewBox}
        role="img"
        aria-label={label}
        className="h-auto w-full text-ink-muted"
        fill="none"
      >
        {children}
      </svg>
      <figcaption className="mt-2 text-small text-ink-faint">{label}</figcaption>
    </figure>
  );
}

function Box({
  x,
  y,
  title,
  note,
  strong = false,
}: {
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly note?: string;
  /** Der Zustand, in dem ein Beleg gilt — kräftiger gezeichnet. */
  readonly strong?: boolean;
}): ReactNode {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        rx={6}
        stroke="currentColor"
        strokeWidth={strong ? 2 : 1}
        className={strong ? 'text-ink' : undefined}
      />
      <text
        x={x + BOX_WIDTH / 2}
        y={note === undefined ? y + BOX_HEIGHT / 2 + 4 : y + 19}
        textAnchor="middle"
        fill="currentColor"
        className="text-small"
      >
        {title}
      </text>
      {note === undefined ? null : (
        <text
          x={x + BOX_WIDTH / 2}
          y={y + 33}
          textAnchor="middle"
          fill="currentColor"
          className="text-label text-ink-faint"
        >
          {note}
        </text>
      )}
    </g>
  );
}

function Arrow({
  from,
  to,
  label,
}: {
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly label?: string;
}): ReactNode {
  const [x1, y1] = from;
  const [x2, y2] = to;

  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={1}
        markerEnd="url(#pfeil)"
      />
      {label === undefined ? null : (
        <text
          x={(x1 + x2) / 2}
          y={y1 === y2 ? y1 - 6 : (y1 + y2) / 2}
          textAnchor="middle"
          fill="currentColor"
          className="text-label"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/** Die Pfeilspitze — einmal definiert, von jeder Zeichnung benutzt. */
function ArrowHead(): ReactNode {
  return (
    <defs>
      <marker id="pfeil" markerWidth={8} markerHeight={8} refX={7} refY={4} orient="auto">
        <path d="M0,1 L7,4 L0,7" stroke="currentColor" strokeWidth={1} fill="none" />
      </marker>
    </defs>
  );
}

/**
 * Der Weg eines Belegs durch seine Zustände.
 *
 * Die Trennlinie ist das Festschreiben: links löschbar und änderbar, rechts
 * unveränderlich. Genau diese Linie erklärt die meisten Rückfragen.
 */
export function InvoiceLifecycle(): ReactNode {
  return (
    <Figure
      label="Zustände eines Belegs: Aus dem Entwurf wird durch Festschreiben ein offener Beleg. Zahlungen führen zu teilweise bezahlt und bezahlt; Stornieren erzeugt eine Gutschrift und setzt den Beleg auf storniert."
      viewBox="0 0 620 250"
    >
      <ArrowHead />

      <Box x={4} y={70} title="Entwurf" note="änderbar, löschbar" />
      <Arrow from={[140, 92]} to={[236, 92]} label="festschreiben" />
      <Box x={240} y={70} title="Offen" note="Nummer vergeben" strong />

      <Arrow from={[376, 92]} to={[472, 92]} label="Zahlung" />
      <Box x={476} y={70} title="Teilweise bezahlt" strong />

      <Arrow from={[542, 114]} to={[542, 174]} label="Rest" />
      <Box x={476} y={178} title="Bezahlt" strong />

      <Arrow from={[306, 114]} to={[306, 174]} label="stornieren" />
      <Box x={240} y={178} title="Storniert" note="+ Gutschrift" strong />

      {/* Die eigentliche Aussage: Was rechts der Linie steht, geht nicht zurück. */}
      <line
        x1={196}
        y1={20}
        x2={196}
        y2={240}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text x={190} y={16} textAnchor="end" fill="currentColor" className="text-label">
        änderbar
      </text>
      <text x={202} y={16} textAnchor="start" fill="currentColor" className="text-label">
        unveränderlich
      </text>
    </Figure>
  );
}

/** Die drei Mahnstufen und was auf jeder dazukommt. */
export function ReminderLadder(): ReactNode {
  return (
    <Figure
      label="Drei Mahnstufen: Zahlungserinnerung, Mahnung, letzte Mahnung. Mit jeder Stufe kommt die in den Firmendaten hinterlegte Gebühr hinzu; nach der dritten entsteht keine weitere."
      viewBox="0 0 620 130"
    >
      <ArrowHead />

      <Box x={4} y={40} title="Zahlungserinnerung" note="Stufe 1" />
      <Arrow from={[140, 62]} to={[196, 62]} />
      <Box x={200} y={40} title="Mahnung" note="Stufe 2" />
      <Arrow from={[336, 62]} to={[392, 62]} />
      <Box x={396} y={40} title="Letzte Mahnung" note="Stufe 3" />

      <text x={548} y={66} textAnchor="start" fill="currentColor" className="text-label">
        Ende
      </text>

      <text x={4} y={110} fill="currentColor" className="text-label">
        Je Stufe: offener Betrag + Mahngebühr aus den Firmendaten. Keine Umsatzsteuer.
      </text>
    </Figure>
  );
}

/** Die drei Quellen, aus denen der Empfänger eines Belegs stammen kann. */
export function RecipientSources(): ReactNode {
  return (
    <Figure
      label="Drei Quellen für den Empfänger: ein Kunde aus den Stammdaten, am Beleg erfasste Felder oder ein freier Anschriftenblock. Alle drei münden in denselben Beleg."
      viewBox="0 0 620 190"
    >
      <ArrowHead />

      <Box x={4} y={10} title="Kunde" note="aus den Stammdaten" />
      <Box x={4} y={70} title="Felder am Beleg" note="einmalig erfasst" />
      <Box x={4} y={130} title="Freier Block" note="Zeile für Zeile" />

      <Arrow from={[140, 32]} to={[300, 82]} />
      <Arrow from={[140, 92]} to={[300, 92]} />
      <Arrow from={[140, 152]} to={[300, 102]} />

      <Box x={304} y={70} title="Beleg" note="Name + Anschrift, §14 UStG" strong />
    </Figure>
  );
}

/**
 * Der Satzspiegel nach DIN 5008.
 *
 * Maßstäblich genug, um die Lage zu zeigen — nicht als Vorlage zum Nachmessen.
 */
export function SheetLayout(): ReactNode {
  return (
    <Figure
      label="Aufbau eines Belegs nach DIN 5008: Briefkopf mit Logo, Anschriftfeld links im Fensterbereich, Informationsblock rechts daneben, darunter Betreff und Positionen, am Blattfuß Anschrift, Kontakt, Steuernummer und Bankverbindung."
      viewBox="0 0 300 420"
    >
      {/* Das Blatt */}
      <rect x={1} y={1} width={298} height={418} rx={3} stroke="currentColor" strokeWidth={1} />

      {/* Falz- und Lochmarken am linken Rand */}
      <line x1={4} y1={105} x2={14} y2={105} stroke="currentColor" strokeWidth={1} />
      <line x1={4} y1={210} x2={16} y2={210} stroke="currentColor" strokeWidth={1} />
      <line x1={4} y1={315} x2={14} y2={315} stroke="currentColor" strokeWidth={1} />

      <rect x={24} y={12} width={252} height={38} rx={3} stroke="currentColor" strokeDasharray="3 3" />
      <text x={30} y={35} fill="currentColor" className="text-label">
        Briefkopf · Logo
      </text>

      <rect x={24} y={66} width={130} height={60} rx={3} stroke="currentColor" />
      <text x={30} y={82} fill="currentColor" className="text-label">
        Anschriftfeld
      </text>
      <text x={30} y={96} fill="currentColor" className="text-label text-ink-faint">
        im Umschlagfenster
      </text>

      <rect x={168} y={66} width={108} height={60} rx={3} stroke="currentColor" />
      <text x={174} y={82} fill="currentColor" className="text-label">
        Nummer, Datum
      </text>
      <text x={174} y={96} fill="currentColor" className="text-label text-ink-faint">
        Kundennummer
      </text>

      <text x={24} y={156} fill="currentColor" className="text-small">
        Rechnung RE-2026-0042
      </text>

      <rect x={24} y={172} width={252} height={140} rx={3} stroke="currentColor" />
      <text x={30} y={190} fill="currentColor" className="text-label">
        Positionen, Steueraufstellung, Summen
      </text>
      <line x1={24} y1={200} x2={276} y2={200} stroke="currentColor" strokeDasharray="2 3" />
      <line x1={24} y1={222} x2={276} y2={222} stroke="currentColor" strokeDasharray="2 3" />
      <line x1={24} y1={244} x2={276} y2={244} stroke="currentColor" strokeDasharray="2 3" />

      <rect x={24} y={330} width={252} height={62} rx={3} stroke="currentColor" />
      <text x={30} y={348} fill="currentColor" className="text-label">
        Blattfuß auf jeder Seite
      </text>
      <text x={30} y={364} fill="currentColor" className="text-label text-ink-faint">
        Anschrift · Kontakt · Steuer-Nr. · Bank
      </text>

      <text x={276} y={410} textAnchor="end" fill="currentColor" className="text-label text-ink-faint">
        Seitenzahl ab Seite 2
      </text>
    </Figure>
  );
}

/**
 * Ein Bildschirmfoto (M16.1, FA-DOC-05).
 *
 * **Die Bilder werden aufgenommen, nicht abgelegt** — `npm run docs:shots`
 * fährt die gebaute Anwendung mit Beispieldaten hoch und nimmt sie auf. Wer
 * eine Ansicht ändert, erneuert sie mit einem Befehl statt mit einem
 * Bildbearbeitungsprogramm.
 *
 * `loading="lazy"` und feste Maße: Das Seitenverhältnis steht vor dem Laden
 * fest, damit der Text beim Nachladen nicht springt. Die Maße sind die des
 * Aufnahmelaufs, verdoppelt für scharfe Darstellung auf feinen Bildschirmen.
 *
 * **Ein Bild kennt nur ein Schema.** Die Aufnahmen entstehen im hellen; auf
 * dunklem Grund steht deshalb ein Rahmen darum, damit die weiße Fläche nicht
 * randlos ausfranst.
 */
export function Screenshot({
  src,
  alt,
  caption,
}: {
  /** Dateiname unter `/hilfe/`, ohne Pfad und Endung. */
  readonly src: string;
  /** Was zu sehen ist — für alle, die das Bild nicht sehen. */
  readonly alt: string;
  readonly caption: string;
}): ReactNode {
  return (
    <figure className="my-6">
      {/*
        `<img>` statt `next/image`, und das ist eine Abwägung, keine
        Nachlässigkeit: Der Bildoptimierer verlangt in der Produktion `sharp` —
        eine nativ übersetzte Abhängigkeit im Container, für fünf Bilder in
        einer Dokumentation. Sie werden verzögert geladen, stehen nie über dem
        Falz und sind bereits in der Zielgröße aufgenommen; der Gewinn wäre
        gering, der Preis eine weitere Stelle, an der der Containerbau scheitern
        kann.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element -- siehe Begründung oben */}
      <img
        src={`/hilfe/${src}.png`}
        alt={alt}
        width={1440}
        height={900}
        loading="lazy"
        className="h-auto w-full rounded-control border border-rule"
      />
      <figcaption className="mt-2 text-small text-ink-faint">{caption}</figcaption>
    </figure>
  );
}
