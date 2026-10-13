# bicio-F1 — Documento di progetto

> Stato: **bozza da approvare** (tutti i punti aperti risolti il 2026-10-13, vedi §17). Nessun codice viene scritto prima del via.
> Ultimo aggiornamento: 2026-10-13

## 1. Visione

Simulatore di Formula 1 giocabile via web, con **guida il più realistica possibile**, grafica 3D e una componente manageriale (scuderia, setup, strategia, campionato). Si gioca con tastiera o gamepad/volante.

## 2. Decisioni prese

| Tema | Decisione |
|---|---|
| Grafica | 3D nel browser |
| Fisica | Simulativa: niente semplificazioni arcade, gli aiuti alla guida sono opzionali |
| Input | Tastiera (primaria) + gamepad/volante tramite Gamepad API |
| Manageriale | Sì |
| Nomi | Di fantasia. Piloti generati (§11) |
| Regolamento | Tecnico **2026**: aero attiva, ERS potenziato, niente DRS |
| Multiplayer | **Sì**, online con server autoritativo (§13) |
| Gare non guidate (carriera) | Calcolate con un **modello statistico** |
| Hardware minimo | Supportati anche i portatili con grafica integrata (§8) |
| Hosting | VPS (OVH VPS-1 o simile) condivisa con altri progetti, dominio `bicio-f1.sbagiuzza.it` |

## 3. Architettura

```
┌──────────────────────────────── Browser ─────────────────────────────────┐
│                                                                          │
│  Main thread                              Web Worker                     │
│  ┌──────────────────────┐   input/stato   ┌───────────────────────────┐  │
│  │ Input (tast./gamepad)│ ──────────────► │ sim-core @ 500 Hz         │  │
│  │ Renderer 3D (Three)  │ ◄────────────── │ (fisica, gomme, aero, IA, │  │
│  │ UI/HUD/Manager(React)│  snapshot 60 Hz │  regole di gara)          │  │
│  │ Audio (WebAudio)     │                 └───────────────────────────┘  │
│  └──────────────────────┘                                                │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ REST/JSON + WebSocket (multiplayer)
┌──────────────▼───────────────────────────────────────────────────────────┐
│ Backend Node.js (Fastify)                                                │
│  - account, profili, mappature comandi                                   │
│  - salvataggi carriera/campionato                                        │
│  - classifiche e giri record (validati rigiocando il replay)             │
│  - game server multiplayer (Colyseus) con sim-core autoritativo          │
└──────────────┬───────────────────────────────────────────────────────────┘
          PostgreSQL
```

**Perché la fisica gira in un Web Worker**: a 500 Hz, con 20 auto, la simulazione non deve competere con il rendering per il thread principale. Il renderer riceve gli snapshot e interpola tra uno e l'altro.

## 4. Stack

