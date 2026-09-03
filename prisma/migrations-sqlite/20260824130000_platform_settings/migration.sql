-- Angaben des Betreibers: Impressum und Datenschutzzusatz (M13, NFA-COMP-07, -08)
--
-- Eine neue Tabelle, kein Umbau — bestehende Trigger und CHECK-Bedingungen
-- bleiben damit unberuehrt.
--
-- **Genau eine Zeile.** Der Zwang liegt im festen Primaerschluessel mit
-- Vorgabewert `platform`: Ein zweiter Einfuegevorgang ohne eigene Kennung
-- kollidiert mit dem Primaerschluessel. Eine CHECK-Bedingung waere der andere
-- Weg gewesen; SQLite verliert die bei jedem Tabellenneubau, und diese Lehre
-- steht seit M5.5a im Projekt.
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'platform',
    "imprint" TEXT,
    "privacyAddendum" TEXT,
    "updatedAt" DATETIME NOT NULL
);
