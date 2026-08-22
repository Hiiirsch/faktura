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
 * - Falzmarken bei 105 mm und 210 mm, Lochmarke bei 148,5 mm.
 *
 * Die Ränder kommen aus der Geometrie der Vorlage (15/20/22/20 mm) und stehen
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

  {%- comment -%}
    Der ganze Beleg steht in einer Tabelle, damit der Blattfuß eine echte
    Fußgruppe sein kann (M11, FA-PDF-12).

    Der erste Anlauf war ein festes Element (position: fixed). Es erschien zwar
    auf jeder Seite, hielt aber **keinen Platz frei** — auf einer vollen Seite
    liefen die Positionszeilen mitten hindurch. Das sieht man erst am
    zweiseitigen PDF, nicht im Test und nicht am Bildschirm.

    Eine Fußgruppe (display: table-footer-group) tut beides: Sie wiederholt sich
    auf jeder Seite und der Umbruch rechnet mit ihr. Dasselbe Verfahren hält
    weiter unten schon den Tabellenkopf der Positionen auf jeder Seite.
  {%- endcomment -%}
  <table class="page">
    <tfoot>
      <tr><td>
      {%- comment -%}
        Der Blattfuß — seit M11 wirklich am Fuß des Blattes und auf **jeder** Seite
        (FA-PDF-12).

        Er steht in der Fußgruppe der Seitentabelle: Der Umbruch stellt ihn auf
        jeder Seite ganz unten hin und hält den Platz dafür frei. Genau das will
        ein Briefbogen — wer nur Seite 2 vor sich hat, findet die Bankverbindung
        trotzdem.

        Die Bankverbindung ist aus dem Fließtext hierher gezogen: Sie gilt dem
        Absender, nicht diesem einen Beleg. Das Zahlungsziel ist geblieben, wo es
        war (FA-PFL-10).

        Vier Spalten nach dem Vorbild des Auftraggebers: Anschrift, Kontakt,
        Steuer und Bank. Die Steuernummer steht hier — sie ist Pflichtangabe
        (FA-PFL-02), und der Briefbogen ist der übliche Ort dafür.
      {%- endcomment -%}
      <footer class="imprint">
        <div class="imprint-column">
          <div>{{ seller.name }}</div>
          <div>{{ seller.address.addressLine1 }}</div>
          <div>{{ seller.address.postalCode }} {{ seller.address.city }}</div>
        </div>
        <div class="imprint-column">
          {%- if seller.phone %}<div>Tel.: {{ seller.phone }}</div>{% endif -%}
          {%- if seller.email %}<div>E-Mail: {{ seller.email }}</div>{% endif -%}
          {%- if seller.website %}<div>Web: {{ seller.website }}</div>{% endif -%}
        </div>
        <div class="imprint-column">
          {%- if seller.taxNumber %}<div class="num">Steuer-Nr.: {{ seller.taxNumber }}</div>{% endif -%}
          {%- if seller.vatId %}<div class="num">USt-IdNr.: {{ seller.vatId }}</div>{% endif -%}
          {%- if seller.managingDirector %}<div>Inhaber/-in: {{ seller.managingDirector }}</div>{% endif -%}
          {%- if seller.registerCourt %}<div>{{ seller.registerCourt }} {{ seller.registerNumber }}</div>{% endif -%}
        </div>
        {%- if seller.bankAccountHolder %}
        <div class="imprint-column">
          <div>{{ seller.bankName }}</div>
          {%- if seller.iban %}<div class="num">IBAN: {{ seller.iban }}</div>{% endif -%}
          {%- if seller.bic %}<div class="num">BIC: {{ seller.bic }}</div>{% endif -%}
        </div>
        {%- endif -%}
      </footer>
      </td></tr>
    </tfoot>
    <tbody>
      <tr><td>

  {%- comment -%}
    Briefkopf mit dem Logo des ausstellenden Unternehmens (M11, FA-TPL-12).

    Es kommt als data:-URI aus dem Dokumentmodell — der Renderer hat kein Netz.
    Ohne hinterlegtes Logo steht hier der Name in Auszeichnungsschrift; ein
    leerer Kopf wäre schlechter als ein gesetzter.

    Die Höhe ist begrenzt und das Seitenverhältnis bleibt erhalten: Ein hohes
    Hochformat soll den Kopf nicht sprengen.
  {%- endcomment -%}
  <header class="letterhead">
    {%- if seller.logo -%}
    <img class="letterhead-logo" src="{{ seller.logo }}" alt="{{ seller.name }}">
    {%- else -%}
    <div class="letterhead-name">{{ seller.name }}</div>
    {%- endif -%}
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
          {%- if showsTax %}<th class="col-tax">USt.</th>{% endif -%}
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
          {%- if showsTax %}<td class="col-tax num">{{ line.taxRate | percent }}</td>{% endif -%}
          <td class="col-amount num">{{ line.lineNet | money: invoice.currency }}</td>
        </tr>
        {%- endfor %}
      </tbody>
    </table>

    {%- comment -%} Summen je Steuersatz, FA-PFL-07 und FA-PFL-08 {%- endcomment -%}
    <section class="totals">
      <table>
        <tbody>
          {%- comment -%}
            Aufbau nach dem Vorbild des Auftraggebers (M11):
            Nettobetrag — Steuerangabe — Gesamtbetrag.

            Ohne Steuerpflicht entfällt die Steuerzeile, aber **nicht** der
            Nettobetrag: Zwischen ihm und dem Gesamtbetrag steht dann der
            §19-Hinweis und erklärt, warum beide gleich sind (FA-PFL-13).
          {%- endcomment -%}
          <tr class="totals-net">
            <th scope="row">Gesamtbetrag netto</th>
            <td class="num">{{ totals.net | money: invoice.currency }}</td>
          </tr>
          {%- if showsTax %}
          {%- for group in taxBreakdown %}
          <tr>
            <th scope="row">
              {{ group.categoryLabel }} {{ group.rate | percent }} auf {{ group.net | money: invoice.currency }}
            </th>
            <td class="num">{{ group.tax | money: invoice.currency }}</td>
          </tr>
          {%- endfor %}
          {%- else -%}
          {%- for notice in notices %}
          <tr class="totals-notice">
            <th scope="row" colspan="2">{{ notice }}</th>
          </tr>
          {%- endfor %}
          {%- endif %}
          <tr class="totals-gross">
            <th scope="row">Gesamtbetrag brutto</th>
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
    {%- if showsTax and notices.size > 0 %}
    <section class="notices">
      {%- for notice in notices %}<p>{{ notice }}</p>{% endfor -%}
    </section>
    {%- endif -%}

    {%- if invoice.outroText %}<p class="outro">{{ invoice.outroText }}</p>{% endif -%}
  </main>

  {%- comment -%}
    Zahlungsziel im Fließtext (FA-PFL-10). Die **Bankverbindung** steht seit M11
    im Blattfuß: Sie gehört zum Briefbogen und gilt für jede Seite. Das
    Zahlungsziel gilt dagegen genau diesem einen Beleg und bleibt deshalb hier.
  {%- endcomment -%}
  <section class="payment">
    <div class="payment-terms">
      <div class="payment-block">
        <div class="payment-label">Zahlung</div>
        {%- for notice in paymentNotices %}<div>{{ notice }}</div>{% endfor -%}
      </div>
    </div>
  </section>



  {%- if footerText %}<p class="footer-text">{{ footerText }}</p>{% endif -%}
      </td></tr>
    </tbody>
  </table>
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
  /* Für Text auf dunkler Fläche — die Kopfleiste der Positionstabelle (M11). */
  --paper-paper: #ffffff;
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

