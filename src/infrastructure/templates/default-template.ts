/**
 * Die mitgelieferte Standardvorlage (FA-TPL-05, Spec §8.3).
 *
 * Sie ist zugleich Referenzimplementierung für den Vorlagen-Editor und
 * Nachweis für die Pflichtangaben FA-PFL-01 bis -11: Was hier nicht gesetzt
 * wird, steht auf keinem Beleg.
 *
 * Als TypeScript-Modul und nicht als `.html`/`.css` im Dateisystem. Der Grund
 * ist der Standalone-Build: Eine zur Laufzeit gelesene Datei erfasst die
 * Abhängigkeitsverfolgung nicht, und eine fehlende Standardvorlage im
 * Container fiele erst beim ersten Beleg auf. Als Modul ist sie Teil des
 * Bündels, ohne dass jemand daran denken muss.
 *
 * Maße nach DIN 5008 Form B:
 *
 * - Anschriftfeld 85 × 45 mm, oben links, beginnend 45 mm von der Blattoberkante
 *   — dort steht es im Fenster eines DIN-lang-Umschlags (FA-PDF-08).
 * - Informationsblock rechts daneben auf gleicher Höhe.
 * - Falzmarken bei 87 mm und 192 mm, Lochmarke bei 148,5 mm.
 *
 * Die Ränder kommen aus der Geometrie der Vorlage (25/20/20/20 mm) und stehen
 * in `@page`; die Millimeterangaben hier sind deshalb Abstände **innerhalb**
 * des Satzspiegels.
 */

/**
 * Liquid-Quelltext.
 *
 * Bewusst ohne Bedingungen um jede Zeile herum: Fehlende optionale Felder
 * liefert die Engine als leere Zeichenkette (`strictVariables: false`), und
 * `{% if %}` an dreißig Stellen machte die Vorlage für den Editor unlesbar.
 * Bedingungen stehen nur dort, wo ein Block als Ganzes entfällt.
 */
