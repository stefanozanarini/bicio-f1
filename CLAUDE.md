# bicio-F1 — note per lo sviluppo

- Lingua: interfaccia, commenti e documentazione in italiano.
- Il requisito principale è la **guida il più realistica possibile**. Le scelte di fisica vanno giustificate e misurate (`npm run metrics`, test in `packages/sim-core/test/performance.test.ts`).
- `packages/sim-core` deve restare deterministico e senza dipendenze da DOM/Node:
  - niente `Math.sin/cos/atan/exp/pow/random`, `Date.now`, `performance.now`, operatore `**`: si usano le funzioni di `src/dmath.ts` (lo controlla `test/purity.test.ts`);
  - passo fisso `DT` a 500 Hz.
- La grafica non deve mai influire sulla fisica: la qualità grafica cambia solo il rendering.
- Nomi e aspetto dei piloti: regole private in `.private/PILOTI.md` (escluso da git). Non scrivere mai quelle informazioni nei file versionati.
- Monorepo con npm workspaces. Node locale 18.19+, nei container Node 22.
- Prima di consegnare: `npm run typecheck && npm test && npm run build`.