/*
 * Feste Höhe, damit das Anschriftfeld darunter auf 45 mm liegt (DIN 5008
 * Form B). 15 mm oberer Rand + 30 mm Briefkopf = 45 mm.
 *
 * Der Inhalt richtet sich unten aus: Ein kleines Logo hängt dann nicht in der
 * Luft, sondern steht auf derselben Linie wie ein großes.
 */
.letterhead {
  height: 30mm;
  align-items: flex-end;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8mm;
  padding-bottom: 2mm;
}

.letterhead-name { font-size: 13pt; font-weight: 700; }
.letterhead-contact { color: var(--paper-muted); font-size: 8pt; }

/*
 * Das Logo (M11, FA-TPL-12).
 *
 * Höhe begrenzt, Breite frei: So bleibt das Seitenverhältnis erhalten, und ein
 * hohes Hochformat sprengt den Kopf nicht. Die Breite ist zusätzlich gedeckelt,
 * damit ein sehr breites Logo nicht in den Informationsblock läuft.
 *
 * **28 mm ist keine Geschmacksfrage, sondern Rechnung.** Das Anschriftfeld
 * beginnt bei Form B 45 mm unter der Blattkante; darüber liegen der obere Rand
 * (15 mm) und der Briefkopf. 15 + 28 + 2 mm Abstand ergeben genau 45. Ein
 * höheres Logo schöbe das Feld nach unten, und die Anschrift stünde nicht mehr
 * im Fenster des Umschlags.
 */
