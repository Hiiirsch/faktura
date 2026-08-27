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
    "text": "Die Anmeldung läuft in zwei Schritten: zuerst E-Mail-Adresse und Passwort, danach der Code des zweiten Faktors. Der zweite Schritt erscheint nur, wenn für das Konto ein zweiter Faktor eingerichtet ist — sonst führt der erste direkt hinein. Zwischen beiden Schritten liegt ein Zustand mit eigener Frist: Wer das Passwort eingegeben hat, aber den Code schuldig bleibt, hat … Zeit. Danach beginnt die Anmeldung von vorn."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Das Passwort",
    "text": "Mindestens … Zeichen. Keine Vorschrift über Zahlen, Sonderzeichen oder Großbuchstaben: Länge trägt mehr als Zeichenklassen, und erzwungene Muster führen zu Passwort1!. Passwörter aus bekannten Datenlecks werden abgewiesen. Die Prüfung läuft auf dem Server gegen eine mitgelieferte Liste; es geht dabei nichts nach außen. Ein Passwort lässt sich mit dem Augensymbol im Feld sichtbar machen, solange es getippt wird."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Wenn die Anmeldung nicht klappt",
    "text": "Nach … Fehlversuchen sperrt sich das Konto für … Die Sperre endet von selbst; niemand muss sie aufheben. Der Zähler läuft über beide Schritte. Ein richtiges Passwort setzt ihn nicht zurück — sonst wäre der Code beliebig oft ratbar. Unbekannte Adresse und falsches Passwort werden gleich beantwortet, und zwar mit gleichem Zeitaufwand. Die Meldung sagt deshalb nicht, welches von beidem nicht stimmte."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Wie lange eine Anmeldung hält",
    "text": "Eine Sitzung gilt … Danach ist eine neue Anmeldung fällig. Unter Sicherheit stehen alle angemeldeten Geräte; jedes lässt sich einzeln beenden."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Passwort vergessen",
    "text": "Auf der Anmeldeseite steht der Weg dorthin. Nach Eingabe der Adresse gilt: Der Link kommt per E-Mail, sofern ein Mailversand eingerichtet ist. Er gilt … und lässt sich einmal einlösen. Das bisherige Passwort bleibt gültig, bis ein neues gesetzt ist. Mit dem neuen Passwort enden alle Sitzungen und alle vertrauten Geräte. Die Antwort auf der Seite ist in jedem Fall dieselbe — auch bei einer unbekannten Adresse, einem gesperrten Konto oder einem stillgelegten Unternehmen. Alles andere wäre eine Auskunft darüber, wer hier ein Konto hat. Binnen weniger Minuten entsteht kein zweiter Link. Wer zweimal drückt, bekommt keine zweite Mail."
  },
  {
    "topicId": "anmeldung",
    "topicTitle": "Anmelden",
    "heading": "Der erste Zugang",
    "text": "Ein Konto entsteht ausschließlich per Einladung; eine Selbstregistrierung gibt es nicht. Wer eingeladen wird, bekommt einen Link, setzt sein Passwort und meldet sich anschließend regulär an — der Link selbst eröffnet keine Sitzung. Kommt die Einladung nicht an, hilft nur eine neue: Der Link erscheint auch in der Oberfläche desjenigen, der einlädt, und lässt sich von dort weitergeben."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Export",
    "text": "Der Datenexport liefert Kunden, Belege mit Positionen und Zahlungen, Vorlagen, Nummernkreise und das Protokoll als JSON — maschinenlesbar und vollständig für dieses Unternehmen. Was nicht darin steht: Passwörter, Sitzungen, Wiederherstellungscodes, Passkeys. Ein Export wird weitergereicht; Zugangsdaten gehören dort nicht hinein. Er umfasst ausschließlich das eigene Unternehmen. Führt eine Installation mehrere, sieht keiner die Daten des anderen."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Sicherung",
    "text": "Die Sicherung umfasst Datenbank und Dateispeicher und wird vom Betreiber der Installation ausgelöst. Beides gehört zusammen: Ein festgeschriebener Beleg verweist auf seine PDF-Datei samt Prüfsumme, und eine Sicherung ohne die Dateien ist keine. Die Anwendung plant nichts von selbst. Ein Zeitplan ist Sache des Betriebs — ein eingebauter Zeitgeber liefe mit, ohne dass jemand ihn sieht."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Protokoll",
    "text": "Jede Änderung an Belegen, Kunden und Firmendaten steht mit Zeitpunkt, Aktion und handelndem Konto im Protokoll: Anlegen, Ändern, Festschreiben, Stornieren, Zahlungen, Mahnungen, Einladungen, Rollenänderungen. Über die Anwendung lässt es sich weder ändern noch löschen — auch nicht von einem Konto mit allen Rechten. Greift der Betreiber der Installation ein — etwa indem er eine Einladung erneut ausstellt —, steht das ebenfalls im Protokoll des Unternehmens, ausdrücklich als Handlung des Betreibers gekennzeichnet."
  },
  {
    "topicId": "daten",
    "topicTitle": "Daten sichern und mitnehmen",
    "heading": "Aufbewahrung",
    "text": "Belege werden nicht gelöscht. §147 AO verlangt zehn Jahre; wo in der Oberfläche ein Löschversuch naheliegt, steht der Grund daneben. Kunden und Katalogpositionen werden archiviert, Konten gesperrt. Gelöscht wird in dieser Anwendung grundsätzlich nichts, was auf einem Beleg steht."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Festschreiben — und was danach gilt",
    "text": "Mit dem Festschreiben bekommt der Beleg seine Nummer, seine Daten werden eingefroren und das PDF entsteht. Ab hier ist er unveränderlich — durchgesetzt in der Datenbank, nicht nur in der Oberfläche. <InvoiceLifecycle />"
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Was dabei geschieht",
    "text": "Die Nummer wird vergeben: fortlaufend und lückenlos, nach dem Muster aus den Firmendaten. Es gibt keinen Weg, sie nachträglich zu ändern. Empfänger und Absender werden kopiert. Der Beleg trägt fortan seine eigene Fassung; ändert sich später eine Anschrift, ändert das den Beleg nicht. Das PDF entsteht sofort und wird mit Prüfsumme abgelegt. Jeder weitere Abruf liefert dieselbe Datei — auch nach einer Änderung an der Vorlage. Der Vorgang steht mit Zeitpunkt und handelndem Konto im Protokoll."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Was danach noch geht",
    "text": "Änderbar bleiben nur Status, Zahlungsstand und Stornovermerk. Positionen, Beträge, Empfänger, Datum und Nummer nicht. Ein festgeschriebener Beleg lässt sich nicht löschen. Das ist keine Einstellung, sondern die Aufbewahrungspflicht nach §147 AO — zehn Jahre."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Ein Fehler wird storniert, nicht korrigiert",
    "text": "Beim Stornieren entsteht eine Gutschrift mit eigener Nummer; der ursprüngliche Beleg wechselt auf „Storniert\". Beide bleiben erhalten, und zusammen ergeben sie null. Danach lässt sich der Vorgang neu berechnen: Der stornierte Beleg dient als Vorlage, das Duplikat wird korrigiert und festgeschrieben. Über eine Gutschrift ist zu wissen: Sie trägt positive Beträge — die Richtung steckt im Belegtyp, nicht im Vorzeichen. So schreibt es die europäische Rechnungsnorm vor. Sie zeigt den Status „Ausgestellt\" und wird nie überfällig: Sie stellt keine Forderung. Sie nimmt keine Zahlungen an und lässt sich nicht selbst stornieren. Sie zählt nicht zum Umsatz. Neutralisiert wird dadurch, dass das Original auf „Storniert\" wechselt — zählte die Gutschrift zusätzlich, fehlte der Betrag zweimal."
  },
  {
    "topicId": "festschreiben",
    "topicTitle": "Festschreiben",
    "heading": "Der Entwurf davor",
    "text": "Ein Entwurf hat keine Nummer, zählt nicht zum Umsatz und trägt im PDF einen sichtbaren Vermerk. Er lässt sich ändern, kopieren und löschen. Sein PDF wird bei jedem Abruf neu gesetzt und nicht abgelegt: Ein archiviertes PDF von etwas jederzeit Änderbarem wäre irreführend."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Firmendaten",
    "text": "Die Firmendaten stehen auf jedem Beleg. Was hier fehlt, fehlt auf der Rechnung — und §14 UStG verlangt es. Sie gehören deshalb vor den ersten Beleg, nicht danach. <Screenshot src=\"firmendaten\" alt=\"Das Formular der Firmendaten mit Feldern für Name, Anschrift, Steuernummer, Bankverbindung, Logo und Briefpapier.\" caption=\"Die Firmendaten\" />"
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Was auf den Beleg muss",
    "text": "Vollständiger Name und Anschrift des Unternehmens. Steuernummer oder USt-IdNr. — eines von beidem genügt, beides ist erlaubt. Bankverbindung, damit die Rechnung bezahlt werden kann. Sie steht im Blattfuß und gilt für jede Seite. Bei eingetragenen Gesellschaften zusätzlich Registergericht, Registernummer und die vertretungsberechtigte Person. Fehlt etwas davon, meldet es der Beleg beim Festschreiben — mit dem Hinweis, welches Feld gemeint ist."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Kleinunternehmerregelung nach §19 UStG",
    "text": "Ist sie gesetzt, weist kein Beleg Umsatzsteuer aus: keine Spalte, keine Steuerzeile, kein Betrag. Netto und Brutto bleiben beide stehen; dazwischen erklärt ein Hinweis, warum sie gleich sind. Der Grund für die Strenge: Was ausgewiesen ist, schuldet man nach §14c — auch wenn es falsch ist. Eine Spalte „USt. 0 %\" behauptet eine Steuerpflicht, die nicht besteht. Die Einstellung schlägt am Beleg alles andere: Auch bei einem ausländischen Kunden weist ein Kleinunternehmer keine Steuer aus."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Aussehen der Belege",
    "text": "Logo. Erscheint im Briefkopf jedes Belegs. Ein festgeschriebener Beleg behält das Logo vom Tag seiner Ausstellung — ein späterer Wechsel ändert alte Belege nicht. Briefpapier. Eine einseitige A4-PDF, die unter jede Seite gelegt wird. Sie trägt nur Gestaltung: Anschrift, Bankverbindung und Pflichtangaben setzt die Vorlage. Läge die Steuernummer auf dem Bogen, stünde sie in einer Datei, die keine Prüfung lesen kann. Zwei Dinge werden beim Hochladen geprüft und sonst abgewiesen: Genau eine Seite. Ein zweiseitiger Bogen wäre eine stille Falle — der Beleg bekäme immer nur die erste Seite. A4, mit wenigen Zehntelmillimetern Spielraum. Gestaltungsprogramme runden das Format unterschiedlich."
  },
  {
    "topicId": "firmendaten",
    "topicTitle": "Firmendaten",
    "heading": "Vorgaben für neue Belege",
    "text": "Hier stehen die Werte, mit denen ein neuer Beleg vorbelegt wird: Zahlungsziel in Tagen, Währung, Standardsteuersatz und das Muster der Belegnummer. Wer sie ändert, ändert künftige Belege — bestehende bleiben, wie sie sind. Ebenfalls hier: die Mahngebühren je Stufe und die Zahlungsfrist einer Mahnung."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Was Faktura nicht tut",
    "text": "Eine Auskunft darüber, was fehlt, spart die Suche danach."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Nach außen",
    "text": "Keine Datenübertragung an Dritte. Die einzige ausgehende Verbindung führt zu einem Mailserver, den der Betreiber selbst benennt. Ohne diese Einrichtung läuft die Anwendung vollständig ohne Netz nach außen. Keine externen Schriften, Skripte oder Analysedienste, keine Reichweitenmessung, keine Einwilligungsabfrage — es gibt nichts einzuwilligen. Keine Cloud. Die Daten liegen dort, wo die Anwendung läuft."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Von selbst",
    "text": "Keine automatischen Läufe. Weder Mahnungen noch Sicherungen noch wiederkehrende Rechnungen entstehen von selbst. Was geschieht, hat jemand ausgelöst. Keine Zahlungserkennung. Es gibt keine Bankanbindung; Zahlungen werden erfasst."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Nicht vorhanden",
    "text": "Kein Löschen von Belegen (§147 AO). Keine Selbstregistrierung — ein Konto entsteht nur per Einladung. Keine E-Rechnung im Format ZUGFeRD oder XRechnung. Die Ausgabekette ist darauf vorbereitet, das Format selbst ist nicht gebaut. Keine Angebote, Auftragsbestätigungen oder Lieferscheine. Kein Buchhaltungsexport nach DATEV. Keine Zeiterfassung, kein Projektmanagement, keine Lagerhaltung."
  },
  {
    "topicId": "grenzen",
    "topicTitle": "Was Faktura nicht tut",
    "heading": "Ausdrücklich keine Beratung",
    "text": "Faktura prüft die eingegebenen Angaben auf Vollständigkeit, nicht auf Richtigkeit. Ob eine Leistung steuerfrei ist, ob Reverse Charge greift, ob die Kleinunternehmerregelung noch gilt — das entscheidet nicht die Anwendung. Die Vorschläge zur steuerlichen Behandlung sind Vorschläge. Sie lassen sich übersteuern, und die Verantwortung dafür bleibt beim Aussteller."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Mahnungen",
    "text": "Zu einer überfälligen, offenen Rechnung lässt sich eine Mahnung ausstellen. Es gibt … Stufen. <ReminderLadder />"
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "So entsteht eine Mahnung",
    "text": "Die Rechnung öffnen. Ist sie überfällig und offen, steht dort „Mahnung ausstellen\". Bestätigen. Die Mahnung bekommt sofort eine Nummer und ein PDF. Das PDF herunterladen und verschicken. Zurücknehmen lässt sich das nicht — eine ausgestellte Mahnung ist ein Dokument."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Was auf der Mahnung steht",
    "text": "Die gemahnte Rechnung mit Nummer, Datum, Fälligkeit und Betrag. Der offene Betrag am Tag der Mahnung. Die Mahngebühr der jeweiligen Stufe, sofern eine hinterlegt ist. Eine neue, kurze Zahlungsfrist. Die Frist der Rechnung bleibt unberührt — sie ist ja verstrichen. Keine Umsatzsteuer. Eine Mahnung fordert eine bestehende Forderung ein und begründet keine neue; ein Steuerausweis darauf wäre nach §14c geschuldet, obwohl er nichts bezeichnet. Der Ton steigt mit der Stufe, die Drohung nicht: Faktura kündigt kein gerichtliches Mahnverfahren an und nennt keine Inkassostelle. Was auf dem Blatt steht, muss der Absender einhalten können."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Gebühren",
    "text": "Die Gebühr je Stufe steht in den Firmendaten. Voreingestellt sind 0 € für die Zahlungserinnerung und steigende Beträge danach — wer zum ersten Mal erinnert, verlangt üblicherweise nichts dafür. Verzugszinsen berechnet Faktura nicht. Sie hingen am Basiszinssatz, der sich halbjährlich ändert; eine gepflegte Fremdzahl, mit der die Anwendung rechnet, während sie veraltet, wäre schlechter als keine."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Eingefrorene Beträge",
    "text": "Was auf der Mahnung steht, galt am Tag ihrer Ausstellung. Zahlt der Kunde danach eine Teilsumme, ändert das den verschickten Brief nicht. Ein Dokument, das sich nachträglich ändert, ist keines."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Eigene Nummern",
    "text": "Mahnungen zählen in einem eigenen Nummernkreis, getrennt von dem der Rechnungen. Der Rechnungskreis muss lückenlos sein; zählte eine Mahnung darin mit, entstünde dort eine Lücke, die niemand erklären kann."
  },
  {
    "topicId": "mahnungen",
    "topicTitle": "Mahnungen",
    "heading": "Wenn nicht gemahnt wird",
    "text": "Steht der Knopf nicht da, nennt die Belegseite den Grund: Noch nicht überfällig — wer am letzten Tag der Frist zahlt, hat gezahlt. Nichts mehr offen — auch dann nicht, wenn der Termin lange verstrichen ist. Entwurf — keine Forderung. Storniert — die Forderung besteht nicht mehr. Gutschrift — sie fordert nichts ein. Letzte Stufe erreicht — eine vierte Mahnung ist keine Mahnung mehr. Das ist eine Auskunft, kein Fehler."
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
    "heading": "Jemanden einladen",
    "text": "Unter Mitglieder die E-Mail-Adresse eingeben und eine Rolle wählen. Der Einladungslink erscheint genau einmal in der Oberfläche. Ist ein Mailversand eingerichtet, geht er zusätzlich hinaus — nie stattdessen. Der Eingeladene setzt sein eigenes Passwort und meldet sich danach regulär an. Die Einladung gilt … Je Adresse gibt es höchstens eine offene; wer erneut einlädt, entwertet den vorigen Link. Kein anderes Konto erfährt das Passwort — auch die Rechteverwaltung nicht. Sie stellt einen Nachweis aus, sie vergibt kein Passwort. Ein Verfahren, in dem sie eines vergibt, hätte immer zwei Wissende. Kommt die Mail nicht an, ist niemand ausgesperrt: Der Link steht in der Oberfläche und lässt sich auf jedem Weg weitergeben."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Rollen zuschneiden",
    "text": "Eine Rolle ist eine Auswahl aus dem Katalog: Belege lesen, anlegen, ändern, festschreiben, stornieren, Zahlungen erfassen, mahnen; Kunden, Katalog, Firmendaten, Vorlagen, Nummernkreise, Export, Rechteverwaltung. Der Zuschnitt wirkt sofort — Berechtigungen werden bei jedem Aufruf frisch gelesen. Ein entzogenes Recht greift beim nächsten Klick, nicht erst nach dem nächsten Anmelden. Ein Konto, dem ein Recht fehlt, sieht den Weg dorthin nicht: Fehlt ein Menüpunkt, fehlt die Berechtigung. Das ist keine Verschleierung — ein Menüpunkt, der auf eine Fehlerseite führt, ist schlechter als keiner. Eine Rolle, die jemand trägt, lässt sich nicht löschen. Erst umziehen, dann löschen."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Ausscheiden",
    "text": "Ein Konto wird gesperrt, nicht gelöscht: Der Beleg behält seinen Urheber. Die Sperre beendet sofort alle Sitzungen des Kontos. Das eigene Konto lässt sich nicht sperren — nicht weil es unmöglich wäre, sondern weil es keinen Vorgang gibt, den das abbildet."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Die Aussperrsicherung",
    "text": "Mindestens ein nicht gesperrtes Konto hält immer die Rechteverwaltung. Das letzte lässt sich weder sperren noch seiner Rolle berauben, und der Rolle lässt sich das Recht nicht entziehen. Ohne diese Sicherung entstünde ein Unternehmen, in das niemand mehr hineinkommt — auch der Betreiber der Installation nicht."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Passwort eines Mitglieds zurücksetzen",
    "text": "Wer die Rechteverwaltung hält, kann für ein anderes Konto einen Zurücksetzungsnachweis ausstellen. Auch hier gilt: ein Nachweis, kein Passwort. Alle Sitzungen des betroffenen Kontos enden dabei."
  },
  {
    "topicId": "mitglieder",
    "topicTitle": "Mitglieder und Rollen",
    "heading": "Wer einen Beleg angelegt hat",
    "text": "Führt ein Unternehmen mehr als ein Konto, zeigt die Rechnungsliste eine Spalte mit dem Urheber. Bei einem einzigen Konto entfällt sie — dort stünde in jeder Zeile derselbe Name."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "Neuerungen",
    "text": "Was sich zuletzt geändert hat, das Neueste zuerst. Hier steht, was für die Arbeit mit Faktura einen Unterschied macht — nicht jede Änderung am Programm."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Handbuch",
    "text": "Dieses Handbuch. Ohne Anmeldung erreichbar, von der Anmeldeseite aus verlinkt und durchsuchbar. Die Suche läuft auf dem Server und funktioniert auch ohne JavaScript. Abbildungen: Ablaufdiagramme zu Belegzuständen, Mahnstufen und Satzspiegel sowie Bildschirmfotos der wichtigsten Ansichten."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Mahnwesen",
    "text": "Mahnungen zu überfälligen Rechnungen, in drei Stufen: Zahlungserinnerung, Mahnung, letzte Mahnung. Jede Mahnung ist ein eigenes Dokument mit eigener Nummer und eigenem PDF, in einem vom Rechnungskreis getrennten Nummernkreis. Mahngebühren je Stufe in den Firmendaten; die Beträge einer ausgestellten Mahnung sind eingefroren. Wird nicht gemahnt, nennt die Belegseite den Grund statt eines toten Knopfes. Mahnen ist ein eigenes Recht — es lässt sich einer Rolle einzeln geben."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Sicherheit des Betreiberkontos",
    "text": "Ein Betreiberkonto kann sein Passwort selbst ändern, seine angemeldeten Geräte sehen und einzeln beenden sowie Passkeys verwalten. Beim Passwortwechsel enden alle anderen Sitzungen; die eigene bleibt."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Zustellung per E-Mail",
    "text": "Ist ein Mailserver eingerichtet, gehen Einladungen und Zurücksetzungslinks zusätzlich per E-Mail hinaus. Der Link steht weiterhin in der Oberfläche — wer die Nachricht nicht bekommt, ist nicht ausgesperrt. „Passwort vergessen\" auf der Anmeldeseite: Wer sein Passwort verliert, braucht niemanden mehr anzurufen. Die Oberfläche sagt nach jeder Einladung, was daraus geworden ist: zugestellt, kein Versand eingerichtet, oder abgelehnt. Ohne Mailserver verhält sich alles wie zuvor; die Anwendung braucht dafür weiterhin keine Verbindung nach außen."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Rechtliches und Kleinigkeiten",
    "text": "Impressum und Datenschutzhinweise, gepflegt vom Betreiber der Anlage und ohne Anmeldung erreichbar. Die Fristen darin stammen aus der Anwendung selbst. Passwörter lassen sich beim Tippen ansehen — ein Auge im Feld."
  },
  {
    "topicId": "neuerungen",
    "topicTitle": "Neuerungen",
    "heading": "August 2026 · Briefpapier, PDF und Rückmeldungen",
    "text": "Eigenes Briefpapier: eine einseitige A4-PDF, die unter jede Seite des Belegs gelegt wird. Das PDF entsteht beim Festschreiben, nicht erst beim ersten Abruf. Damit kann keine spätere Vorlagenänderung einen bereits geltenden Beleg verändern. Die Vollständigkeitsprüfung erscheint schon im Entwurf, über den Knöpfen, und markiert die fehlenden Felder. Eigene Belegvorschau statt des eingebauten Betrachters: Blättern, Zoom, Ziehen mit der Maus und Vollbild — im Aussehen der Anwendung. Nach dem Speichern erscheint eine Bestätigung dort, wo der Knopf steht. Ehrlichere Aktionen: Was der Server ablehnt, wird nicht mehr angeboten — keine Stornierung einer Gutschrift, kein Zahlungsformular am stornierten Beleg, keine Sammelaktion ohne passende Auswahl."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Eine Rechnung schreiben",
    "text": "Neue Rechnung anlegen. Sie entsteht als Entwurf und darf unvollständig sein — das ist sein Zweck. Empfänger wählen: Kunde, Felder am Beleg oder freier Anschriftenblock. Positionen erfassen. Datum und Zahlungsziel prüfen. Vorbelegt sind der heutige Tag und die Frist aus den Firmendaten oder vom Kunden. Vorschau rechts ansehen — sie zeigt das PDF selbst, keine Nachbildung. Festschreiben. <Screenshot src=\"rechnungen\" alt=\"Die Rechnungsliste mit Filterleiste, Statusreitern und einer Tabelle aus Nummer, Kunde, Datum, Fälligkeit, Bruttobetrag und Status.\" caption=\"Die Rechnungsliste: Reiter nach Status, Filter darüber, Zeilenaktionen bei Hover\" />"
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Positionen",
    "text": "Jede Zeile trägt Bezeichnung, Menge, Einheit, Einzelpreis und Steuersatz; Beschreibung und Rabatt sind freiwillig. Zeilen lassen sich mit der Maus umsortieren. Gerechnet wird ausschließlich in ganzen Cent. Je Position wird einmal gerundet, die Steuer dagegen je Steuersatz — nicht je Zeile. Deshalb kann die Summe der Zeilensteuern um einen Cent von der ausgewiesenen Steuer abweichen; ausgewiesen ist die richtige. Ein Rabatt gilt der einzelnen Position und wird in Prozent erfasst. Einen Rabatt auf die Gesamtsumme gibt es bewusst nicht — er ließe sich den Steuersätzen nicht eindeutig zuordnen."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Steuerliche Behandlung",
    "text": "Die Anwendung schlägt sie vor und begründet den Vorschlag: Regelbesteuerung — der Normalfall im Inland. Reverse Charge — Kunde im EU-Ausland mit USt-IdNr. Der Beleg weist keine Steuer aus und trägt den Hinweis auf die Steuerschuldnerschaft des Leistungsempfängers. Ausfuhr — Kunde im Drittland. Bei der Kleinunternehmerregelung ist die Behandlung festgestellt, keine Frage: Sie kommt aus den Firmendaten und schlägt alles andere. Abweichen ist möglich, kostet aber einen bewussten Schritt hinter einem aufklappbaren Bereich — mit dem Grund daneben. Der Grund für die Hürde: Ein falsch ausgewiesener Steuerbetrag wird geschuldet."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Was zum Festschreiben fehlt",
    "text": "Über den Knöpfen steht, was noch fehlt: Empfängeranschrift, Positionen, Datum, Angaben aus den Firmendaten. Jede Zeile führt zu ihrem Feld, und das Feld markiert sich selbst. Das ist ein Hinweis, kein Fehler — ein Entwurf darf unvollständig sein. Erst das Festschreiben verlangt Vollständigkeit. Geprüft wird dabei mit derselben Regel, die auch der Server anwendet. Was hier grün ist, geht auch durch."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Freie Texte",
    "text": "Einleitung steht über den Positionen, Schlusstext darunter. Beide sind freiwillig und gehören zu diesem einen Beleg. Ein Text, der auf jedem Beleg stehen soll, gehört in die Vorlage oder in den Fußtext der Firmendaten."
  },
  {
    "topicId": "rechnung",
    "topicTitle": "Eine Rechnung schreiben",
    "heading": "Kopieren",
    "text": "Duplizieren legt eine neue Rechnung mit denselben Positionen und demselben Empfänger an — als Entwurf, mit heutigem Datum und neuer Frist. Nummer und Urheber wandern nicht mit: Die Kopie gehört dem, der sie anlegt."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Das eigene Konto absichern",
    "text": "Alles auf dieser Seite findet sich in der Anwendung unter Sicherheit. <Screenshot src=\"sicherheit\" alt=\"Die Sicherheitsseite mit Betriebszustand, zweitem Faktor, Passkeys, angemeldeten Geräten und vertrauten Geräten.\" caption=\"Die Sicherheitsseite des eigenen Kontos\" />"
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Zweiter Faktor",
    "text": "Ein zeitbasierter Code aus einer Authenticator-App. Beim Einrichten erscheint ein QR-Code; danach ist ein Code zur Bestätigung einzugeben — erst dann ist der Faktor aktiv. So kann niemand sich versehentlich aussperren, weil das Scannen misslang."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Wiederherstellungscodes",
    "text": "Zum zweiten Faktor gehören … Codes für den Fall, dass das Gerät verloren geht. Sie werden genau einmal angezeigt — danach liegt nur noch ihre Prüfsumme vor, und niemand kann sie erneut ausgeben. Jeder Code gilt einmal. Die Seite zeigt, wie viele noch übrig sind; neue lassen sich jederzeit erzeugen, wobei die alten sofort verfallen. Sie gehören an einen Ort, der nicht dasselbe Gerät ist: ausgedruckt, in einem Passwortspeicher, im Safe."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Passkey",
    "text": "Ein Passkey ist ein Schlüsselpaar auf dem Gerät. Der private Teil verlässt es nie, und die Signatur bindet sich an die Adresse der aufrufenden Seite — eine nachgebaute Anmeldeseite bekommt nichts. Das ist der eigentliche Gewinn gegenüber einem Code, der abgetippt werden kann. Weil die Gerätesperre — Fingerabdruck, Gesicht, PIN — dabei als zweiter Faktor zählt, meldet ein Passkey allein an. Zwei Dinge sind zu wissen: Ohne JavaScript geht es nicht. Es ist die einzige Stelle der Anwendung, für die das gilt. Verkraftbar, weil Passwort und zweiter Faktor daneben bestehen bleiben. Ein Domainwechsel entwertet alle Passkeys. Die Bindung an die Adresse ist ihr Zweck; sie lässt sich nicht umziehen."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Vertraute Geräte",
    "text": "Nach erfolgreichem zweitem Faktor lässt sich ein Gerät als vertraut hinterlegen; dort entfällt der Code für … Das Passwort wird weiterhin verlangt. Das schwächt die Zweifaktoranmeldung bewusst, und deshalb gilt: Jeder Nachweis ist sichtbar und einzeln widerrufbar. Was man nicht sieht, kann man nicht widerrufen. Er endet bei jedem Ereignis, das den Verdacht auf Verlust begründet: Passwortzurücksetzung, Abschalten des zweiten Faktors, Sperren des Kontos, „alle anderen Sitzungen beenden\". Auf einem fremden oder öffentlichen Rechner gehört er nicht hin."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Angemeldete Geräte",
    "text": "Jede Sitzung steht mit Gerätebeschreibung, letzter Nutzung und Adresse in der Liste; jede lässt sich einzeln beenden. Das wirkt sofort. „Alle anderen beenden\" beendet zugleich jedes Gerätevertrauen — auch das des aufrufenden Geräts. Eine Sitzung weiß nicht, welcher Gerätenachweis zu ihr gehört, und im Zweifel ist das die sichere Richtung."
  },
  {
    "topicId": "sicherheit",
    "topicTitle": "Das eigene Konto absichern",
    "heading": "Wenn etwas verdächtig aussieht",
    "text": "Eine unbekannte Sitzung in der Liste ist der Anlass für drei Schritte, in dieser Reihenfolge: Passwort ändern, alle anderen Sitzungen beenden, zweiten Faktor prüfen. Wer die Rechteverwaltung hält, sieht im Protokoll, was in seinem Namen geschehen ist."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Kunden und Katalog",
    "text": "Kunden und Katalogpositionen sind Vorlagen für die tägliche Arbeit, keine Pflicht: Ein Beleg kommt auch ohne Kundendatensatz aus. <Screenshot src=\"kunden\" alt=\"Die Kundenliste mit Suchfeld und einer Tabelle aus Kundennummer, Name, Ort und Zustand.\" caption=\"Die Kundenliste\" />"
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Drei Wege zum Empfänger",
    "text": "<RecipientSources /> Kunde aus den Stammdaten. Die Anschrift kommt von dort. Sinnvoll bei wiederkehrender Geschäftsbeziehung — der Kunde bekommt eine Kundennummer, und die Rechnungsliste lässt sich nach ihm filtern. Felder am Beleg. Dieselben Angaben, nur an diesem einen Beleg erfasst. Für die einmalige Rechnung, für die sich kein Datensatz lohnt. Freier Anschriftenblock. Zeile für Zeile, wie eingegeben — für Fälle, in die kein Formular passt. Bei allen drei Wegen gilt dasselbe: §14 UStG verlangt Name und Anschrift des Empfängers. Ein freier Block aus einer einzigen Zeile ist ein Name ohne Anschrift und wird abgewiesen; Name und Anschrift müssen auf getrennten Zeilen stehen. Die erste Zeile gilt als Name."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Was ein Kunde sonst mitbringt",
    "text": "USt-IdNr. — bei einem Kunden im EU-Ausland schlägt der Beleg damit Reverse Charge vor. Land — bestimmt zusammen mit der USt-IdNr. die steuerliche Behandlung. Abweichendes Zahlungsziel — überschreibt für diesen Kunden die Vorgabe aus den Firmendaten. Leitweg-ID — für Rechnungen an öffentliche Auftraggeber. Notiz — nur intern, erscheint auf keinem Beleg."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Katalogpositionen",
    "text": "Eine Katalogposition ist eine gespeicherte Zeile: Bezeichnung, Einheit, Einzelpreis, Steuersatz. Im Editor lässt sie sich übernehmen und danach frei ändern — was am Beleg steht, ist eine Kopie, kein Verweis. Eine spätere Preisänderung im Katalog rührt bestehende Belege nicht an. Einheiten werden als genormte Codes gespeichert und als deutsche Bezeichnung angezeigt: Stück, Stunde, Kilogramm, Pauschale."
  },
  {
    "topicId": "stammdaten",
    "topicTitle": "Kunden und Katalog",
    "heading": "Archivieren statt löschen",
    "text": "Kunden und Katalogpositionen werden archiviert, nicht gelöscht: Ein Beleg verweist auf seinen Empfänger, und der Verweis darf nicht ins Leere zeigen. Ein archivierter Eintrag verschwindet aus der Auswahl, bleibt aber an allen Belegen sichtbar, die ihn schon benutzen. Rückgängig machen lässt sich das jederzeit."
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Die Übersicht",
    "text": "Die Startseite beantwortet vier Fragen, ohne dass man sie stellt: Was ist offen? Was ist überfällig? Wie lief der Monat? Wer zahlt gut? <Screenshot src=\"uebersicht\" alt=\"Die Übersicht mit vier Kennzahlen, einem Balkendiagramm über zwölf Monate und zwei Listen: überfällige Belege links, in den nächsten vierzehn Tagen fällige rechts.\" caption=\"Die Übersicht mit Beispieldaten\" />"
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Die vier Kennzahlen",
    "text": "Offen gesamt — die Summe aller unbezahlten Forderungen, brutto. Entwürfe und Stornos zählen nicht mit. Davon überfällig — der Teil davon, dessen Frist verstrichen ist, mit der Anzahl der betroffenen Belege. Umsatz laufender Monat — netto, nach Rechnungsdatum. Umsatz des Jahres — netto. Umsatz zählt netto: Die Umsatzsteuer ist durchlaufender Posten, kein Ertrag. Entwürfe zählen nicht, Gutschriften nie — neutralisiert wird dadurch, dass der stornierte Beleg herausfällt."
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Umsatz je Monat",
    "text": "Zwölf Monate rückwärts, netto. Der laufende Monat ist hervorgehoben und naturgemäß unvollständig."
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Die beiden Fristenlisten",
    "text": "Überfällig zeigt, was zu lange offen ist — mit Betrag und Anzahl der Tage. Das ist die Liste, aus der Mahnungen entstehen. Fällig in den nächsten vierzehn Tagen zeigt, was demnächst erwartet wird. Beide führen unmittelbar zum Beleg."
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Zuletzt bearbeitet und beste Kunden",
    "text": "Darunter stehen die zuletzt angefassten Belege — praktisch nach einer Unterbrechung — und die umsatzstärksten Kunden des laufenden Jahres."
  },
  {
    "topicId": "uebersicht",
    "topicTitle": "Die Übersicht",
    "heading": "Alle Zahlen aus einer Quelle",
    "text": "Kacheln, Diagramm und Listen stammen aus einer Berechnung mit einem Stichtag. Läse jede Kachel ihre eigene Uhr, könnte eine um Mitternacht geladene Übersicht denselben Beleg als überfällig und als heute fällig ausweisen."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Vorlagen und PDF",
    "text": "<SheetLayout />"
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Der Satz nach DIN 5008",
    "text": "Das Anschriftfeld sitzt links oben, im Fenster eines DIN-lang-Umschlags. Rechts daneben der Informationsblock: Belegnummer, Datum, Kundennummer. Falzmarken bei 105 mm und 210 mm, Lochmarke bei 148,5 mm. Der Blattfuß mit Anschrift, Kontakt, Steuernummer und Bankverbindung wiederholt sich auf jeder Seite — wer nur Seite 2 vor sich hat, findet die Bankverbindung trotzdem. Die Seitenzahl erscheint erst ab Seite 2. Auf einer einseitigen Rechnung wäre „Seite 1 von 1\" nur Lärm."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Die Vorlage gehört dem Unternehmen",
    "text": "Sie liegt als Kopie in dieser Installation. Änderungen an der ausgelieferten Standardvorlage erreichen sie nicht — wer spätere Verbesserungen will, setzt sie nach oder legt die Standardvorlage neu an. Bearbeitet werden HTML, CSS und die vier Seitenränder. Die Vorschau zeigt das Ergebnis, bevor gespeichert wird: mit einem echten Beleg, durch dieselbe Kette, die auch das fertige PDF erzeugt. Ein Fehler in der Vorlage bricht nichts Bestehendes: Er erscheint als Meldung in der Vorschau, und bereits festgeschriebene Belege behalten ihr fertiges PDF."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Was die Vorlage nicht entscheidet",
    "text": "Ob ein Beleg Umsatzsteuer ausweist, steht nicht in der Vorlage. Diese Entscheidung hängt an der steuerlichen Behandlung und an den Firmendaten — eine Vorlage kann jedes Unternehmen ändern, und diese Frage darf davon nicht abhängen."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Vorschau",
    "text": "Die Vorschau zeigt dasselbe PDF, das auch heruntergeladen wird — dieselbe Schrift, dieselbe Geometrie, dasselbe Briefpapier. Blättern, Zoom, Ziehen mit der Maus und Vollbild gehören zur Anwendung, nicht zum Betrachter des Browsers. Nach dem Speichern erneuert sie sich von selbst."
  },
  {
    "topicId": "vorlagen",
    "topicTitle": "Vorlagen und PDF",
    "heading": "Dateiname",
    "text": "Wie die heruntergeladene Datei heißt, steht als Muster in den Firmendaten — etwa Belegnummer, Datum oder Kundenname. Voreingestellt ist die Belegnummer."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Zahlungen",
    "text": "Zahlungen werden einzeln erfasst; der Status folgt daraus und wird nicht von Hand gesetzt. Jede Zahlung trägt Betrag, Datum und wahlweise Zahlungsart und Notiz."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Die Zustände",
    "text": "Offen — es steht Geld aus. Teilweise bezahlt — ein Teil ist eingegangen. Bezahlt — nichts mehr offen. Überfällig — offen und die Frist ist verstrichen. Kein eigener Zustand, sondern eine Feststellung über einen offenen Beleg. Der offene Betrag ist die Differenz zwischen Bruttobetrag und der Summe aller Zahlungen. Er steht auf der Belegseite und in der Liste."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Überzahlung und Korrektur",
    "text": "Ein höherer Betrag als der offene wird angenommen — Überzahlungen kommen vor, und die Anwendung ist nicht klüger als die Kontoauszüge. Der Beleg gilt dann als bezahlt. Eine falsch erfasste Zahlung lässt sich zurücknehmen. Der Status rechnet sich neu, und beides steht im Protokoll: das Erfassen und das Zurücknehmen."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Als bezahlt markieren",
    "text": "In der Rechnungsliste lassen sich Belege in einem Schritt als bezahlt markieren — auch mehrere auf einmal. Dabei entsteht eine Zahlung über den vollen offenen Betrag mit dem heutigen Datum. Angeboten wird das nur, wo es auch durchgeht: An einem Entwurf, einer Gutschrift oder einem stornierten Beleg steht kein Zahlungsformular."
  },
  {
    "topicId": "zahlungen",
    "topicTitle": "Zahlungen",
    "heading": "Was keine Zahlung annimmt",
    "text": "Eine Gutschrift nimmt keine Zahlungen an und wird nie überfällig: Sie stellt keine Forderung, sie nimmt eine zurück. Ein „12 Tage überfällig\" an einer Gutschrift wäre eine Mahnung an sich selbst. Ein stornierter Beleg ebenso: Die Forderung besteht nicht mehr."
  }
];
