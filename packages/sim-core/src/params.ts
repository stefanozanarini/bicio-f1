/**
 * Parametri della vettura.
 *
 * I valori di default descrivono una F1 plausibile secondo il regolamento tecnico 2026
 * (dati pubblici e stime). Sono il punto di partenza per la taratura: i test "golden"
 * in test/performance.test.ts controllano che le prestazioni restino in intervalli
 * realistici quando si cambiano.
 */

export interface TireParams {
  /** Raggio di rotolamento [m] */
  radius: number;
  /** Inerzia ruota + gomma + disco [kg m^2] */
  inertia: number;
  /** Coefficiente d'attrito di picco al carico nominale */
  mu0: number;
  /** Carico nominale [N] */
  fz0: number;
  /** Sensibilità al carico: mu = mu0 * (1 - loadSens * (fz/fz0 - 1)) */
  loadSens: number;
  /** Rapporto di slittamento longitudinale di picco */
  peakSlipRatio: number;
  /** Angolo di deriva di picco [rad] */
  peakSlipAngle: number;
  /** Fattore di forma Pacejka C: determina quanto cala l'aderenza oltre il picco */
  shapeC: number;
  /** Rapporto tra aderenza longitudinale e laterale (ellisse d'attrito) */
  longGripScale: number;
  /** Lunghezza di rilassamento longitudinale [m] */
  relaxLong: number;
  /** Lunghezza di rilassamento laterale [m] */
  relaxLat: number;
  /** Coefficiente di resistenza al rotolamento */
  rollingRes: number;
}

export interface EngineParams {
  /** Curva di coppia del termico: coppie [Nm] ai regimi rpm[] (piena farfalla) */
  torqueCurveRpm: number[];
  torqueCurveNm: number[];
  idleRpm: number;
  /** Regime a cui la frizione automatica di partenza tiene il motore */
  launchRpm: number;
  limiterRpm: number;
  /** Inerzia del motore riportata all'albero [kg m^2] */
  inertia: number;
  /** Coppia di freno motore a farfalla chiusa e regime massimo [Nm] */
  engineBrakeNm: number;
}

export interface ErsParams {
  /** Potenza massima MGU-K in erogazione [W] */
  maxDeployPower: number;
  /** Potenza massima MGU-K in recupero [W] */
  maxHarvestPower: number;
  /** Capacità utile della batteria [J] */
  storeCapacity: number;
  /** Velocità oltre la quale la potenza MGU-K inizia a calare [m/s] */
  taperStartSpeed: number;
  /** Velocità a cui la potenza MGU-K arriva a zero [m/s] */
  taperEndSpeed: number;
  /** Rendimento del ciclo di recupero */
  harvestEfficiency: number;
}

export interface GearboxParams {
  /** Rapporti complessivi (cambio x riduzione finale), dalla 1a all'8a */
  ratios: number[];
  reverseRatio: number;
  efficiency: number;
  /** Durata della cambiata [s] (cambio seamless: interruzione minima) */
  shiftTime: number;
}

export interface DiffParams {
  /** Coppia di precarico [Nm] */
  preload: number;
  /** Frazione della coppia in ingresso usabile per il bloccaggio */
  rampLock: number;
  /** Rigidezza del bloccaggio [Nm / (rad/s)] */
  stiffness: number;
}

export interface BrakeParams {
  /** Coppia frenante massima totale [Nm] (tutte e 4 le ruote) */
  maxTorque: number;
  /** Ripartizione anteriore (0..1) */
  bias: number;
}

export interface AeroParams {
  /** Coefficiente di portanza negativa x area [m^2], configurazione curva */
  clA: number;
  /** Coefficiente di resistenza x area [m^2], configurazione curva */
  cdA: number;
  /** Configurazione rettilineo (aero attiva 2026) */
  clAStraight: number;
  cdAStraight: number;
  /** Frazione del carico sull'asse anteriore */
  balanceFront: number;
  /** Altezza del centro di pressione della resistenza [m] */
  dragHeight: number;
}

