/**
 * Der Suchindex des Handbuchs — **erzeugt, nicht von Hand geschrieben**.
 *
 * Quelle sind die MDX-Dateien in `src/content/hilfe/`. Neu erzeugt wird er mit
 * `npm run docs:index`; dass er zu den Quellen passt, hält
 * `tests/architecture/docs-index.test.ts` fest.
 *
 * Änderungen an dieser Datei gehen beim nächsten Lauf verloren.
 */
import type { HelpIndexEntry } from './search';

export const HELP_INDEX: readonly HelpIndexEntry[] = [
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Anmelden",
    "text": "Die Anmeldung läuft in zwei Schritten: zuerst E-Mail-Adresse und Passwort, danach der Code des zweiten Faktors. Der zweite Schritt erscheint nur, wenn für das Konto ein zweiter Faktor eingerichtet ist. Ein Passwort ist mindestens … Zeichen lang. Passwörter aus bekannten Datenlecks werden abgewiesen. Nach … Fehlversuchen sperrt sich das Konto für … Die Sperre endet von selbst. Eine Sitzung gilt …"
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Passwort vergessen",
    "text": "Ein vergessenes Passwort lässt sich auf der Anmeldeseite selbst anfordern. Der Link dazu gilt … und lässt sich einmal einlösen. Das bisherige Passwort bleibt gültig, bis ein neues gesetzt ist. Die Antwort ist in jedem Fall dieselbe — auch bei einer unbekannten Adresse. Alles andere wäre eine Auskunft darüber, wer hier ein Konto hat."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Ein Konto entsteht nur per Einladung",
    "text": "Eine Selbstregistrierung gibt es nicht. Wer ein Konto braucht, wird von einem Konto mit Rechteverwaltung eingeladen."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Export",
    "text": "Der Datenexport liefert Kunden, Belege mit Positionen und Zahlungen, Vorlagen, Nummernkreise und das Protokoll als JSON — ohne Zugangsdaten. Ein Export wird weitergereicht; Passwörter und Sitzungen gehören dort nicht hinein."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Sicherung",
    "text": "Die Sicherung umfasst Datenbank und Dateispeicher und wird vom Betreiber der Installation ausgelöst. Beides gehört zusammen: Ein festgeschriebener Beleg verweist auf seine PDF-Datei samt Prüfsumme, und eine Sicherung ohne sie ist keine."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Protokoll",
    "text": "Jede Änderung an Belegen, Kunden und Firmendaten steht mit Zeitpunkt, Aktion und handelndem Konto im Protokoll. Über die Anwendung lässt es sich weder ändern noch löschen."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Festschreiben — und was danach gilt",
    "text": "Mit dem Festschreiben bekommt der Beleg seine Nummer, seine Daten werden eingefroren und das PDF entsteht. Ab hier ist er unveränderlich — durchgesetzt in der Datenbank, nicht nur in der Oberfläche. Die Nummer ist fortlaufend und lückenlos. Es gibt keinen Weg, sie nachträglich zu ändern. Das PDF entsteht genau einmal und wird mit Prüfsumme abgelegt. Eine spätere Änderung an der Vorlage verändert es nicht. Änderbar bleiben nur Status, Zahlungsstand und Stornovermerk."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Ein Fehler wird storniert, nicht korrigiert",
    "text": "Beim Stornieren entsteht eine Gutschrift mit eigener Nummer; der ursprüngliche Beleg wechselt auf „Storniert\". Beide bleiben erhalten, und zusammen ergeben sie null. Eine Gutschrift trägt selbst positive Beträge — die Richtung steckt im Belegtyp. Sie wird nie überfällig und nimmt keine Zahlungen an."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Kein Löschen",
    "text": "Ein festgeschriebener Beleg lässt sich nicht löschen. Das ist keine Einstellung, sondern die Aufbewahrungspflicht nach §147 AO."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Firmendaten",
    "text": "Die Firmendaten stehen auf jedem Beleg. Was dort fehlt, fehlt auf der Rechnung — und §14 UStG verlangt es. Anschrift, Steuernummer oder USt-IdNr. gehören deshalb vor den ersten Beleg."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Kleinunternehmerregelung",
    "text": "Ist die Regelung nach §19 UStG gesetzt, weist kein Beleg Umsatzsteuer aus: keine Spalte, keine Steuerzeile, kein Betrag. Netto und Brutto bleiben beide stehen; dazwischen erklärt ein Hinweis, warum sie gleich sind. Der Grund für die Strenge: Was ausgewiesen ist, schuldet man nach §14c — auch wenn es falsch ist."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Aussehen des Belegs",
    "text": "Das Logo erscheint im Briefkopf jedes Belegs. Das Briefpapier ist eine einseitige A4-PDF und wird unter jede Seite gelegt. Es trägt nur Gestaltung; Anschrift, Bankverbindung und Pflichtangaben setzt die Vorlage."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Weitere Vorgaben",
    "text": "Nummernkreis, Zahlungsziel, Währung, Standardsteuersatz und die Mahngebühren je Stufe sind ebenfalls hier hinterlegt."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Was Faktura nicht tut",
    "text": "Eine Auskunft darüber, was fehlt, spart die Suche danach. Keine Datenübertragung an Dritte. Die einzige ausgehende Verbindung führt zu einem Mailserver, den der Betreiber selbst benennt. Ohne diese Einrichtung läuft die Anwendung vollständig ohne Netz nach außen. Keine externen Schriften, Skripte oder Analysedienste, keine Reichweitenmessung, keine Einwilligungsabfrage — es gibt nichts einzuwilligen. Keine automatischen Läufe. Weder Mahnungen noch Sicherungen laufen von selbst. Was geschieht, hat jemand ausgelöst. Kein Löschen von Belegen, keine Selbstregistrierung, keine Buchhaltungsanbindung und keine Steuerberatung."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Mahnungen",
    "text": "Zu einer überfälligen, offenen Rechnung lässt sich eine Mahnung ausstellen. Es gibt … Stufen: Zahlungserinnerung, Mahnung, letzte Mahnung. Jede Mahnung ist ein eigenes Dokument mit eigener Nummer und eigenem PDF. Ihr Nummernkreis ist von dem der Rechnungen getrennt. Die Mahngebühr je Stufe steht in den Firmendaten. Verzugszinsen berechnet Faktura nicht. Eine Mahnung weist keine Umsatzsteuer aus — sie fordert eine bestehende Forderung ein und begründet keine neue. Die Beträge sind eingefroren: Eine spätere Teilzahlung ändert ein bereits verschicktes Schreiben nicht. Die Mahnung setzt eine neue, kurze Zahlungsfrist. Die Frist der Rechnung bleibt unberührt. Nach der letzten Stufe entsteht keine weitere."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Wenn nicht gemahnt wird",
    "text": "Steht der Knopf nicht da, nennt die Belegseite den Grund — etwa „noch nicht überfällig\", „nichts mehr offen\" oder „eine Gutschrift wird nicht gemahnt\". Das ist eine Auskunft, kein Fehler."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Mitglieder und Rollen",
    "text": "Jedes Unternehmen legt eigene Rollen an; fest ist nur der Katalog der Berechtigungen. Ein Konto trägt genau eine Rolle."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Einladen",
    "text": "Eine Einladung gilt … und erscheint genau einmal in der Oberfläche. Ist ein Mailserver eingerichtet, geht sie zusätzlich hinaus — nie stattdessen. Das Passwort setzt der Eingeladene. Kein anderes Konto erfährt es je, auch die Rechteverwaltung nicht: Sie stellt einen Nachweis aus, sie vergibt kein Passwort. Wer erneut einlädt, entwertet den vorigen Link."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Ausscheiden",
    "text": "Ein Konto wird gesperrt, nicht gelöscht: Der Beleg behält seinen Urheber. Die Sperre beendet sofort alle Sitzungen des Kontos. Mindestens ein nicht gesperrtes Konto hält immer die Rechteverwaltung. Das letzte lässt sich weder sperren noch seiner Rolle berauben — sonst käme niemand mehr in das Unternehmen hinein."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Fehlende Rechte",
    "text": "Ein Konto, dem ein Recht fehlt, sieht den Weg dorthin nicht. Fehlt ein Menüpunkt, fehlt die Berechtigung."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Eine Rechnung schreiben",
    "text": "Neue Rechnung anlegen. Sie entsteht als Entwurf und darf unvollständig sein — das ist sein Zweck. Empfänger wählen, Positionen erfassen, Datum und Zahlungsziel prüfen. Die Vorschau rechts zeigt das PDF selbst, keine Nachbildung. Nach dem Speichern erneuert sie sich. Über den Knöpfen steht, was zum Festschreiben noch fehlt. Jede Zeile führt zu ihrem Feld. Festschreiben."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Steuerliche Behandlung",
    "text": "Die Anwendung schlägt sie vor und begründet den Vorschlag: Regelbesteuerung im Inland. Reverse Charge beim Kunden im EU-Ausland mit USt-IdNr. Ausfuhr beim Kunden im Drittland. Bei der Kleinunternehmerregelung ist die Behandlung festgestellt, keine Frage: Sie kommt aus den Firmendaten und schlägt alles andere. Abweichen bleibt möglich, kostet aber einen bewussten Schritt."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Was der Entwurf noch nicht ist",
    "text": "Ein Entwurf hat keine Nummer, zählt nicht zum Umsatz und trägt im PDF einen sichtbaren Vermerk. Er lässt sich ändern, kopieren und löschen."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Zweiter Faktor",
    "text": "Ein Code aus einer Authenticator-App, dazu … Wiederherstellungscodes für den Fall, dass das Gerät verloren geht. Die Codes werden genau einmal angezeigt; jeder gilt einmal."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Passkey",
    "text": "Der private Schlüssel verlässt das Gerät nie, und die Signatur bindet sich an die Adresse der aufrufenden Seite — eine nachgebaute Anmeldeseite bekommt nichts. Die Gerätesperre ist dabei der zweite Faktor; deshalb meldet ein Passkey allein an."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Vertraute Geräte",
    "text": "Nach erfolgreichem zweitem Faktor lässt sich ein Gerät als vertraut hinterlegen; dort entfällt der Code für … Das Passwort wird weiterhin verlangt. Jeder Nachweis ist einzeln sichtbar und einzeln widerrufbar."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Angemeldete Geräte",
    "text": "Jede Sitzung ist sichtbar und einzeln zu beenden. „Alle anderen beenden\" endet zugleich jedes Gerätevertrauen. Jede Zurücksetzung des Passworts beendet alle Sitzungen und alle Gerätevertrauen — auch die vom Betreiber ausgelöste."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Kunden und Katalog",
    "text": "Kunden und Katalogpositionen sind Vorlagen für die tägliche Arbeit, keine Pflicht: Ein Beleg kommt auch ohne Kundendatensatz aus."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Drei Wege zum Empfänger",
    "text": "Kunde aus den Stammdaten — die Anschrift kommt von dort. Felder am Beleg — dieselben Angaben, nur einmalig erfasst. Freier Anschriftenblock — Zeile für Zeile, wie eingegeben. Die erste Zeile ist der Name; Name und Anschrift müssen auf getrennten Zeilen stehen, sonst fehlt dem Beleg die Anschrift des Empfängers."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Archivieren statt löschen",
    "text": "Kunden werden archiviert, nicht gelöscht: Ein Beleg verweist auf seinen Empfänger, und der Verweis darf nicht ins Leere zeigen. Ein archivierter Kunde erscheint nicht mehr in der Auswahl, seine Belege bleiben unverändert."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Vorlagen und PDF",
    "text": "Die Belegvorlage gehört dem Unternehmen: Sie liegt als Kopie in dieser Installation. Änderungen an der ausgelieferten Standardvorlage erreichen sie nicht — wer die Verbesserungen will, setzt die Ränder nach oder legt die Standardvorlage neu an. Der Satz folgt DIN 5008: Das Anschriftfeld sitzt im Fenster eines DIN-lang-Umschlags, dazu Falz- und Lochmarken. Die Seitenzahl erscheint erst ab Seite 2. Der Blattfuß mit Anschrift, Kontakt, Steuernummer und Bankverbindung wiederholt sich auf jeder Seite. Das Briefpapier liegt unter dem Satz, die Seitenzahl darüber."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Vorschau",
    "text": "Die Vorschau zeigt dasselbe PDF, das auch heruntergeladen wird — dieselbe Schrift, dieselbe Geometrie. Blättern, Zoom, Ziehen mit der Maus und Vollbild gehören zur Anwendung, nicht zum Betrachter des Browsers."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Zahlungen",
    "text": "Zahlungen werden einzeln erfasst; der Status folgt daraus und wird nicht von Hand gesetzt: Offen — es steht Geld aus. Teilweise bezahlt — ein Teil ist eingegangen. Bezahlt — nichts mehr offen. Überfällig — offen und die Frist ist verstrichen. Der offene Betrag ergibt sich aus der Differenz zwischen Bruttobetrag und Summe der Zahlungen. Eine Zahlung lässt sich zurücknehmen; der Vorgang steht im Protokoll. Eine Stornorechnung nimmt keine Zahlungen an und wird nie überfällig: Sie stellt keine Forderung, sie nimmt eine zurück."
  }
];
