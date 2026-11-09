import { describe, it, expect } from 'vitest';
import { rotate, server, isFrontRow, replacePlayer, setterRotation } from './rotation';
import type { Lineup } from './types';

const L: Lineup = [1, 2, 3, 4, 5, 6];
describe('rotation', () => {
  it('rotate', () => {
    expect(rotate(L)).toEqual([2, 3, 4, 5, 6, 1]);
    expect(server(rotate(L))).toBe(2);
  });
  it('isFrontRow', () => {
    expect(isFrontRow(L, 3)).toBe(true);
    expect(isFrontRow(L, 6)).toBe(false);
  });
  it('replacePlayer', () => {
    expect(replacePlayer(L, 4, 12)).toEqual([1, 2, 3, 12, 5, 6]);
  });
  it('setterRotation', () => {
    expect(setterRotation(L, 1)).toBe(1);
    expect(setterRotation(rotate(L), 1)).toBe(6);
    expect(setterRotation(L, 99)).toBeNull();
    expect(setterRotation(L, null)).toBeNull();
  });
});
