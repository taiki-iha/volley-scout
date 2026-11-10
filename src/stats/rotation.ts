import { replay } from '../core/replay';
import type { MatchData } from '../core/types';
import { ratio } from './player';

export interface RotationStats {
  rotation: number; pointsWon: number; pointsLost: number;
  receiveRallies: number; sideouts: number; sideoutRate: number | null;
  serveRallies: number; breaks: number; breakRate: number | null;
}

// 試合ごとに replay して合算する。usRotation=null のラリーは除外。
export function rotationStats(data: MatchData[]): RotationStats[] {
  const rows = [1, 2, 3, 4, 5, 6].map((rotation) => ({
    rotation, pointsWon: 0, pointsLost: 0, receiveRallies: 0, sideouts: 0, serveRallies: 0, breaks: 0,
  }));
  for (const m of data) {
    const pointTo = new Map<string, 'us' | 'them'>();
    for (const e of m.events) if (e.t === 'rally') pointTo.set(e.id, e.pointTo);
    for (const r of replay(m.cfg, m.events).rallies) {
      const p = pointTo.get(r.eventId);
      if (r.usRotation === null || p === undefined) continue;
      const row = rows[r.usRotation - 1];
      if (!row) continue;
      const won = p === 'us';
      if (won) row.pointsWon++; else row.pointsLost++;
      if (r.serving === 'us') {
        row.serveRallies++;
        if (won) row.breaks++;
      } else {
        row.receiveRallies++;
        if (won) row.sideouts++;
      }
    }
  }
  return rows.map((a) => ({
    ...a,
    sideoutRate: ratio(a.sideouts, a.receiveRallies),
    breakRate: ratio(a.breaks, a.serveRallies),
  }));
}

/** 自チームのセッターが不明（ローテ番号なし）で、ローテ別成績から除外したラリーの数 */
export function unknownSetterRallies(data: MatchData[]): number {
  let n = 0;
  for (const m of data) {
    for (const r of replay(m.cfg, m.events).rallies) if (r.usRotation === null) n++;
  }
  return n;
}
