import type { TrackDef } from '../track.ts';

/**
 * "Autodromo della Riviera": circuito di fantasia tecnico, 17 curve.
 * Rettilineo dei box, tornante, esse veloci, chicane e un ultimo settore lento e guidato.
 */
export const RIVIERA: TrackDef = {
  id: 'riviera',
  name: 'Autodromo della Riviera',
  width: 13,
  kerbWidth: 1.5,
  kerbCurvature: 1 / 180,
  controlPoints: [
    [0, 0], [300, 0], [600, 0], [880, 0],
    // 1: tornante a destra
    [970, -10], [1010, -60], [985, -115],
    // 2: sinistra
    [930, -155], [910, -225],
    // 3-4: esse veloci
    [930, -300], [990, -360], [1000, -440], [985, -505],
    // sinistra stretta che apre il rettilineo
    [1000, -560], [1060, -590], [1200, -600], [1400, -605], [1520, -610],
    // 5: destra a 90°
    [1580, -620], [1610, -690], [1600, -780],
    // 6: sinistra
    [1620, -860], [1690, -890], [1800, -890],
    // 7: curvone veloce a destra
    [1900, -910], [1960, -990], [1950, -1100], [1890, -1170],
    // 8-9: chicane
    [1820, -1195], [1765, -1230], [1705, -1235], [1640, -1212],
    // rettilineo opposto
    [1450, -1215], [1200, -1220], [950, -1215],
    // 10: destra
    [750, -1200], [690, -1170], [660, -1100], [660, -1000],
    // 11-12: sinistra-destra
    [630, -930], [560, -900], [520, -850],
    // 13: lungo sinistra
    [500, -760], [430, -690], [330, -680],
    // 14: destra
    [250, -650], [200, -570], [190, -470],
    // 15-16: chicane lenta
    [215, -400], [180, -350], [140, -300],
    // 17: ultima curva, destra sul rettilineo
    [70, -220], [10, -150], [-35, -90], [-40, -40], [-28, -12],
  ],
};