export const DEFAULT_TEMPLATE_HTML = `<div class="sheet">

  {%- comment -%} Falz- und Lochmarken (DIN 5008) {%- endcomment -%}
  <div class="mark mark-fold-1"></div>
  <div class="mark mark-punch"></div>
  <div class="mark mark-fold-2"></div>

  <header class="letterhead">
    <div class="letterhead-name">{{ seller.name }}</div>
    <div class="letterhead-contact">
      {{ seller.address.addressLine1 }} · {{ seller.address.postalCode }} {{ seller.address.city }}
    </div>
  </header>

  {%- comment -%}
    Anschriftfeld: Rücksendeangabe in Kleinschrift, darunter die Anschrift des
    Empfängers. FA-PFL-01, FA-PDF-08.
  {%- endcomment -%}
  <section class="address-field">
    <div class="return-line">
      {{ seller.name }} · {{ seller.address.addressLine1 }} · {{ seller.address.postalCode }} {{ seller.address.city }}
    </div>
    {%- comment -%}
      Zwei Darstellungen: Ist ein freier Anschriftenblock erfasst, gilt er Zeile
      für Zeile, wie eingegeben — sonst werden die Felder gesetzt. Die erste
      Zeile ist in beiden Fällen der Name.
    {%- endcomment -%}
    <address class="recipient">
      {%- if buyer.addressBlock -%}
      {%- for line in buyer.addressBlock -%}
      {%- if forloop.first %}<div class="recipient-name">{{ line }}</div>
      {%- else %}<div>{{ line }}</div>{% endif -%}
      {%- endfor -%}
      {%- else -%}
      <div class="recipient-name">{{ buyer.name }}</div>
      {%- if buyer.contactName %}<div>{{ buyer.contactName }}</div>{% endif -%}
      <div>{{ buyer.address.addressLine1 }}</div>
      {%- if buyer.address.addressLine2 %}<div>{{ buyer.address.addressLine2 }}</div>{% endif -%}
      <div>{{ buyer.address.postalCode }} {{ buyer.address.city }}</div>
      {%- if buyer.address.countryCode != 'DE' %}<div>{{ buyer.address.countryCode }}</div>{% endif -%}
      {%- endif -%}
    </address>
  </section>

  {%- comment -%} Informationsblock: Nummer, Daten, Kundennummer {%- endcomment -%}
  <section class="info-block">
    <dl>
      <dt>{{ invoice.documentTypeLabel }}-Nr.</dt>
      <dd class="num">{{ invoice.number }}</dd>

      <dt>Datum</dt>
      <dd class="num">{{ invoice.issueDate | date }}</dd>

      {%- comment -%}
        Ohne Kundendatensatz gibt es keine Kundennummer — dann entfällt die
        Zeile, statt eine leere zu setzen (M5.7).
      {%- endcomment -%}
      {%- if buyer.customerNumber %}
      <dt>Kundennummer</dt>
      <dd class="num">{{ buyer.customerNumber }}</dd>
      {%- endif -%}

      {%- if buyer.buyerReference %}
      <dt>Leitweg-ID</dt>
      <dd class="num">{{ buyer.buyerReference }}</dd>
      {%- endif -%}

      {%- if invoice.purchaseOrderRef %}
      <dt>Bestellnummer</dt>
      <dd class="num">{{ invoice.purchaseOrderRef }}</dd>
      {%- endif -%}
    </dl>
  </section>

  <main class="body">
    <h1 class="subject">
      {{ invoice.documentTypeLabel }} {{ invoice.number }}
      {%- if invoice.isDraft %} <span class="draft-mark">Entwurf</span>{% endif -%}
    </h1>

    {%- comment -%} Leistungszeitraum, FA-PFL-06 {%- endcomment -%}
    <p class="service-period">
      {%- if invoice.serviceDateTo -%}
        Leistungszeitraum: {{ invoice.serviceDateFrom | date }} bis {{ invoice.serviceDateTo | date }}
      {%- else -%}
        Leistungsdatum: {{ invoice.serviceDateFrom | date }}
      {%- endif -%}
    </p>

    {%- if invoice.preceding %}
    <p class="preceding">
      Storno zur Rechnung {{ invoice.preceding.invoiceNumber }} vom {{ invoice.preceding.issueDate | date }}
    </p>
    {%- endif -%}

    {%- if invoice.introText %}<p class="intro">{{ invoice.introText }}</p>{% endif -%}

    {%- comment -%} Positionen, FA-PFL-05 {%- endcomment -%}
    <table class="lines">
      <thead>
        <tr>
          <th class="col-pos">Pos.</th>
          <th class="col-name">Bezeichnung</th>
          <th class="col-qty">Menge</th>
          <th class="col-price">Einzelpreis</th>
          <th class="col-tax">USt.</th>
          <th class="col-amount">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {%- for line in lines %}
        <tr>
          <td class="col-pos num">{{ line.position }}</td>
          <td class="col-name">
            <div class="line-name">{{ line.name }}</div>
            {%- if line.description %}<div class="line-description">{{ line.description }}</div>{% endif -%}
          </td>
          <td class="col-qty num">{{ line.quantity | quantity }} {{ line.unitLabel }}</td>
          <td class="col-price num">{{ line.unitPrice | money: invoice.currency }}</td>
          <td class="col-tax num">{{ line.taxRate | percent }}</td>
          <td class="col-amount num">{{ line.lineNet | money: invoice.currency }}</td>
        </tr>
        {%- endfor %}
      </tbody>
    </table>

    {%- comment -%} Summen je Steuersatz, FA-PFL-07 und FA-PFL-08 {%- endcomment -%}
    <section class="totals">
      <table>
        <tbody>
          <tr class="totals-net">
            <th scope="row">Nettobetrag</th>
            <td class="num">{{ totals.net | money: invoice.currency }}</td>
          </tr>
          {%- for group in taxBreakdown %}
          <tr>
            <th scope="row">
              {{ group.categoryLabel }} {{ group.rate | percent }} auf {{ group.net | money: invoice.currency }}
            </th>
            <td class="num">{{ group.tax | money: invoice.currency }}</td>
          </tr>
          {%- endfor %}
          <tr class="totals-gross">
            <th scope="row">Gesamtbetrag</th>
            <td class="num">{{ totals.gross | money: invoice.currency }}</td>
          </tr>
          {%- if totals.paid > 0 %}
          <tr>
            <th scope="row">Bereits gezahlt</th>
            <td class="num">{{ totals.paid | money: invoice.currency }}</td>
          </tr>
          <tr class="totals-outstanding">
            <th scope="row">Offener Betrag</th>
            <td class="num">{{ totals.outstanding | money: invoice.currency }}</td>
          </tr>
          {%- endif -%}
        </tbody>
      </table>
    </section>

    {%- comment -%}
      Pflichthinweise: §19, Reverse Charge, Ausfuhr, Storno. Werden aus dem
      Dokumentmodell befüllt (FA-PFL-08, FA-PFL-09, FA-PFL-11).
    {%- endcomment -%}
    {%- if notices.size > 0 %}
    <section class="notices">
      {%- for notice in notices %}<p>{{ notice }}</p>{% endfor -%}
    </section>
    {%- endif -%}

    {%- if invoice.outroText %}<p class="outro">{{ invoice.outroText }}</p>{% endif -%}
  </main>

  {%- comment -%}
    Bankverbindung und Zahlungsangaben, FA-PFL-10. Auf dem Blatt und nicht in
    der Fußzeile des Renderers: Sie gehören zum Belegtext, nicht zur
    Seitenzählung.
  {%- endcomment -%}
  <section class="payment">
    <div class="payment-terms">
      {%- if seller.bankAccountHolder %}
      <div class="payment-block">
        <div class="payment-label">Bankverbindung</div>
        <div>{{ seller.bankAccountHolder }}</div>
        <div class="num">IBAN {{ seller.iban }}</div>
        <div class="num">BIC {{ seller.bic }} · {{ seller.bankName }}</div>
      </div>
      {%- endif -%}
      <div class="payment-block">
        <div class="payment-label">Zahlung</div>
        {%- for notice in paymentNotices %}<div>{{ notice }}</div>{% endfor -%}
      </div>
    </div>
  </section>

  {%- comment -%}
    Absenderangaben als Fuß des Blattes: Steuernummer bzw. USt-IdNr sind
    Pflicht (FA-PFL-02), Register und Geschäftsführung nach HGB.
  {%- endcomment -%}
  <footer class="imprint">
    <div class="imprint-column">
      <div>{{ seller.name }}</div>
      <div>{{ seller.address.addressLine1 }}</div>
      <div>{{ seller.address.postalCode }} {{ seller.address.city }}</div>
    </div>
    <div class="imprint-column">
      {%- if seller.phone %}<div>Telefon {{ seller.phone }}</div>{% endif -%}
      {%- if seller.email %}<div>{{ seller.email }}</div>{% endif -%}
      {%- if seller.website %}<div>{{ seller.website }}</div>{% endif -%}
    </div>
    <div class="imprint-column">
      {%- if seller.taxNumber %}<div class="num">Steuernummer {{ seller.taxNumber }}</div>{% endif -%}
      {%- if seller.vatId %}<div class="num">USt-IdNr. {{ seller.vatId }}</div>{% endif -%}
      {%- if seller.registerCourt %}<div>{{ seller.registerCourt }} {{ seller.registerNumber }}</div>{% endif -%}
      {%- if seller.managingDirector %}<div>{{ seller.managingDirector }}</div>{% endif -%}
    </div>
  </footer>

  {%- if footerText %}<p class="footer-text">{{ footerText }}</p>{% endif -%}
</div>
`;

