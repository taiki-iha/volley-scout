import { describe, it, expect } from 'vitest';
import { opponentScorers, receptionByOpponentServer, receptionRows } from './opponent';
import type { Lineup, MatchConfig, MatchEvent, PlayKind, Reception, Side, Zone } from '../core/types';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];
let n = 0;
const start = (firstServe: Side): MatchEvent => {
  n++;
  return { id: `s${n}`, seq: n, set: 1, at: n, t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe };
};
const rally = (play: PlayKind, side: Side | null, player: number | null, pointTo: Side, zone: Zone | null = null): MatchEvent => {
  n++;
  return { id: `r${n}`, seq: n, set: 1, at: n, t: 'rally', side, player, play, zone, blocker: null, pointTo };
};

describe('opponentScorers', () => {
  it('相手#7 zone4から2本 → byZone[4]===2、自チーム得点は含まない', () => {
    const ev = [start('us'), rally('spike_kill', 'them', 7, 'them', 4), rally('spike_kill', 'them', 7, 'them', 4),
      rally('spike_kill', 'us', 4, 'us', 4), rally('serve_ace', 'them', 3, 'them')];
    const r = opponentScorers([{ cfg, events: ev, receptions: [] }]);
    expect(r.map((x) => x.no)).toEqual([7, 3]);
    expect(r[0].points).toBe(2);
    expect(r[0].byZone[4]).toBe(2);
    expect(r[0].byPlay.spike_kill).toBe(2);
    expect(r[1].byPlay.serve_ace).toBe(1);
  });
  it('複数試合合算', () => {
    const m = () => ({ cfg, events: [start('us'), rally('spike_kill', 'them', 7, 'them', 4)], receptions: [] });
    expect(opponentScorers([m(), m()])[0].points).toBe(2);
  });
});

describe('receptionRows', () => {
  it('相手サーブエースはD、通常はnull、時系列順', () => {
    const ev = [start('them'), rally('serve_ace', 'them', 11, 'them'), rally('spike_kill', 'us', 4, 'us')];
    const rows = receptionRows(cfg, ev);
    expect(rows.map((r) => r.preset)).toEqual(['D', null]);
    expect(rows[0].rallyId).toBe(ev[1].id);
    expect(rows[0].scoreBefore).toEqual({ us: 0, them: 0 });
    expect(rows[0].server).toBe(11);
  });
  it('相手サーブミスのrallyは含まれない', () => {
    const ev = [start('them'), rally('serve_error', 'them', 11, 'us')];
    expect(receptionRows(cfg, ev)).toEqual([]);
  });
});

describe('receptionByOpponentServer', () => {
  it('サーバー別に集計し、無関係なrallyIdは無視', () => {
    const ev = [start('them'), rally('other_point', 'them', 11, 'them'), rally('spike_kill', 'us', 4, 'us')];
    const ids = ev.filter((e) => e.t === 'rally').map((e) => e.id);
    const rec: Reception[] = [{ rallyId: ids[0], receiver: 5, grade: 'A' }, { rallyId: ids[1], receiver: 5, grade: 'C' }, { rallyId: 'zzz', receiver: 5, grade: 'D' }];
    const r = receptionByOpponentServer([{ cfg, events: ev, receptions: rec }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ server: 11, total: 2, A: 1, C: 1, B: 0, D: 0 });
    expect(r[0].passRate).toBeCloseTo(0.5);
  });
});
