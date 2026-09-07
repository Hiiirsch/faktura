# Gruppenabgabe Vorlesung Kubernetes

## Mitglieder

- Dominik Hein
- Tim Hirschmiller
- Jonas Gerold

## Überblick

Unsere Anwendung besteht aus zwei zentralen Bestandteilen: einer Anwendung und einer Datenbank, die miteinander kommunizieren. Die Architektur ist dabei so aufgebaut, dass die Anwendung ihre Daten persistent und zentral verwalten kann, während die einzelnen Instanzen der App unabhängig voneinander laufen können.

## 12-Factor-App-Prinzipien

Die Anwendung orientiert sich an den Prinzipien der 12-Factor App. Eine Übersicht zu den relevanten Grundsätzen findet sich in [12Factors.md](12Factors.md).

## Kubernetes-Deployment

Die Kubernetes-Manifest-Dateien befinden sich im Verzeichnis [deployment](deployment/). Eine detaillierte Beschreibung der Deployment-Struktur und der Konfiguration ist in [DEPLOYMENT.md](DEPLOYMENT.md) dokumentiert.

## CNFC Landscape

Aus der CNCF Landscape haben wir PostgreSQL als Datenbank ausgewählt. Diese Entscheidung ermöglicht es, mehrere Instanzen der Anwendung mit einer zentralen Datenbank laufen zu lassen, wodurch die Anwendung skalierbar und für verteilte Ausführungen besser geeignet ist.

## Fazit

Die Kombination aus einer Containerisierten Anwendung, einem Kubernetes-Deployment und einer zentralen PostgreSQL-Datenbank bildet eine Grundlage für eine skalierbare und robustere Architektur, die den Anforderungen einer modernen Cloud-nativen Anwendung entspricht.
