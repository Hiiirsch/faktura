# Die 12-Factor-App in Faktura

1. **Codebase**

	Eine Codebasis wird mit Git versioniert. Deployment und Änderungen gehen aus
	demselben Repository hervor.

2. **Abhängigkeiten**

	Alle Abhängigkeiten sind in `package.json` und `package-lock.json` festgelegt
	und werden mit `npm ci` reproduzierbar installiert.

3. **Konfiguration**

	Umgebungsabhängige Werte stehen in Umgebungsvariablen, zum Beispiel
	`DATABASE_URL`, `APP_URL` und `STORAGE_DIR`. Siehe `.env.example`

4. **Unterstützende Dienste**

	Datenbank, Mailserver, Objektspeicher und PDF-Renderdienst werden als externe Dienste behandelt. Ihre Adressen und Zugangsdaten kommen über die Umgebung. PostgreSQL läuft lokal per Docker Compose und im Cluster als eigener Dienst.

5. **Build, Release, Run**

	Diese Schritte sind getrennt: Das Dockerfile baut ein unveränderliches Image, ein Release referenziert eine konkrete Image-Version, und Kubernetes startet genau dieses Image.

6. **Prozesse**

	Der Webserver läuft als eigener, zustandsloser Prozess. Sitzungen und
	Anwendungsdaten liegen in PostgreSQL bzw. im Dateispeicher, nicht im
	Arbeitsspeicher des Prozesses. Ein Neustart verliert deshalb keinen Zustand.

7. **Bindung an Ports**

	Der Next.js-Server lauscht auf Port 3000. Der Kubernetes-Service
	`app-service.yaml` macht ihn im Cluster erreichbar; ein Reverse Proxy kann
	den externen Zugriff übernehmen.

8. **Nebenläufigkeit**

	Mehrere App-Instanzen können gegen dieselbe PostgreSQL-Datenbank laufen.
	Kubernetes skaliert dafür die Deployment-Replikas. Im aktuellen Deployment
	ist aus Einfachheitsgründen eine Replika aktiv; Datenbank, Objektspeicher und Renderdienst sind für mehrere Instanzen vorbereitet.

9. **Einweggebrauch**

	Prozesse starten schnell, führen ihre Aufgabe aus und können beendet oder
	neu gestartet werden. Migrationen laufen beim Containerstart, Betriebsaufgaben wie Backups als separate CLI-Prozesse.

10. **Dev-Prod-Vergleichbarkeit**

    In dem Kontext nicht angewand, da es ein Entwicklungsprojekt ist, es gibt im Grunde gerade nur Dev, Projekt ist noch zu klein dafür.

11. **Logs**

	 Die Anwendung schreibt strukturierte JSON-Ereignisse zeilenweise nach
	 `stdout`. Docker oder Kubernetes sammelt diese Logs; die Anwendung schreibt keine eigenen Logdateien. Geheimnisse und sensible Daten werden vor der Ausgabe automatisch entfernt.

12. **Admin-Prozesse**

	 Einmalige oder regelmäßige Verwaltungsaufgaben laufen getrennt vom
	 Webserver, zum Beispiel `npm run backup`, `admin:create`, `admin:reset` und
	 Datenbankmigrationen. 