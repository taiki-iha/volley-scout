import { HIT_POSITIONS, hitPosition, type HitPos } from '../core/court';
import { replay } from '../core/replay';
import type { Grade, MatchData, Side } from '../core/types';

export interface PlayerStats {
  side: Side; no: number;
  spike: { attempts: number; kills: number; errors: number; blocked: number; killRate: number | null; efficiency: number | null; killsByHit: Record<HitPos, number> };  // 打った位置別の決定数
  serve: { total: number; aces: number; errors: number; errorRate: number | null };
  blockPoints: number;
  reception: { total: number; A: number; B: number; C: number; D: number; passRate: number | null; perfectRate: number | null };
}

interface Acc {
  side: Side; no: number;
  attempts: number; kills: number; errors: number; blocked: number;
  killsByHit: Record<HitPos, number>;
  serveTotal: number; aces: number; serveErrors: number;
  blockPoints: number;
  rec: Record<Grade, number>;
}

export const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);
const other = (s: Side): Side => (s === 'us' ? 'them' : 'us');

export function playerStats(data: MatchData[], filter?: { set?: number }): PlayerStats[] {
  const map = new Map<string, Acc>();
  const get = (side: Side, no: number): Acc => {
    const key = `${side}:${no}`;
    let a = map.get(key);
    if (!a) {
      a = {
        side, no, attempts: 0, kills: 0, errors: 0, blocked: 0,
        killsByHit: { left: 0, center: 0, right: 0, back: 0 },
        serveTotal: 0, aces: 0, serveErrors: 0, blockPoints: 0, rec: { A: 0, B: 0, C: 0, D: 0 },
      };
      map.set(key, a);
    }
    return a;
  };
  const inSet = (set: number): boolean => filter?.set === undefined || set === filter.set;

  for (const m of data) {
    const st = replay(m.cfg, m.events);
    // 打った位置はそのラリー時点（得点前）の並びから求める（replay が無視したラリーは位置なし）
    const lineupAt = new Map(st.rallies.map((r) => [r.eventId, { us: r.usLineup, them: r.themLineup }]));
    const rallySet = new Map<string, number>();
    for (const e of m.events) {
      if (e.t === 'rally') rallySet.set(e.id, e.set);
      if (!inSet(e.set)) continue;
      if (e.t === 'attempt') {
        get(e.side, e.player).attempts++;
      } else if (e.t === 'rally' && e.side !== null && e.player !== null) {
        const a = get(e.side, e.player);
        switch (e.play) {
          case 'spike_kill':
            a.attempts++; a.kills++;
            {
              const l = lineupAt.get(e.id)?.[e.side];
              const h = l ? hitPosition(l, e.player) : null;
              if (h !== null) a.killsByHit[h]++;
            }
            break;
          case 'spike_error': a.attempts++; a.errors++; break;
          case 'spike_blocked':
            a.attempts++; a.errors++; a.blocked++;
            if (e.blocker !== null) get(other(e.side), e.blocker).blockPoints++;
            break;
          case 'serve_ace': a.aces++; break;
          case 'serve_error': a.serveErrors++; break;
          case 'block_point': a.blockPoints++; break;
          default: break;
        }
      }
    }
    for (const r of st.rallies) {
      if (!inSet(r.set)) continue;
      get(r.serving, r.server).serveTotal++;
    }
    for (const rc of m.receptions) {
      const set = rallySet.get(rc.rallyId);
      if (set === undefined || !inSet(set) || rc.receiver === null) continue;
      get('us', rc.receiver).rec[rc.grade]++;
    }
  }

  return [...map.values()]
    .sort((x, y) => (x.side === y.side ? x.no - y.no : x.side === 'us' ? -1 : 1))
    .map((a) => {
      const recTotal = a.rec.A + a.rec.B + a.rec.C + a.rec.D;
      return {
        side: a.side, no: a.no,
        spike: {
          attempts: a.attempts, kills: a.kills, errors: a.errors, blocked: a.blocked,
          killRate: ratio(a.kills, a.attempts), efficiency: ratio(a.kills - a.errors, a.attempts),
          killsByHit: Object.fromEntries(HIT_POSITIONS.map((h) => [h, a.killsByHit[h]])) as Record<HitPos, number>,
        },
        serve: { total: a.serveTotal, aces: a.aces, errors: a.serveErrors, errorRate: ratio(a.serveErrors, a.serveTotal) },
        blockPoints: a.blockPoints,
        reception: {
          total: recTotal, A: a.rec.A, B: a.rec.B, C: a.rec.C, D: a.rec.D,
          passRate: ratio(a.rec.A + a.rec.B, recTotal), perfectRate: ratio(a.rec.A, recTotal),
        },
      };
    });
}