/**
 * Stilangaben der Standardvorlage.
 *
 * Zwei Dinge tragen die Mehrseitigkeit (FA-PDF-04, -05, -07):
 * `display: table-header-group` auf `<thead>`, damit Chromium den Tabellenkopf
 * auf jeder Seite wiederholt, und `break-inside: avoid` auf Positionszeilen
 * und Summenblock, damit keine Zeile und keine Summe in der Mitte reißt.
 */
export const DEFAULT_TEMPLATE_CSS = `
:root {
  --paper-ink: #1c1f1c;
  --paper-muted: #5c625c;
  --paper-rule: #c9ccc5;
}

* { box-sizing: border-box; }

/*
 * Bezugsrahmen für den Informationsblock, der neben dem Anschriftfeld steht.
 * Ohne ihn bezöge sich dessen Absolutposition auf die Seite und wanderte bei
 * mehrseitigen Belegen mit.
 */
.sheet { position: relative; }

body {
  margin: 0;
  color: var(--paper-ink);
  font-family: 'Fira Sans', sans-serif;
  font-size: 9.5pt;
  line-height: 1.45;
  font-variant-numeric: tabular-nums lining-nums;
}

.num { font-variant-numeric: tabular-nums lining-nums; }

/* ── Briefkopf ─────────────────────────────────────────────────────────── */

.letterhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8mm;
  padding-bottom: 2mm;
}

.letterhead-name { font-size: 13pt; font-weight: 700; }
.letterhead-contact { color: var(--paper-muted); font-size: 8pt; }

/* ── Falz- und Lochmarken (DIN 5008) ───────────────────────────────────── */

.mark {
  position: fixed;
  left: -12mm;
  width: 5mm;
  border-top: 0.4pt solid var(--paper-rule);
}

/* Gemessen ab Blattoberkante, abzüglich des oberen Randes von 25 mm. */
.mark-fold-1 { top: 62mm; }
.mark-punch  { top: 123.5mm; width: 7mm; }
.mark-fold-2 { top: 167mm; }

/* ── Anschriftfeld und Informationsblock ───────────────────────────────── */

.address-field {
  /* 45 mm ab Blattoberkante, davon 25 mm Rand. */
  margin-top: 15mm;
  width: 85mm;
  height: 45mm;
}

.return-line {
  height: 17.7mm;
  padding-bottom: 1mm;
  border-bottom: 0.4pt solid var(--paper-rule);
  color: var(--paper-muted);
  font-size: 7pt;
}

.recipient { padding-top: 2mm; font-style: normal; }
.recipient-name { font-weight: 500; }

.info-block {
  position: absolute;
  top: 15mm;
  right: 0;
  width: 60mm;
  font-size: 9pt;
}

.info-block dl {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.6mm 4mm;
  margin: 0;
}

.info-block dt { color: var(--paper-muted); }
.info-block dd { margin: 0; text-align: right; }

/* ── Betreff und Text ──────────────────────────────────────────────────── */

.body { padding-top: 8mm; }

.subject {
  margin: 0 0 2mm;
  font-size: 12pt;
  font-weight: 700;
}

.draft-mark {
  margin-left: 2mm;
  padding: 0.5mm 1.5mm;
  border: 0.6pt solid var(--paper-ink);
  font-size: 8pt;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.service-period { margin: 0 0 4mm; color: var(--paper-muted); }
.preceding { margin: 0 0 4mm; }
.intro { margin: 0 0 5mm; }
.outro { margin: 5mm 0 0; }

/* ── Positionstabelle ──────────────────────────────────────────────────── */

.lines {
  width: 100%;
  border-collapse: collapse;
  margin-top: 3mm;
}

/* Wiederholt den Kopf auf jeder Folgeseite (FA-PDF-05). */
.lines thead { display: table-header-group; }

.lines th {
  padding: 1.5mm 2mm 1.5mm 0;
  border-bottom: 0.8pt solid var(--paper-ink);
  font-size: 8pt;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lines td {
  padding: 1.8mm 2mm 1.8mm 0;
  border-bottom: 0.4pt solid var(--paper-rule);
  vertical-align: top;
}

/* Keine Position reißt in der Mitte (FA-PDF-04). */
.lines tbody tr { break-inside: avoid; }

.col-pos    { width: 8mm; }
.col-qty    { width: 24mm; text-align: right; }
.col-price  { width: 24mm; text-align: right; }
.col-tax    { width: 14mm; text-align: right; }
.col-amount { width: 26mm; text-align: right; }

.lines .col-qty,
.lines .col-price,
.lines .col-tax,
.lines .col-amount { text-align: right; }

.line-name { font-weight: 500; }
.line-description { color: var(--paper-muted); font-size: 8.5pt; }

/* ── Summen ────────────────────────────────────────────────────────────── */

.totals {
  display: flex;
  justify-content: flex-end;
  margin-top: 4mm;
  /* Der Summenblock wird nicht getrennt (FA-PDF-07). */
  break-inside: avoid;
}

.totals table { border-collapse: collapse; min-width: 80mm; }

.totals th {
  padding: 1.2mm 4mm 1.2mm 0;
  font-weight: 400;
  text-align: left;
}

.totals td { padding: 1.2mm 0; text-align: right; white-space: nowrap; }

.totals-net th, .totals-net td { border-top: 0.4pt solid var(--paper-rule); }

.totals-gross th,
.totals-gross td {
  border-top: 0.8pt solid var(--paper-ink);
  font-weight: 700;
}

.totals-outstanding th, .totals-outstanding td { font-weight: 700; }

/* ── Hinweise und Zahlung ──────────────────────────────────────────────── */

.notices {
  margin-top: 5mm;
  break-inside: avoid;
}

.notices p { margin: 0 0 1.5mm; }

.payment {
  margin-top: 8mm;
  padding-top: 3mm;
  border-top: 0.4pt solid var(--paper-rule);
  break-inside: avoid;
}

.payment-terms { display: flex; gap: 12mm; }
.payment-block { min-width: 60mm; }

.payment-label,
.imprint-column .payment-label {
  color: var(--paper-muted);
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Absenderfuß ───────────────────────────────────────────────────────── */

.imprint {
  display: flex;
  gap: 8mm;
  margin-top: 6mm;
  padding-top: 2mm;
  border-top: 0.4pt solid var(--paper-rule);
  color: var(--paper-muted);
  font-size: 7.5pt;
  break-inside: avoid;
}

.imprint-column { flex: 1; }

.footer-text {
  margin-top: 2mm;
  color: var(--paper-muted);
  font-size: 7.5pt;
}
`;

