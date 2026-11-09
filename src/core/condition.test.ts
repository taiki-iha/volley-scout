import { describe, it, expect } from 'vitest';
import { badCondition, DEFAULT_THRESHOLDS } from './condition';
import type { PlayerStats } from '../stats/player';

function stats(attempts: number, kills: number): PlayerStats {
  return {
    side: 'us', no: 4,
    spike: { attempts, kills, errors: 0, blocked: 0, killRate: attempts ? kills / attempts : null, efficiency: attempts ? kills / attempts : null, killsByZone: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
    serve: { total: 0, aces: 0, errors: 0, errorRate: null }, blockPoints: 0,
    reception: { total: 0, A: 0, B: 0, C: 0, D: 0, passRate: null, perfectRate: null },
  };
}

describe('badCondition', () => {
  it('既定値', () => { expect(DEFAULT_THRESHOLDS).toEqual({ minSpikes: 5, maxKillRate: 0.3, maxServeErrorsPerSet: 2 }); });
  it('5本で決定1 → bad', () => { expect(badCondition(stats(5, 1), 0, DEFAULT_THRESHOLDS)).toBe(true); });
  it('4本で決定0 → bad でない', () => { expect(badCondition(stats(4, 0), 0, DEFAULT_THRESHOLDS)).toBe(false); });
  it('決定率ちょうど閾値は bad でない', () => { expect(badCondition(stats(10, 3), 0, DEFAULT_THRESHOLDS)).toBe(false); });
  it('サーブミス2 → bad', () => { expect(badCondition(stats(0, 0), 2, DEFAULT_THRESHOLDS)).toBe(true); });
  it('サーブミス1 → bad でない', () => { expect(badCondition(stats(0, 0), 1, DEFAULT_THRESHOLDS)).toBe(false); });
});
