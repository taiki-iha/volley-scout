import type { ConditionThresholds } from './types';
import type { PlayerStats } from '../stats/player';

export const DEFAULT_THRESHOLDS: ConditionThresholds = { minSpikes: 5, maxKillRate: 0.3, maxServeErrorsPerSet: 2 };

export function badCondition(stats: PlayerStats, serveErrorsThisSet: number, th: ConditionThresholds): boolean {
  const { attempts, killRate } = stats.spike;
  const spikeBad = attempts >= th.minSpikes && killRate !== null && killRate < th.maxKillRate;
  return spikeBad || serveErrorsThisSet >= th.maxServeErrorsPerSet;
}
