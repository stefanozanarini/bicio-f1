/**
 * Stampa le prestazioni della vettura di default: `npm run metrics`.
 * Utile durante la taratura dei parametri in src/params.ts.
 */
import { accelerationRun, brakingDistance, maxLateralG } from './scenarios.ts';

const f = (x: number, d = 2) => x.toFixed(d);

const acc = accelerationRun();
console.log('Accelerazione');
console.log(`  0-100 km/h  ${f(acc.t100)} s`);
console.log(`  0-200 km/h  ${f(acc.t200)} s`);
console.log(`  0-300 km/h  ${f(acc.t300)} s`);
console.log(`  velocità a 1000 m  ${f(acc.speedAt1000m, 0)} km/h`);
console.log(`  velocità massima   ${f(acc.topSpeed, 0)} km/h`);

console.log('Frenata (ABS)');
for (const v of [100, 200, 300]) {
  const b = brakingDistance(v);
  console.log(`  ${v}-0 km/h  ${f(b.distance, 1)} m in ${f(b.time)} s`);
}
const nb = brakingDistance(200, false);
console.log(`  200-0 km/h senza ABS  ${f(nb.distance, 1)} m`);

console.log('Accelerazione laterale massima');
for (const v of [80, 150, 220, 280]) console.log(`  ${v} km/h  ${f(maxLateralG(v))} g`);
