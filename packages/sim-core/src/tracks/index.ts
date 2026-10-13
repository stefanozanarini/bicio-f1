import type { TrackDef } from '../track.ts';
import { LIDO_DI_SAVIO } from './lidoDiSavio.ts';
import { RIVIERA } from './riviera.ts';
import { TEST_TRACK } from './testTrack.ts';

/** Piste disponibili: la prima è quella predefinita. */
export const TRACKS: Record<string, TrackDef> = {
  [LIDO_DI_SAVIO.id]: LIDO_DI_SAVIO,
  [RIVIERA.id]: RIVIERA,
  [TEST_TRACK.id]: TEST_TRACK,
};

export const DEFAULT_TRACK_ID = LIDO_DI_SAVIO.id;

export { LIDO_DI_SAVIO, RIVIERA, TEST_TRACK };
