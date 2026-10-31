# Helm Chart: hello-world

Helm Chart für das Deployment des `hello-world`-Services (Tetris mit Highscore-API und whoami-Seite) in Kubernetes.
Der externe Zugriff läuft über das Istio Ingress Gateway, ausschließlich per HTTP (kein TLS, kein cert-manager).

## Überblick

| Eigenschaft | Wert |
|---|---|
| Chart-Name | `hello-world` |
| Chart-Version | 0.1.0 |
| App-Version | `0.1.0` |
| Typ | `application` |

## Komponenten

- **Deployment** (`templates/deployment.yaml`) – 1 Replica des Containers `ghcr.io/wlanboy/hello-world`, mit Startup-, Liveness- und Readiness-Probe (`GET /api/highscores`, prüft dabei auch die SQLite-DB). Die Highscores liegen in `/data/highscores.db`.
- **PersistentVolumeClaim** (`templates/pvc.yaml`, nur bei `persistence.enabled: true`) – Volume für `/data`. Ist Persistence aus, wird ein `emptyDir` gemountet und die Highscores sind nach jedem Pod-Neustart weg.
- **Service** (`templates/service.yaml`) – ClusterIP-Service, leitet Traffic an die Pods weiter.
- **Gateway** (`templates/gateway.yaml`, nur bei `ingress.controller: istio`) – Istio `Gateway` auf Port 80/HTTP für die konfigurierten Hosts.
- **VirtualService** (`templates/virtualservice.yaml`, nur bei `ingress.controller: istio`) – Istio `VirtualService`, routet Traffic vom Gateway (und dem internen `mesh`-Gateway) zum Service.

Gateway und VirtualService werden zusätzlich nur gerendert, wenn die Istio-CRDs
im Zielcluster vorhanden sind (`.Capabilities.APIVersions.Has "networking.istio.io/v1beta1"`).

## Konfiguration (`values.yaml`)

| Key | Beschreibung | Default |
|---|---|---|
| `image.repository` / `image.tag` / `image.pullPolicy` | Container-Image | `ghcr.io/wlanboy/hello-world`, `latest`, `Always` |
| `replicaCount` | Anzahl Replicas (SQLite + RWO-Volume: bei 1 lassen) | `1` |
| `deploymentName` | Name für Deployment, PVC und VirtualService | `hello-world` |
| `service.name` | Name des Service-Objekts | `hello-world-svc` |
| `service.type` | Service-Typ | `ClusterIP` |
| `service.port` / `service.targetPort` | Service- und Container-Port (`targetPort` wird als `PORT` an den Container übergeben) | `8000` |
| `persistence.enabled` | PVC für `/data` anlegen | `true` |
| `persistence.size` | Größe des PVC | `100Mi` |
| `persistence.storageClass` | StorageClass, leer = Cluster-Default | `""` |
| `ingress.controller` | `istio` oder `none` | `istio` |
| `ingress.hosts` | Externe Hostnamen für Gateway und VirtualService | `hello-world.gmk.lan` |
| `istio.gatewayName` | Name des Istio-Gateway-Objekts | `hello-world-gw` |

## Installation

```bash
kubectl create namespace hello-world
kubectl label namespace hello-world istio-injection=enabled --overwrite
helm install hello-world ./hello-world-chart -n hello-world --create-namespace

kubectl get gateway,virtualservice,pvc,pods -n hello-world
```

Erreichbar danach unter `http://hello-world.gmk.lan` (whoami-Seite, Tetris unter `/tetris/`).

## Upgrade

```bash
helm upgrade hello-world ./hello-world-chart -n hello-world
helm upgrade hello-world ./hello-world-chart -n hello-world --set image.tag=0.1.0
```

## Deinstallation

```bash
helm uninstall hello-world -n hello-world
```

Der PVC wird dabei mit gelöscht, und mit ihm die Highscores.

## Hinweise

- Der Gateway-Selector ist im Template fest auf `istio: ingressgateway` gesetzt.
- Der VirtualService exportiert die Route auf `.` (eigener Namespace), `istio-ingress` und `istio-system` und bindet sowohl das eigene Gateway als auch `mesh` ein.
- Mit Persistence läuft das Deployment mit `strategy: Recreate`, weil das RWO-Volume erst vom alten Pod freigegeben werden muss. `fsGroup: 10001` entspricht dem `app`-User im Image und macht das Volume beschreibbar.
- Der `hello-world.gmk.lan`-CNAME muss auf die Istio-Ingress-Gateway-VIP zeigen.

## Testen

```bash
helm lint ./hello-world-chart
helm template hello-world ./hello-world-chart --api-versions networking.istio.io/v1beta1

# bei controller=none keine Istio-Ressourcen
helm template hello-world ./hello-world-chart --set ingress.controller=none | grep -E "VirtualService|Gateway"
```
