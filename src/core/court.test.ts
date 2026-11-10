import { describe, expect, it } from 'vitest';
import { attackOrigin, fromScreen, hitPosition, landZone, positionOf, toScreen, toSvg, zoneCenter } from './court';
import type { Lineup, Zone } from './types';

describe('landZone（守る側から見たゾーン）', () => {
  it('前（ネットから3m以内）は 左4・中央3・右2、後ろは 左5・中央6・右1', () => {
    expect(landZone({ x: 0.1, y: 0.1 })).toBe(4);
    expect(landZone({ x: 0.5, y: 0.2 })).toBe(3);
    expect(landZone({ x: 0.9, y: 0.3 })).toBe(2);
    expect(landZone({ x: 0.1, y: 0.9 })).toBe(5);
    expect(landZone({ x: 0.5, y: 0.5 })).toBe(6);
    expect(landZone({ x: 0.95, y: 0.99 })).toBe(1);
  });
  it('境目は後ろ・右側、範囲外は端に寄せる', () => {
    expect(landZone({ x: 1 / 3, y: 1 / 3 })).toBe(6);
    expect(landZone({ x: 2 / 3, y: 0 })).toBe(2);
    expect(landZone({ x: -0.2, y: 1.5 })).toBe(5);
    expect(landZone({ x: 1, y: 1 })).toBe(1);
  });
  it('ゾーンの中心は同じゾーンになる', () => {
    for (const z of [1, 2, 3, 4, 5, 6] as Zone[]) expect(landZone(zoneCenter(z))).toBe(z);
  });
});

describe('画面座標 ↔ チーム座標（画面と同じ向き）', () => {
  // 画面の相手コート（左）: 上から 5 4 / 6 3 / 1 2、ネットは右端
  it('相手コート: 左上=5、右上=4（ネット側）、右下=2、左下=1', () => {
    expect(landZone(fromScreen('them', 0.1, 0.1))).toBe(5);
    expect(landZone(fromScreen('them', 0.9, 0.1))).toBe(4);
    expect(landZone(fromScreen('them', 0.9, 0.5))).toBe(3);
    expect(landZone(fromScreen('them', 0.9, 0.9))).toBe(2);
    expect(landZone(fromScreen('them', 0.1, 0.9))).toBe(1);
    expect(landZone(fromScreen('them', 0.3, 0.5))).toBe(6);
  });
  // 画面の自チームコート（右）: 上から 2 1 / 3 6 / 4 5、ネットは左端
  it('自チームコート: 左上=2（ネット側）、右上=1、左下=4、右下=5', () => {
    expect(landZone(fromScreen('us', 0.1, 0.1))).toBe(2);
    expect(landZone(fromScreen('us', 0.9, 0.1))).toBe(1);
    expect(landZone(fromScreen('us', 0.1, 0.5))).toBe(3);
    expect(landZone(fromScreen('us', 0.1, 0.9))).toBe(4);
    expect(landZone(fromScreen('us', 0.9, 0.9))).toBe(5);
    expect(landZone(fromScreen('us', 0.7, 0.5))).toBe(6);
  });
  it('ネットに近いほど y が小さい、toScreen は逆変換', () => {
    expect(fromScreen('them', 1, 0.5).y).toBe(0);
    expect(fromScreen('us', 0, 0.5).y).toBe(0);
    for (const side of ['us', 'them'] as const) {
      const p = fromScreen(side, 0.25, 0.75);
      const s = toScreen(side, p);
      expect(s.u).toBeCloseTo(0.25);
      expect(s.v).toBeCloseTo(0.75);
    }
  });
  it('SVG: 相手コートは x 0〜9、自チームは 9〜18、ネットは x=9', () => {
    expect(toSvg('them', { x: 0.5, y: 0 })).toEqual({ x: 9, y: 4.5 });
    expect(toSvg('us', { x: 0.5, y: 0 })).toEqual({ x: 9, y: 4.5 });
    expect(toSvg('them', { x: 0, y: 1 })).toEqual({ x: 0, y: 0 });
    expect(toSvg('us', { x: 0, y: 1 })).toEqual({ x: 18, y: 9 });
  });
});

describe('打った位置', () => {
  const l: Lineup = [1, 2, 3, 4, 5, 6]; // ポジション1〜6
  it('前衛 4=レフト・3=センター・2=ライト、後衛はバック、いなければ null', () => {
    expect(hitPosition(l, 4)).toBe('left');
    expect(hitPosition(l, 3)).toBe('center');
    expect(hitPosition(l, 2)).toBe('right');
    expect([1, 5, 6].map((n) => hitPosition(l, n))).toEqual(['back', 'back', 'back']);
    expect(hitPosition(l, 9)).toBeNull();
    expect(positionOf(l, 6)).toBe(6);
  });
  it('矢印の始点: 前衛はネット寄り、バックはアタックラインの後ろ。レフトは左列', () => {
    expect(attackOrigin(4)).toEqual({ x: 1 / 6, y: 0.2 });
    expect(attackOrigin(2).x).toBeCloseTo(5 / 6);
    expect(attackOrigin(6)).toEqual({ x: 0.5, y: 0.42 });
    expect(attackOrigin(1).y).toBeGreaterThan(1 / 3);
  });
});
