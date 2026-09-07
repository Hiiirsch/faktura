-- Absicht des Einrichtungsnachweises (M8, FA-ADM-06)
--
-- `CREATE` — es soll ein Konto entstehen. `RESET` — ein vorhandenes bekommt neue
-- Zugangsdaten, weil sein zweiter Faktor verloren ist.
--
-- **Die Unterscheidung ist eine Sicherung.** Ohne sie koennte ein Nachweis, der
-- fuer ein neues Konto ausgestellt wurde, ein Konto ueberschreiben, das
-- inzwischen auf anderem Weg entstanden ist. Beim Einloesen wird geprueft, dass
-- die Lage zur Absicht passt; ein unbekannter Wert laesst beide Zweige leer
-- ausgehen und den Versuch scheitern (fail-safe, deshalb kein Trigger).
--
-- **Von Hand als `ALTER TABLE ADD COLUMN`.** Prisma erzeugte hierfuer eine
-- `RedefineTables`-Migration — obwohl die Spalte nullable mit Vorgabewert ist,
-- nur weil sie in der Mitte des Modells steht. Sie haette den partiellen Index
-- `AdminInvitation_one_open_per_email` mitgenommen: Er steht in der Liste der
-- danach neu angelegten Indizes **nicht** drin, weil Prisma ihn nicht kennt.
-- Damit waere die Zusage „ein offener Nachweis je Adresse" still weg gewesen.

-- AlterTable
ALTER TABLE "AdminInvitation" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CREATE';
