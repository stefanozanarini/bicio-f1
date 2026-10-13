import type { TrackDef } from '../track.ts';

/**
 * "Lido di Savio": circuito costiero di fantasia. Rettilineo dei box sul lungomare
 * (mare a est), curve guidate nella pineta, chicane sul ponte del Savio e tornante
 * finale che riporta sul lungomare.
 */
export const LIDO_DI_SAVIO: TrackDef = {
  id: 'lido-di-savio',
  name: 'Lido di Savio',
  width: 13,
  kerbWidth: 1.5,
  kerbCurvature: 1 / 180,
  theme: 'mare',
  controlPoints: [
    // Lungomare, verso nord
    [0, 0], [0, 250], [0, 500], [0, 750], [-5, 900],
    // 1: sinistra stretta verso la pineta
    [-25, 975], [-80, 1020], [-160, 1030],
    // 2-3-4: esse nella pineta
    [-250, 1000], [-330, 1045], [-420, 1015], [-505, 1055],
    // 5: sinistra verso sud
    [-600, 1050], [-665, 1000], [-690, 920],
    // 6-7: esse veloci sul viale della pineta
    [-690, 820], [-720, 740], [-685, 650], [-700, 560],
    // 8-9: chicane del ponte sul Savio
    [-700, 480], [-678, 428], [-704, 372], [-700, 300],
    // 10: sinistra verso est
    [-695, 160], [-660, 60], [-570, 10], [-450, 0],
    // 11: destra in discesa verso il mare
    [-330, -10], [-240, -45],
    // 12: tornante a sinistra che riporta sul lungomare
    [-160, -115], [-80, -160], [-10, -135], [8, -70],
  ],
};
