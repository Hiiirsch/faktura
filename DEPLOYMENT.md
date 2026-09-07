## Deployment

Unter `deployment/` liegen Kubernetes-Manifeste für einen Testlauf im
KIND-Cluster. **Kubernetes ist nicht Teil der Anwendung** — es gibt kein Helm,
keine Cluster-Annahmen im Code, nur diese Beispieldateien.

Voraussetzungen: Docker, KIND und kubectl.

```bash
kind create cluster --name faktura

kubectl apply -f deployment/namespace.yaml
kubectl apply -f deployment/postgres.yaml
kubectl apply -f deployment/app-config.yaml
kubectl apply -f deployment/app-pvc.yaml
kubectl apply -f deployment/migration-job.yaml
kubectl apply -f deployment/app-deployment.yaml
kubectl apply -f deployment/app-service.yaml
```

Prüfen, ob der Pod läuft — er muss `Running` und `1/1` sein:

```bash
kubectl get pods -n faktura
```

Lokal erreichbar machen und im Browser unter `http://localhost:3000` öffnen:

```bash
kubectl port-forward -n faktura service/faktura-app 3000:3000
```

### Betreiberkonto anlegen

Nach erfolgreichem Start der Anwendung kann einmalig ein Einrichtungslink für das Betreiberkonto erzeugt werden:
(In zweitem Terminal starten)

```bash
kubectl exec -n faktura deployment/faktura-app -- \
  node dist/create-admin.mjs --email betreiber@example.org
```

Mehr zur Erstinbetriebnahme und zur ersten Anmeldung findet sich in [README.md#erste-anmeldung](README.md#erste-anmeldung).