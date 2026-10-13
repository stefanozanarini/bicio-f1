import type { TrackDef } from '../track.ts';

/**
 * "Circuito di prova Bassa Pianura": pista piatta di fantasia per la fase 1.
 * Contiene un rettilineo lungo, una curva a 90° lenta, un curvone veloce, due chicane,
 * due tornanti, un secondo rettilineo e una sequenza di esse: abbastanza per tarare
 * frenata, trazione, curve lente e veloci.
 */
export const TEST_TRACK: TrackDef = {
  id: 'bassa-pianura',
  name: 'Circuito di prova Bassa Pianura',
  width: 14,
  kerbWidth: 1.5,
  kerbCurvature: 1 / 180,
  controlPoints: [
    // Rettilineo principale (traguardo all'origine), verso est
    [0, 0],
    [250, 0],
    [500, 0],
    [750, 0],
    [950, 0],
    // Curva 1: destra a 90°, lenta
    [1040, -8],
    [1085, -50],
    [1095, -130],
    [1095, -230],
    // Curva 2: curvone veloce a sinistra
    [1110, -330],
    [1170, -410],
    [1270, -450],
    [1400, -460],
    [1520, -460],
    // Curve 3-4: chicane destra-sinistra
    [1590, -470],
    [1630, -500],
    [1680, -515],
    [1780, -510],
    [1880, -505],
    // Curva 5: tornante a destra
    [1950, -515],
    [1985, -560],
    [1980, -615],
    [1940, -648],
    [1870, -655],
    // Rettilineo opposto, verso ovest
    [1650, -655],
    // Chicane veloce sul rettilineo opposto
    [1490, -655],
    [1440, -638],
    [1385, -640],
    [1335, -665],
    [1280, -672],
    [1100, -660],
    [950, -650],
    // Curve 6-7-8: esse veloci
    [820, -625],
    [700, -600],
    [590, -630],
    [480, -670],
    [350, -680],
    // Tornante e destra-sinistra prima del traguardo
    [210, -660],
    [90, -620],
    [10, -560],
    [-40, -500],
    [-115, -470],
    [-185, -512],
    [-238, -455],
    [-205, -378],
    [-120, -340],
    [-105, -260],
    [-130, -170],
    [-110, -80],
    [-50, -15],
  ],
};