export interface ChassisParams {
  /** Massa con pilota e carburante [kg] */
  mass: number;
  /** Inerzia d'imbardata [kg m^2] */
  yawInertia: number;
  wheelbase: number;
  trackFront: number;
  trackRear: number;
  /** Frazione di peso statico sull'anteriore */
  weightFront: number;
  /** Altezza del baricentro [m] */
  cgHeight: number;
  /** Frazione della rigidezza a rollio sull'anteriore */
  rollStiffnessFront: number;
  /** Costante di tempo del trasferimento di carico (dinamica sospensioni) [s] */
  loadTransferTau: number;
  /** Angolo massimo di sterzata delle ruote [rad] */
  maxSteerAngle: number;
}

export interface CarParams {
  chassis: ChassisParams;
  aero: AeroParams;
  tireFront: TireParams;
  tireRear: TireParams;
  engine: EngineParams;
  ers: ErsParams;
  gearbox: GearboxParams;
  diff: DiffParams;
  brakes: BrakeParams;
}

const DEG = Math.PI / 180;

function makeTire(overrides: Partial<TireParams>): TireParams {
  return {
    radius: 0.353,
    inertia: 1.1,
    mu0: 1.75,
    fz0: 3500,
    loadSens: 0.14,
    peakSlipRatio: 0.09,
    peakSlipAngle: 5.5 * DEG,
    shapeC: 1.4,
    longGripScale: 1.0,
    relaxLong: 0.15,
    relaxLat: 0.35,
    rollingRes: 0.012,
    ...overrides,
  };
}

export function defaultCar2026(): CarParams {
  return {
    chassis: {
      mass: 798, // 768 kg minimo regolamentare 2026 + ~30 kg di carburante
      yawInertia: 1000,
      wheelbase: 3.4, // passo massimo 2026
      trackFront: 1.6,
      trackRear: 1.55,
      weightFront: 0.45,
      cgHeight: 0.28,
      rollStiffnessFront: 0.52,
      loadTransferTau: 0.035,
      maxSteerAngle: 16 * DEG,
    },
    aero: {
      clA: 4.3,
      cdA: 1.1,
      clAStraight: 1.9,
      cdAStraight: 0.62,
      balanceFront: 0.43,
      dragHeight: 0.45,
    },
    tireFront: makeTire({ peakSlipAngle: 5.8 * DEG, inertia: 1.0 }),
    tireRear: makeTire({ peakSlipAngle: 5.3 * DEG, inertia: 1.25, fz0: 4000 }),
    engine: {
      // V6 1.6 turbo, ~400 kW di picco intorno agli 11.000 giri
      torqueCurveRpm: [0, 4000, 6000, 8000, 10000, 11000, 12000, 12500, 13000],
      torqueCurveNm: [180, 250, 310, 345, 350, 347, 320, 280, 0],
      idleRpm: 4000,
      launchRpm: 9000,
      limiterRpm: 12500,
      inertia: 0.05,
      engineBrakeNm: 70,
    },
    ers: {
      maxDeployPower: 350_000,
      maxHarvestPower: 350_000,
      storeCapacity: 4_000_000,
      // Riduzione della potenza elettrica alle alte velocità: valori da tarare sul regolamento
      taperStartSpeed: 290 / 3.6,
      taperEndSpeed: 355 / 3.6,
      harvestEfficiency: 0.9,
    },
    gearbox: {
      // Progressione geometrica: 1a ~95 km/h, 8a ~350 km/h a 12.000 giri
      ratios: [17.75, 14.62, 12.04, 9.92, 8.17, 6.73, 5.54, 4.56],
      reverseRatio: 18,
      efficiency: 0.95,
      shiftTime: 0.025,
    },
    diff: {
      preload: 80,
      rampLock: 0.35,
      stiffness: 150,
    },
    brakes: {
      maxTorque: 2 * 4600 + 2 * 3000,
      bias: 0.57,
    },
  };
}