.letterhead-logo {
  max-height: 28mm;
  max-width: 80mm;
  width: auto;
  height: auto;
}

/* ── Falz- und Lochmarken (DIN 5008) ───────────────────────────────────── */

.mark {
  position: fixed;
  left: -12mm;
  width: 5mm;
  border-top: 0.4pt solid var(--paper-rule);
}

/*
 * Gemessen ab Blattoberkante, abzüglich des oberen Randes von 15 mm.
 *
 * Form B falzt bei 105 und 210 mm, gelocht wird bei 148,5 mm. Bis M11 standen
 * hier 87 und 192 — das sind die Marken von **Form A**, während der Rest der
 * Vorlage Form B folgte. Zusammen mit dem verschobenen Anschriftfeld lief die
 * erste Falzmarke dadurch mitten durch die Empfängeranschrift.
 */
.mark-fold-1 { top: 90mm; }
.mark-punch  { top: 133.5mm; width: 7mm; }
.mark-fold-2 { top: 195mm; }

/* ── Anschriftfeld und Informationsblock ───────────────────────────────── */

/*
 * Das Anschriftfeld beginnt 45 mm unter der Blattkante (DIN 5008 Form B).
 *
 * Es steht ohne eigenen Abstand direkt unter dem Briefkopf — die 45 mm kommen
 * aus dem oberen Rand (15 mm) und der **festen** Höhe des Briefkopfs (30 mm).
 *
 * Vorher hing hier ein Abstand von 15 mm am Briefkopf, und der wuchs mit seinem
 * Inhalt: Mit dem Logo war das Feld auf 74 mm gewandert, die erste Falzmarke lief
 * mitten hindurch, und im Fenster eines DIN-lang-Umschlags stand nichts. Ein
 * Maß, das von der Höhe eines Bildes abhängt, ist kein Maß.
 */
