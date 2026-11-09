import { replay } from '../core/replay';
import type { Grade, MatchData, Side, Zone } from '../core/types';

export interface PlayerStats {
  side: Side; no: number;
  spike: { attempts: number; kills: number; errors: number; blocked: number; killRate: number | null; efficiency: number | null; killsByZone: Record<Zone, number> };
  serve: { total: number; aces: number; errors: number; errorRate: number | null };
  blockPoints: number;
  reception: { total: number; A: number; B: number; C: number; D: number; passRate: number | null; perfectRate: number | null };
}

interface Acc {
  side: Side; no: number;
  attempts: number; kills: number; errors: number; blocked: number;
  killsByZone: Record<Zone, number>;
  serveTotal: number; aces: number; serveErrors: number;
  blockPoints: number;
  rec: Record<Grade, number>;
}

const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];
const other = (s: Side): Side => (s === 'us' ? 'them' : 'us');

export function playerStats(data: MatchData[], filter?: { set?: number }): PlayerStats[] {
  const map = new Map<string, Acc>();
  const get = (side: Side, no: number): Acc => {
    const key = `${side}:${no}`;
    let a = map.get(key);
    if (!a) {
      a = {
        side, no, attempts: 0, kills: 0, errors: 0, blocked: 0,
        killsByZone: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
        serveTotal: 0, aces: 0, serveErrors: 0, blockPoints: 0, rec: { A: 0, B: 0, C: 0, D: 0 },
      };
      map.set(key, a);
    }
    return a;
  };
  const inSet = (set: number): boolean => filter?.set === undefined || set === filter.set;

  for (const m of data) {
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
            if (e.zone !== null) a.killsByZone[e.zone]++;
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
    for (const r of replay(m.cfg, m.events).rallies) {
      if (!inSet(r.set)) continue;
      get(r.serving, r.server).serveTotal++;
    }
    for (const rc of m.receptions) {
      const set = rallySet.get(rc.rallyId);
      if (set === undefined || !inSet(set) || rc.receiver === null) continue;
      get('us', rc.receiver).rec[rc.grade]++;
    }
  }

  const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);
  return [...map.values()]
    .sort((x, y) => (x.side === y.side ? x.no - y.no : x.side === 'us' ? -1 : 1))
    .map((a) => {
      const recTotal = a.rec.A + a.rec.B + a.rec.C + a.rec.D;
      return {
        side: a.side, no: a.no,
        spike: {
          attempts: a.attempts, kills: a.kills, errors: a.errors, blocked: a.blocked,
          killRate: ratio(a.kills, a.attempts), efficiency: ratio(a.kills - a.errors, a.attempts),
          killsByZone: Object.fromEntries(ZONES.map((z) => [z, a.killsByZone[z]])) as Record<Zone, number>,
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
