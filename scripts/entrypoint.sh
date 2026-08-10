#!/bin/sh
# Startpunkt des Anwendungscontainers.
#
# Migrationen laufen beim Start (Spec §12, NFA-BETR-01). Schlagen sie fehl,
# startet der Server nicht — ein Betrieb gegen einen Datenbestand mit
# unbekanntem Schema wäre gefährlicher als ein ausbleibender Start.
set -eu

echo "Wende Datenbankmigrationen an ..."
# Direkt der Einstiegspunkt des Pakets, nicht der Symlink aus node_modules/.bin:
# Beim Kopieren ins Image wird der Symlink zur echten Datei aufgelöst und fände
# seine Hilfsdateien dann im falschen Verzeichnis.
node ./migrator/node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma

echo "Starte Anwendungsserver ..."
exec node server.js
