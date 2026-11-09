import { describe, it, expect } from 'vitest';
import { pointWinner, targetPoints, isSetOver, setsToWin, isMatchOver } from './rules';
import type { MatchConfig } from './types';

const bo3: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const fx3: MatchConfig = { format: 'fixed', sets: 3, points: 25, finalSetPoints: 15 };
describe('rules', () => {
  it('pointWinner', () => {
    expect(pointWinner('us', 'spike_kill')).toBe('us');
    expect(pointWinner('us', 'spike_blocked')).toBe('them');
    expect(pointWinner('them', 'serve_error')).toBe('us');
  });
  it('targetPoints', () => {
    expect(targetPoints(bo3, 3)).toBe(15);
    expect(targetPoints(fx3, 3)).toBe(25);
  });
  it('isSetOver', () => {
    expect(isSetOver(bo3, 1, 25, 23)).toBe(true);
    expect(isSetOver(bo3, 1, 25, 24)).toBe(false);
    expect(isSetOver(bo3, 1, 27, 25)).toBe(true);
    expect(isSetOver(bo3, 3, 15, 13)).toBe(true);
  });
  it('setsToWin', () => {
    expect(setsToWin(bo3)).toBe(2);
    expect(setsToWin(fx3)).toBeNull();
  });
  it('isMatchOver', () => {
    expect(isMatchOver(bo3, { us: 2, them: 0 }, 2)).toBe(true);
    expect(isMatchOver(fx3, { us: 2, them: 0 }, 2)).toBe(false);
    expect(isMatchOver(fx3, { us: 2, them: 1 }, 3)).toBe(true);
  });
});
