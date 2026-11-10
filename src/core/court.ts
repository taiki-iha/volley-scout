// コートの座標・ゾーン・打った位置（純粋関数）。
//
// ■ チーム座標（LandPoint と同じ定義）: あるチームの片面コート（9m×9m）を、そのチームの選手がネットを向いて見た向きで 0〜1 に正規化する。
//   x = 0 が自分たちの左サイドライン、1 が右サイドライン
//   y = 0 がネット、1 がエンドライン（アタックライン = 3m は y = 1/3）
// ■ 画面座標（u, v）: 画面に表示した片面コートの枠の中を 0〜1 に正規化する。u = 左→右、v = 上→下。
//   画面は 左 = 相手コート（ネットは右端）、右 = 自チームコート（ネットは左端）。Court.tsx の並びと同じ向き:
//   相手 … 上から 5 4 / 6 3 / 1 2（相手の左手が画面の上）。自チーム … 上から 2 1 / 3 6 / 4 5（自チームの右手が画面の上）。
import type { LandPoint, Side, Zone } from './types';

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** 画面座標 → そのコートのチーム座標 */
export function fromScreen(side: Side, u: number, v: number): LandPoint {
  const cu = clamp01(u);
  const cv = clamp01(v);
  return side === 'them' ? { x: cv, y: 1 - cu } : { x: 1 - cv, y: cu };
}

/** チーム座標 → 画面座標（fromScreen の逆） */
export function toScreen(side: Side, p: LandPoint): { u: number; v: number } {
  return side === 'them' ? { u: 1 - p.y, v: p.x } : { u: p.y, v: 1 - p.x };
}

/**
 * 落下点のゾーン（守る側から見た通常のゾーン番号）。
 * 前（ネットから 3m 以内）: 左 4・中央 3・右 2 ／ 後ろ: 左 5・中央 6・右 1。境目はそれぞれ後ろ・右側のゾーンに入れる。
 */
export function landZone(p: LandPoint): Zone {
  const x = clamp01(p.x);
  const y = clamp01(p.y);
  const lane = x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2;   // 0=左 1=中央 2=右
  return (y < 1 / 3 ? ([4, 3, 2] as const) : ([5, 6, 1] as const))[lane];
}

/** ゾーンの中心（チーム座標）。コート上にゾーン番号を書くとき用 */
export function zoneCenter(z: Zone): LandPoint {
  const x = { 4: 1 / 6, 3: 0.5, 2: 5 / 6, 5: 1 / 6, 6: 0.5, 1: 5 / 6 }[z];
  return { x, y: z >= 2 && z <= 4 ? 1 / 6 : 2 / 3 };
}

// ---------- 打った位置 ----------

export type HitPos = 'left' | 'center' | 'right' | 'back';
export const HIT_POSITIONS: HitPos[] = ['left', 'center', 'right', 'back'];
export const HIT_LABEL: Record<HitPos, string> = { left: 'レフト', center: 'センター', right: 'ライト', back: 'バック' };

/**
 * 打った選手のポジション（1〜6）。lineup は index0 = ポジション1。コートにいなければ null。
 */
export function positionOf(lineup: readonly number[], no: number): number | null {
  const i = lineup.indexOf(no);
  return i < 0 ? null : i + 1;
}

/** 打った位置: 前衛 4 = レフト・3 = センター・2 = ライト、後衛（1・6・5）はバックアタック。コートにいなければ null */
export function hitPosition(lineup: readonly number[], no: number): HitPos | null {
  const pos = positionOf(lineup, no);
  if (pos === null) return null;
  return pos === 4 ? 'left' : pos === 3 ? 'center' : pos === 2 ? 'right' : 'back';
}

/**
 * コース図で矢印を始める点（打った側のチーム座標）。前衛はネットから 1.8m、バックアタックはアタックラインのすぐ後ろ。
 * 横はポジションの列（4・5 = 左、3・6 = 中央、2・1 = 右）。
 */
export function attackOrigin(position: number): LandPoint {
  const x = position === 4 || position === 5 ? 1 / 6 : position === 3 || position === 6 ? 0.5 : 5 / 6;
  const front = position >= 2 && position <= 4;
  return { x, y: front ? 0.2 : 0.42 };
}

// ---------- コース図（SVG）の座標 ----------

/** SVG の単位は m。左の相手コートが x 0〜9、右の自チームコートが x 9〜18（ネットは x = 9）、y 0〜9。画面と同じ向き */
export const COURT_M = 9;
export function toSvg(side: Side, p: LandPoint): { x: number; y: number } {
  const { u, v } = toScreen(side, p);
  return { x: (side === 'them' ? 0 : COURT_M) + u * COURT_M, y: v * COURT_M };
}