| Livello | Scelta |
|---|---|
| Linguaggio | TypeScript ovunque |
| Monorepo | npm workspaces |
| Rendering 3D | Three.js (la fisica è nostra, serve solo un renderer flessibile) |
| Collisioni | Rapier (WASM, deterministico, gira sia nel browser sia in Node). Solo contatti auto-auto e auto-barriere: la dinamica del veicolo è custom |
| UI | React + Vite |
| Audio | WebAudio: motore sintetizzato in base a giri/carico, rumore gomme, vento |
| Backend | Node.js + Fastify (API) + Colyseus (stanze multiplayer) |
| DB | PostgreSQL + Drizzle ORM |
| Test | Vitest. Test fisici "golden" su scenari noti (es. 0-100 km/h, spazio di frenata, accelerazione laterale massima) |
| Deploy | Docker Compose dietro un reverse proxy condiviso (nginx-proxy + acme-companion, Let's Encrypt) |

## 5. Struttura del monorepo

```
bicio-F1/
├─ packages/
│  ├─ sim-core/      # fisica, gomme, aero, power unit, regole, IA. Zero dipendenze DOM/Node
│  ├─ shared/        # tipi, protocolli, costanti, generatore nomi
│  ├─ track-tools/   # import/conversione piste, editor (fase successiva)
│  ├─ client/        # React + Three.js + worker della simulazione
│  └─ server/        # API Fastify, DB, game server multiplayer
├─ data/
│  ├─ cars/          # parametri vetture (JSON)
│  └─ tracks/        # piste (JSON + mesh)
├─ docs/
└─ docker-compose.yml
```

## 6. Modello fisico (sim-core)

### 6.1 Integrazione
- Passo fisso di **2 ms (500 Hz)**, con integratore semi-implicito (Euler simplettico). Per le parti più rigide (gomme, sospensioni) si valuta un sub-stepping.
- **Determinismo**: stesso seed + stessi input = stessa gara.
  - Le operazioni base in virgola mobile di JS sono deterministiche, ma `Math.sin`, `Math.exp` ecc. possono dare risultati diversi tra browser. Usiamo quindi **funzioni matematiche nostre** (polinomi/tabelle) dentro sim-core.
  - Il determinismo serve per replay, validazione dei giri record e un eventuale multiplayer.

### 6.2 Telaio e sospensioni
- Corpo rigido con 6 gradi di libertà (posizione e rotazione nei tre assi). Massa e inerzie da dati pubblici plausibili.
- 4 angoli indipendenti:
  - molla, smorzatore (bump/rebound), barra antirollio;
  - fine corsa (bump stop) e altezza da terra dinamica.
- Trasferimento di carico longitudinale e laterale che emerge dal modello, non scritto a mano.
- Effetti geometrici semplificati: campanatura dinamica e convergenza.

### 6.3 Gomme
- **Pacejka Magic Formula** con slittamento combinato longitudinale/laterale.
- **Modello termico a 3 strati**: superficie, carcassa, aria interna. La pressione varia con la temperatura, e l'aderenza dipende da temperatura e pressione.
- **Usura e degrado**: perdita di battistrada, graining e blistering semplificati, flat spot dopo i bloccaggi.
- Mescole: 3 da asciutto, intermedia e full wet, ognuna con la propria curva di aderenza, finestra di temperatura e usura.

### 6.4 Aerodinamica
- **Mappa aero**: carico (anteriore/posteriore) e resistenza in funzione di velocità², altezza da terra (anteriore e posteriore), imbardata e rollio.
- **Aero attiva (regolamento 2026)**: ali anteriore e posteriore con configurazione a basso drag sui rettilinei e ad alto carico in curva. Il passaggio tra le due è gestito secondo le regole (zone abilitate) e ha un transitorio.
- **Scia** (meno resistenza dietro un'altra auto) e **aria sporca** (meno carico in curva, gomme anteriori che si scaldano di più), con un modello semplificato di scia a cono.

### 6.5 Power unit e trasmissione
- Motore termico: curva di coppia, limitatore, freno motore, consumo di carburante (con la massa che cala durante la gara).
- **ERS (MGU-K, regolamento 2026)**: ripartizione di potenza circa 50/50 tra termico ed elettrico, niente MGU-H. Recupero in frenata e in rilascio, limiti di energia per giro, modalità di rilascio selezionabili e **modalità sorpasso** (energia extra quando si è vicini all'auto davanti), che sostituisce il DRS. La gestione dell'energia diventa una parte centrale della guida.
- Cambio sequenziale a 8 marce, tempo di cambiata realistico, differenziale con rampe di bloccaggio regolabili.
- Valori numerici (massa minima, potenze, energie) calibrati sui dati pubblici del regolamento 2026.

### 6.6 Freni
- Dischi in carbonio con modello termico (efficacia a freddo e a caldo).
- Ripartizione regolabile, brake-by-wire posteriore che interagisce con il recupero ERS.

### 6.7 Pista e ambiente
- Superfici con aderenza propria: asfalto, cordoli (con il loro profilo), erba, ghiaia, linea bianca bagnata.
- **Evoluzione della pista**: gommatura che aumenta l'aderenza giro dopo giro.
- Meteo: temperatura dell'aria e dell'asfalto, pioggia con livello d'acqua variabile e traiettoria che si asciuga.

### 6.8 Danni
- Ala anteriore, fondo, sospensioni, foratura.
- Ogni danno modifica i parametri aero e meccanici, e alcuni possono causare il ritiro.

### 6.9 Telemetria (strumento di sviluppo e di gioco)
- Registrazione di tutti i canali: velocità, giri motore, marcia, comandi, slittamento delle gomme, temperature, carichi, energia ERS.
- Grafici giro per giro e confronto tra giri. È indispensabile per calibrare il realismo, e diventa anche una funzione di gioco per i setup.

## 7. Input

### Tastiera
I tasti sono on/off, quindi l'input viene **filtrato** prima di arrivare alla fisica:
- velocità di salita e discesa configurabili per sterzo, gas e freno;
- sterzo massimo che cala con la velocità (opzionale, regolabile);
- ritorno al centro dello sterzo indipendente dalla velocità di sterzata;
- tasti modificatori per il dosaggio: es. tenendo un tasto premuto il gas si limita al 60% (utile in uscita dalle curve lente).

### Gamepad e volante
- Gamepad API con curve di risposta, zona morta e saturazione configurabili.
- Volanti: supporto base per assi e pulsanti. Il force feedback non è disponibile in modo affidabile nel browser, quindi è escluso.

### Aiuti alla guida (tutti disattivabili)
ABS, controllo di trazione, frenata assistita, cambio automatico, traiettoria ideale a schermo.

### Comandi
Tutti i comandi si possono riassegnare e vengono salvati nel profilo utente.

## 8. Rendering 3D
- Three.js con illuminazione PBR, ombre e cielo/illuminazione legati all'ora e al meteo.
- Viste: abitacolo, T-cam, dietro l'auto, telecamere TV per i replay.
- Senso della velocità: campo visivo dinamico, vibrazione della camera dovuta al motore e ai cordoli, motion blur leggero (opzionale).
- Modelli 3D: vetture e circuiti di fantasia, low/medium poly all'inizio, ottimizzati per il browser.
- **Hardware minimo: portatili con grafica integrata.**
  - Preset grafici (Basso / Medio / Alto / Ultra) con scelta automatica al primo avvio in base a un breve benchmark.
  - Nel preset Basso: niente ombre dinamiche, risoluzione di rendering ridotta e scalata (anche dinamica), modelli LOD semplificati, meno oggetti a bordo pista, niente post-processing.
  - Obiettivi: 60 fps su PC di fascia media, almeno 30 fps stabili su grafica integrata.
- **La fisica non si riduce mai con la grafica**: tutte le auto, sempre a 500 Hz e con lo stesso modello. Su hardware debole si abbassa solo la qualità visiva. Questo garantisce gare corrette e uguali per tutti, indispensabile per il multiplayer.

## 9. Piste
- **Formato**:
  - linea centrale come spline 3D;
  - larghezza variabile, pendenza trasversale delle curve;
  - zone di superficie (cordoli, erba, ghiaia), muri e barriere;
  - pit lane, linea del traguardo e settori.
- La mesh 3D viene **generata** dalla spline: modello fisico e grafico restano coerenti.
- I circuiti sono **di fantasia**, eventualmente ispirati a tracciati reali e ricostruiti da dati pubblici (OpenStreetMap/altimetria).
- Editor di piste in una fase successiva.

## 10. Intelligenza artificiale
- I piloti IA guidano **con la stessa fisica** del giocatore: niente scorciatoie, niente auto "su binari".
- Una traiettoria ideale pre-calcolata per pista dà il profilo di velocità di riferimento.
- Controllo con PID + logica anticipativa su frenata e sterzo.
- Ogni pilota ha attributi propri: velocità, costanza, aggressività, gestione gomme, abilità sul bagnato, tendenza all'errore.
- In gara: difesa, sorpasso, gestione del traffico, strategia ai box decisa dall'IA del team.

## 11. Piloti e team
- Nomi e aspetto dei piloti sono **di fantasia**, prodotti da un generatore interno: ogni pilota ha nome, volto caricaturale, colori di casco e tuta propri.
- I dati di partenza del generatore e le sue regole sono **privati** e non fanno parte di questo repository: sono in `.private/`, esclusa dal controllo di versione.
- Anche i team hanno nomi di fantasia, generati o scelti a mano.
- I ritratti compaiono nei menu, nelle schede pilota, nelle classifiche, sul podio e nelle sequenze di gara (in pista il volto è coperto dal casco).

## 12. Parte manageriale
- **Scuderia**: budget (con un tetto di spesa), personale, sede, reputazione.
- **Sviluppo**: albero di ricerca e sviluppo che migliora i parametri reali del modello fisico (mappa aero, peso, efficienza della PU, consumo delle gomme). Ogni aggiornamento ha un costo e un tempo di produzione.
- **Piloti**: contratti, stipendi, attributi che crescono con l'esperienza, rapporto con il team.
- **Weekend di gara**: prove libere, qualifiche, gara (lunghezza scalabile: 10%, 25%, 50%, 100%).
- **Setup**: ali, altezze, molle, barre, smorzatori, campanatura, convergenza, pressioni, ripartizione freno, differenziale, rapporti.
- **Strategia**: mescole assegnate per il weekend, piano soste, mappature e ERS gestibili da muretto o da abitacolo.
- **Gare non guidate**: durante il campionato il giocatore può guidare o fare solo il team principal. Le gare non guidate sono calcolate con un **modello statistico**: passo gara stimato dai parametri reali di vettura, setup e pilota, degrado gomme, strategia, eventi casuali (errori, guasti, safety car, meteo). Il risultato è immediato, con un riassunto giro per giro.
- Per coerenza, il modello statistico viene **tarato sulla fisica vera**: si simulano offline giri con il sim-core per ricavare i tempi di riferimento di ogni combinazione auto/pista.

## 13. Multiplayer ("Gioca in balotta")

**Decisione (ottobre 2026): ogni giocatore simula la propria auto nel browser, il server fa da arbitro.**
Il progetto iniziale prevedeva un server autoritativo che simula tutte le auto. Con la VPS in Canada
(~100 ms di andata e ritorno dall'Italia) la propria auto avrebbe risposto ai comandi in ritardo:
si è scelto di simulare la propria auto in locale (risposta immediata, come in singolo) e di usare
il server per tutto il resto. Barare sarebbe possibile, ma il gioco è privato e protetto da password.

- **Server** (`packages/server/src/rooms.ts`): stanze con sala d'attesa; in gara fa girare i piloti
  automatici con la stessa fisica, tiene giri, classifica, distacchi e arrivo ufficiali e invia a
  tutti lo stato di tutte le auto 20 volte al secondo.
- **Client**: simula la propria auto a 500 Hz e invia il suo stato 30 volte al secondo; le altre auto
  sono "remote": arrivano dalla rete, vengono proiettate in avanti di metà del tempo di andata e
  ritorno e tra un aggiornamento e l'altro proseguono a velocità costante (dead reckoning). I contatti
  con le auto remote agiscono sulla propria auto.
- **Partenza sincronizzata**: stesso seme per tutti, quindi stesso semaforo e stessa griglia
  (nomi e livree dei piloti automatici identici su ogni schermo).
- **Link d'invito** (`/?balotta=STANZA&k=TOKEN`, token firmato): vale come accesso senza password;
  quando viene aperto l'organizzatore riceve un avviso (anche sonoro e come notifica di sistema).
- L'organizzatore sceglie pista, giri, numero e livello dei piloti automatici e dà il via; chi entra a
  gara iniziata aspetta in sala la gara successiva; chi esce durante la gara viene ritirato.
- Protocollo condiviso tra client e server in `packages/shared` (messaggi JSON su WebSocket `/api/ws`).

## 14. Dati e DB (bozza)
- `users`, `profiles` (comandi, aiuti, preferenze)
- `careers` (salvataggio carriera), `seasons`, `events`, `results`
- `teams`, `drivers`, `contracts`, `rnd_projects`
- `cars` (parametri versionati), `tracks`
- `lap_records` (con il replay degli input, per la validazione)
- `mp_rooms`, `mp_results` (stanze e risultati multiplayer)

## 15. Deploy
- La VPS ospita anche altri progetti: un **reverse proxy condiviso** (nginx-proxy + acme-companion) gestisce HTTPS e certificati Let's Encrypt per tutti, in base alle variabili `VIRTUAL_HOST`/`LETSENCRYPT_HOST` dei container.
- bicio-F1: container `app` (server Node che serve il client, le API e in futuro il game server WebSocket) + `db` (PostgreSQL, senza porte esposte).
- Dominio: `bicio-f1.sbagiuzza.it`. Codice su GitHub: `stefanozanarini/bicio-f1`, con CI (typecheck, test, build, immagine Docker).
- Backup giornaliero del DB.
- Procedura completa in [DEPLOY.md](DEPLOY.md).

## 16. Roadmap

| Fase | Contenuto | Risultato giocabile |
|---|---|---|
| 0 ✅ | Monorepo, toolchain, CI, Docker | — |
| 1 ✅ | sim-core base (telaio, 4 gomme Pacejka, PU semplice, freni), pista di test piatta, input tastiera e gamepad, vista 3D essenziale, telemetria | Guidare una F1 su una pista di prova |
| 2 | Modello termico e usura delle gomme, mappa aero, sospensioni complete, ERS, pista vera con altimetria e cordoli, HUD, audio | Time trial realistico |
| 3 🟡 | IA avversari ✅, partenza con semaforo ✅, collisioni ✅, scia/aria sporca ✅, modalità sorpasso ✅; da fare: bandiere, penalità, pit stop, danni | Gara completa |
| 4 | Backend + DB: account, profili, giri record validati, salvataggi | Classifiche online |
| 5 | Manageriale: weekend completo, setup, campionato, scuderia, sviluppo, simulazione statistica delle gare non guidate | Modalità carriera |
| 6 | Meteo dinamico, safety car, replay con telecamere TV, più piste | Esperienza completa |
| 7 🟡 | Multiplayer online: sala d'attesa e link d'invito ✅, gara con piloti automatici ✅; da fare: rientro dopo disconnessione, gare classificate | Gare online |

La fase 1 è la più importante: se la guida non convince lì, il resto non conta. Avrà un ciclo di taratura dedicato con te.

## 17. Decisioni del 2026-10-13
- Multiplayer: **sì** (§13).
- Regolamento tecnico: **2026**.
- Gare non guidate in carriera: **modello statistico** (§12).
- Hardware minimo: **anche grafica integrata** (§8).

Nessun punto aperto bloccante: il documento attende approvazione e il via per il codice.
