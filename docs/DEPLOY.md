# Deploy su VPS

Schema:

```
Internet ──► nginx-proxy (80/443, HTTPS Let's Encrypt)  ── rete docker "proxy" ──►  bicio-f1-app (3000)
             acme-companion (certificati)                                              │ rete interna
             [condivisi da tutti i progetti della VPS]                                 bicio-f1-db (PostgreSQL)
```

- Il **proxy** è uno solo per tutta la VPS. Ogni progetto si "iscrive" dichiarando nel proprio `docker-compose.yml` le variabili `VIRTUAL_HOST`, `VIRTUAL_PORT` e `LETSENCRYPT_HOST`. Nginx si riconfigura da solo e i certificati vengono richiesti e rinnovati automaticamente.
- Il **database** non espone porte: è raggiungibile solo dal container dell'app.

## 1. DNS

Nel pannello DNS di `sbagiuzza.it` crea un record:

| Tipo | Nome | Valore |
|---|---|---|
| A | `bicio-f1` | IP pubblico della VPS |

Se il DNS è su Cloudflare, lascia il record in modalità **"DNS only"** (nuvola grigia) almeno finché il primo certificato non è stato emesso.

Verifica che il nome punti alla VPS prima di proseguire:

```bash
dig +short bicio-f1.sbagiuzza.it
```

## 2. Preparazione della VPS (una volta sola)

Ubuntu 24.04 o Debian 12, con Docker e il plugin compose installati.

Firewall: apri solo SSH, HTTP e HTTPS (sul pannello del provider oppure con `ufw`).

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

## 3. Proxy condiviso (una volta sola)

Copia la cartella `deploy/proxy` di questo repository in `/opt/proxy` sulla VPS, poi:

```bash
docker network create proxy
```

```bash
cd /opt/proxy && cp .env.example .env && nano .env
```

Inserisci in `ACME_EMAIL` l'indirizzo per gli avvisi di Let's Encrypt, poi avvia:

```bash
docker compose up -d
```

## 4. bicio-F1

```bash
git clone https://github.com/stefanozanarini/bicio-f1.git /opt/bicio-f1
```

```bash
cd /opt/bicio-f1 && cp .env.example .env && nano .env
```

Nel file `.env` imposta:
- `POSTGRES_PASSWORD`: una password lunga e casuale (`openssl rand -hex 24`);
- `ACCESS_PASSWORD`: la password che i giocatori useranno per entrare;
- `SESSION_SECRET`: una stringa casuale (`openssl rand -hex 32`).

Copia sulla VPS anche la cartella privata `.private/` (nomi dei piloti), che non è su GitHub. Dal tuo PC:

```bash
scp -r .private UTENTE@IP_VPS:/opt/bicio-f1/
```

Senza questa cartella il gioco usa i nomi di riserva. Poi, sulla VPS:

```bash
docker compose up -d --build
```

Dopo circa un minuto il certificato è emesso e il gioco risponde su https://bicio-f1.sbagiuzza.it. Per seguire l'emissione del certificato:

```bash
docker logs -f nginx-proxy-acme
```

## Aggiornamenti

```bash
cd /opt/bicio-f1 && git pull && docker compose up -d --build
```

## Aggiungere altri progetti alla VPS

Nel `docker-compose.yml` dell'altro progetto basta collegare il servizio web alla rete `proxy` e dichiarare il dominio:

```yaml
services:
  web:
    environment:
      VIRTUAL_HOST: altro.sbagiuzza.it
      VIRTUAL_PORT: "8080"
      LETSENCRYPT_HOST: altro.sbagiuzza.it
    networks: [proxy]
networks:
  proxy:
    external: true
```

## Backup del database

```bash
docker compose -f /opt/bicio-f1/docker-compose.yml exec -T db pg_dump -U bicio bicio | gzip > /var/backups/bicio-$(date +%F).sql.gz
```

Da mettere in un cron giornaliero, insieme al backup automatico del VPS.
