# bicio-F1

Simulatore di Formula 1 per il web, con guida il più realistica possibile, grafica 3D e (prossimamente) carriera manageriale e multiplayer. Si gioca con tastiera o gamepad/volante.

Il progetto completo è descritto in [docs/PROGETTO.md](docs/PROGETTO.md). Per mettere il gioco online vedi [docs/DEPLOY.md](docs/DEPLOY.md).

## Stato

- **Fase 0** (impostazione del progetto) — completata
- **Fase 1** (prototipo di guida) — completata: vettura 2026, fisica a 500 Hz, tastiera, gamepad e touch, 3D, telemetria
- **Fase 3** (gara) — in gran parte completata: "Gioca da solo" contro piloti automatici con abilità diverse, partenza con semaforo, contatti tra auto, scia e aria sporca, modalità sorpasso 2026, classifica e podio
- **Multiplayer "Gioca in balotta"** — prossimo passo

Piste: Lido di Savio (predefinita), Autodromo della Riviera, Circuito di prova Bassa Pianura.

## Struttura

```
packages/
  sim-core/   motore di simulazione deterministico (fisica, gomme, power unit, pista, cronometraggio)
  client/     gioco nel browser: React + Three.js, simulazione in un Web Worker
  server/     server Node (Fastify): serve il client e le API
deploy/proxy/ reverse proxy condiviso della VPS (nginx + Let's Encrypt)
docs/         progetto e guide
```

## Sviluppo

Requisiti: Node.js 18.19 o successivo (consigliato 22), npm.

```bash
npm install
```

```bash
npm run dev
```

Apri l'indirizzo mostrato da Vite (di solito http://localhost:5173).

Altri comandi:

| Comando | Cosa fa |
|---|---|
| `npm test` | Test di sim-core: determinismo, prestazioni "golden" della vettura, pista |
| `npm run metrics` | Stampa le prestazioni della vettura (0-100, frenate, g laterali) |
| `npx tsx packages/sim-core/scripts/race-sim.ts lido-di-savio 10 3` | Gara di prova tra piloti automatici, senza grafica |
| `npx tsx packages/sim-core/scripts/track-check.ts` | Analisi delle piste (curve, raggi, sovrapposizioni) |
| `npm run typecheck` | Controllo dei tipi su tutti i pacchetti |
| `npm run build` | Compila client e server |
| `npm run dev:server` | Avvia il server in sviluppo (porta 3000) |

## Comandi di gioco

| Azione | Tastiera | Gamepad |
|---|---|---|
| Acceleratore | ↑ / W | Grilletto destro |
| Freno | ↓ / S | Grilletto sinistro |
| Sterzo | ← → / A D | Stick sinistro |
| Dosaggio parziale gas/freno | Spazio | — |
| Marcia su / giù | E / Q (oppure X / Z) | RB / LB (oppure A / X) |
| Cambia visuale | C | Y |
| Telemetria | T | B |
| Rimetti in pista | R | Back |
| Pausa e impostazioni | Esc / P | Start |

## Taratura della fisica

I parametri della vettura sono in [packages/sim-core/src/params.ts](packages/sim-core/src/params.ts). Dopo ogni modifica:

```bash
npm run metrics
```

I test in `packages/sim-core/test/performance.test.ts` falliscono se le prestazioni escono dagli intervalli realistici per una F1 2026.
