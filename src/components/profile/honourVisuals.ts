import { colors } from '../../theme';
import { HonourTier } from '../../data/honours';

// Shared visual language for honours, reused by the results earn-moment, the
// profile strip and the trophy case so a tier reads the same everywhere. Theme
// tokens only. The ramp climbs in prestige — a modest burgee in mist, a
// blue-riband in the brightest brass — rather than the literal token order, so
// the silverware reads at a glance.
export function tierRingColor(tier: HonourTier): string {
  switch (tier) {
    case 'burgee':
      return colors.mist;
    case 'pennant':
      return colors.tide;
    case 'cup':
      return colors.brass;
    case 'blueRiband':
      return colors.brassLight;
  }
}

export function tierLabel(tier: HonourTier): string {
  switch (tier) {
    case 'burgee':
      return 'Burgee';
    case 'pennant':
      return 'Pennant';
    case 'cup':
      return 'Cup';
    case 'blueRiband':
      return 'Blue Riband';
  }
}
