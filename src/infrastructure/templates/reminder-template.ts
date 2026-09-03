/**
 * Die Vorlage der Mahnung (M15, FA-MAHN-06).
 *
 * **Sie teilt das CSS mit der Standardvorlage** und setzt nur eigene Regeln
 * obendrauf. Der Grund ist nicht Sparsamkeit: Anschriftfeld, Falzmarken,
 * Blattfuß und Schriftgrößen sind DIN-5008-Maße, und eine zweite Fassung davon
 * wäre eine zweite Wahrheit — die, die nach der nächsten Korrektur am Beleg
 * nicht mitgezogen wird. Wer den Rand des Belegs ändert, ändert ihn hier mit.
 *
 * **Sie gehört nicht dem Unternehmen.** Anders als die Belegvorlage (FA-TPL-01)
 * liegt sie nicht in `Template` und ist nicht bearbeitbar. Eine Mahnung ist ein
 * kurzer Brief mit festem Inhalt; was daran unternehmensspezifisch ist — Logo,
 * Anschrift, Bankverbindung, Briefpapier — kommt ohnehin aus den Firmendaten
 * und liegt unter jedem Blatt. Sollte sich das ändern, bekommt `Template` eine
 * Spalte `kind`; heute wäre sie eine Einstellung ohne Frage dahinter.
 *
 * Als TypeScript-Modul und nicht als Datei im Dateisystem — derselbe Grund wie
 * bei der Standardvorlage: Der Standalone-Build verfolgt keine zur Laufzeit
 * gelesenen Dateien.
 */
import { DEFAULT_TEMPLATE_CSS } from './default-template';

export const REMINDER_TEMPLATE_HTML = `<div class="sheet">

  {%- comment -%} Falz- und Lochmarken (DIN 5008), wie auf dem Beleg {%- endcomment -%}
  <div class="mark mark-fold-1"></div>
  <div class="mark mark-punch"></div>
  <div class="mark mark-fold-2"></div>

  <table class="page">
    <tfoot>
      <tr><td>
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

  <header class="letterhead">
    {%- if seller.logo -%}
    <img class="letterhead-logo" src="{{ seller.logo }}" alt="{{ seller.name }}">
    {%- else -%}
    <div class="letterhead-name">{{ seller.name }}</div>
    {%- endif -%}
  </header>

  <section class="address-field">
    <div class="return-line">
      {{ seller.name }} · {{ seller.address.addressLine1 }} · {{ seller.address.postalCode }} {{ seller.address.city }}
    </div>
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

  <section class="info-block">
    <dl>
      <dt>{{ reminder.levelLabel }}-Nr.</dt>
      <dd class="num">{{ reminder.number }}</dd>

      <dt>Datum</dt>
      <dd class="num">{{ reminder.issueDate | date }}</dd>

      {%- if buyer.customerNumber %}
      <dt>Kundennummer</dt>
      <dd class="num">{{ buyer.customerNumber }}</dd>
      {%- endif -%}
    </dl>
  </section>

  <main class="body">
    <h1 class="subject">{{ reminder.levelLabel }} zu Rechnung {{ invoice.number }}</h1>

    <p class="intro">{{ reminder.introText }}</p>

    {%- comment -%}
      Die gemahnte Rechnung mit ihren Daten — ohne sie wäre die Mahnung eine
      Behauptung. Keine Positionen und **keine Steuer**: Eine Mahnung weist
      keine Umsatzsteuer aus, sie fordert eine bestehende Forderung ein.
    {%- endcomment -%}
    <table class="lines reminder-invoice">
      <thead>
        <tr>
          <th class="col-name">Rechnung</th>
          <th class="col-qty">Datum</th>
          <th class="col-price">Fällig am</th>
          <th class="col-amount">Betrag</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="col-name num">{{ invoice.number }}</td>
          <td class="col-qty num">{{ invoice.issueDate | date }}</td>
          <td class="col-price num">{{ invoice.dueDate | date }}</td>
          <td class="col-amount num">{{ invoice.grossTotal | money: reminder.currency }}</td>
        </tr>
      </tbody>
    </table>

    <p class="reminder-overdue">{{ reminder.overdueText }}</p>

    <section class="totals">
      <table>
        <tbody>
          <tr class="totals-net">
            <th scope="row">Offener Betrag</th>
            <td class="num">{{ reminder.outstanding | money: reminder.currency }}</td>
          </tr>
          {%- if reminder.fee > 0 %}
          <tr>
            <th scope="row">Mahngebühr</th>
            <td class="num">{{ reminder.fee | money: reminder.currency }}</td>
          </tr>
          {%- endif -%}
          <tr class="totals-gross">
            <th scope="row">Zu zahlen</th>
            <td class="num">{{ reminder.total | money: reminder.currency }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <p class="outro">{{ reminder.outroText }}</p>
  </main>

  <section class="payment">
    <div class="payment-terms">
      <div class="payment-block">
        <div class="payment-label">Zahlung</div>
        <div>Bitte bis zum {{ reminder.dueDate | date }} auf das unten genannte Konto.</div>
        <div>Verwendungszweck: {{ invoice.number }}</div>
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
 * Die Stilangaben.
 *
 * Das CSS des Belegs, gefolgt von wenigen eigenen Regeln. Angehängt und nicht
 * vorangestellt: Was hier steht, soll gewinnen.
 */
export const REMINDER_TEMPLATE_CSS = `${DEFAULT_TEMPLATE_CSS}

/* Die gemahnte Rechnung steht in einer Zeile — vier Spalten statt sechs. */
.reminder-invoice .col-name { width: 30%; text-align: left; }
.reminder-invoice .col-qty,
.reminder-invoice .col-price { width: 20%; }
.reminder-invoice .col-amount { width: 30%; }

/*
 * Der Verzugssatz steht für sich, zwischen Aufstellung und Summe. Er ist die
 * eigentliche Aussage der Mahnung und soll nicht wie eine Fußnote wirken.
 */
.reminder-overdue {
  margin: 4mm 0 0;
  font-weight: 500;
}
`;
