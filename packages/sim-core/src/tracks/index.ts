import type { TrackDef } from '../track.ts';
import { RIVIERA } from './riviera.ts';
import { TEST_TRACK } from './testTrack.ts';

export const TRACKS: Record<string, TrackDef> = {
  [RIVIERA.id]: RIVIERA,
  [TEST_TRACK.id]: TEST_TRACK,
};

export { RIVIERA, TEST_TRACK };