export const DEFAULT_TEMPLATE_NAME = 'DIN 5008 (Standard)';

export const DEFAULT_TEMPLATE_DESCRIPTION =
  'Mitgelieferte Vorlage nach DIN 5008 Form B: Anschriftfeld im Fensterumschlag, ' +
  'Falzmarken, wiederholter Tabellenkopf und alle Pflichtangaben.';

/**
 * Startinhalt einer neu angelegten Vorlage.
 *
 * Ein Gerüst, das sofort rendert — wer eine Vorlage anlegt, soll etwas sehen
 * und nicht vor einem leeren Feld sitzen. Bewusst kurz: Die vollständige
 * Referenz ist die Standardvorlage oben.
 *
 * Liegt hier und nicht in der Oberfläche, weil es **Vorlagenquelltext** ist.
 * Der Tokensatz der Anwendung gilt für die Anwendung, nicht für Dokumente, die
 * Nutzer selbst gestalten (FA-UI-01 betrifft den Komponentencode).
 */
export const STARTER_TEMPLATE_HTML = `<div class="sheet">
  <h1>{{ invoice.documentTypeLabel }} {{ invoice.number }}</h1>
  <p>{{ buyer.name }} · {{ buyer.address.city }}</p>

  <table>
    {% for line in lines %}
    <tr>
      <td>{{ line.position }}</td>
      <td>{{ line.name }}</td>
      <td>{{ line.lineNet | money: invoice.currency }}</td>
    </tr>
    {% endfor %}
  </table>

  <p>{{ totals.gross | money: invoice.currency }}</p>
</div>
`;

export const STARTER_TEMPLATE_CSS = `body { font-family: 'Fira Sans', sans-serif; font-size: 10pt; }
table { width: 100%; border-collapse: collapse; }
td { padding: 2mm 0; border-bottom: 0.4pt solid #c9ccc5; }
`;