.address-field {
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

/* Auf gleicher Höhe wie das Anschriftfeld: 30 mm ab Satzspiegel = 45 mm ab Blatt. */
.info-block {
  position: absolute;
  top: 30mm;
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

/*
 * Kopfleiste als Fläche, nach dem Vorbild des Auftraggebers (M11).
 *
 * Sie trennt die Positionen deutlicher vom Fließtext darüber als eine Linie —
 * und wiederholt sich auf jeder Folgeseite mit, weil sie im Tabellenkopf sitzt.
 */
.lines th {
  padding: 1.5mm 2mm;
  background: var(--paper-ink);
  color: var(--paper-paper);
  font-size: 8pt;
  font-weight: 600;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lines th:first-child { padding-left: 2mm; }
.lines td:first-child { padding-left: 2mm; }

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

/*
 * Summen über die volle Breite, nach dem Vorbild des Auftraggebers (M11).
 *
 * Bezeichnung links, Betrag rechts, in der Flucht der Betragsspalte darüber.
 * Der frühere rechtsbündige Block stand für sich; so liest sich der Abschluss
 * als Fortsetzung der Tabelle.
 */
.totals {
  margin-top: 4mm;
  /* Der Summenblock wird nicht getrennt (FA-PDF-07). */
  break-inside: avoid;
}

.totals table { width: 100%; border-collapse: collapse; }

.totals th {
  padding: 1.2mm 2mm;
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

/* Der Pflichthinweis steht zwischen Netto und Brutto und erklärt ihre Gleichheit. */
.totals-notice th { font-weight: 400; }

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

/*
 * Die Seitentabelle trägt nur die Fußgruppe.
 *
 * Sie darf nichts an der Darstellung ändern: keine Abstände, keine Rahmen, volle
 * Breite. Eine Tabelle ohne eigenes Aussehen, allein für den Seitenumbruch.
 *
 * **Die Mindesthöhe ist der Grund, warum der Fuß unten steht.** Eine Fußgruppe
 * sitzt am Ende ihrer Tabelle — bei einer kurzen Rechnung wäre das mitten auf
 * dem Blatt, und genau so sah es vorher aus. Erst wenn die Tabelle die Seite
 * ausfüllt, fällt ihr Fuß mit dem Blattfuß zusammen.
 *
 * 260 mm sind A4 (297) minus die Ränder dieser Vorlage (15 oben, 22 unten). Wer
 * die Ränder ändert, ändert diesen Wert mit — deshalb steht die Rechnung hier
 * und nicht als nackte Zahl.
 *
 * **Was das nicht löst:** Auf der *letzten* Seite eines mehrseitigen Belegs
 * steht der Fuß weiterhin direkt unter dem Inhalt. Die Mindesthöhe gilt der
 * ganzen Tabelle, nicht jedem Abschnitt — der letzte Abschnitt endet dort, wo
 * der Inhalt endet, und CSS kennt keinen Weg, ihn auf volle Seitenhöhe zu
 * bringen. Wer das will, muss den Fuß in den Randkasten des PDF verlegen
 * (footerTemplate), und dann gehört er nicht mehr der Vorlage.
 */
.page {
  width: 100%;
  min-height: 260mm;
  border-collapse: collapse;
}

.page > tbody > tr > td,
.page > tfoot > tr > td {
  padding: 0;
  vertical-align: top;
}

.page > tfoot { display: table-footer-group; }

/* ── Absenderfuß ───────────────────────────────────────────────────────── */

/*
 * Fest am Fuß jeder Seite (M11, FA-PDF-12).
 *
 * position: fixed bezieht sich beim Druck auf die Seite, nicht auf das
 * Dokument — Chromium setzt das Element deshalb auf jeder Seite erneut. Dasselbe
 * Verfahren trägt schon die Falz- und Lochmarken darüber.
 *
 * Er sitzt in der Fußgruppe der Seitentabelle (siehe oben im Markup) und braucht
 * deshalb **keine** Positionierung: Der Umbruch stellt ihn auf jeder Seite ganz
 * unten hin und hält den Platz dafür frei.
 *
 * Der erste Anlauf war position: fixed. Das erschien zwar auf jeder Seite, hielt
 * aber keinen Platz frei — auf einer vollen Seite liefen die Positionszeilen
 * mitten durch den Fuß. Sichtbar wurde das erst am zweiseitigen PDF.
 */
.imprint {
  display: flex;
  justify-content: space-between;
  gap: 5mm;
  padding-top: 2mm;
  border-top: 0.4pt solid var(--paper-rule);
  color: var(--paper-muted);
  /*
   * 6,2 pt statt 7,5 (M11).
   *
   * Die längste Zeile im Blattfuß ist die IBAN: 22 Stellen plus Beschriftung.
   * Sie darf nicht umbrechen — eine Kontonummer über zwei Zeilen liest niemand
   * fehlerfrei ab, und genau das soll der Empfänger tun. Die Schriftgröße
   * richtet sich deshalb nach ihr und nicht nach dem Rest.
   *
   * Der Spaltenabstand geht von 8 auf 5 mm mit: Vier Spalten auf 170 mm sind
   * eng, und jeder Millimeter Abstand fehlt der längsten Zeile.
   */
  font-size: 6.2pt;
  line-height: 1.45;
}

.imprint-column { flex: 1 1 0; min-width: 0; }

/*
 * Die Kontaktspalte trägt die längsten Zeilen — eine Adresse wie
 * „info@timhirschmiller-fotografie.de" ist länger als jede IBAN. Gleich breite
 * Spalten ließen genau sie umbrechen, während daneben Platz frei bleibt.
 */
.imprint-column:nth-child(2) { flex: 1.45; }

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
