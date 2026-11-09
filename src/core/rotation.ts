import type { Lineup } from './types';

export function rotate(l: Lineup): Lineup {
  return l.map((_, i) => l[(i + 1) % 6]) as Lineup;
}
export function server(l: Lineup): number {
  return l[0];
}
// ポジション2,3,4 = index 1,2,3
export function isFrontRow(l: Lineup, no: number): boolean {
  const i = l.indexOf(no);
  return i >= 1 && i <= 3;
}
export function replacePlayer(l: Lineup, out: number, inNo: number): Lineup {
  return l.map((n) => (n === out ? inNo : n)) as Lineup;
}
export function setterRotation(l: Lineup, setter: number | null): number | null {
  if (setter === null) return null;
  const i = l.indexOf(setter);
  return i < 0 ? null : i + 1;
}
