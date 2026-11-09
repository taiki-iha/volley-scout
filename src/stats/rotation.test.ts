import { describe, it, expect } from 'vitest';
import { rotationStats } from './rotation';
import type { Lineup, MatchConfig, MatchData, MatchEvent, PlayKind, Side } from '../core/types';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];
let n = 0;
const start = (firstServe: Side): MatchEvent => {
  n++;
  return { id: `s${n}`, seq: n, set: 1, at: n, t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe };
};
const rally = (play: PlayKind, side: Side | null, player: number | null, pointTo: Side): MatchEvent => {
  n++;
  return { id: `r${n}`, seq: n, set: 1, at: n, t: 'rally', side, player, play, zone: null, blocker: null, pointTo };
};

describe('rotationStats', () => {
  it('常に6行', () => {
    const r = rotationStats([]);
    expect(r.map((x) => x.rotation)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r[0].sideoutRate).toBeNull();
    expect(r[0].breakRate).toBeNull();
  });
  it('相手サーブ4本中3本取得 → sideoutRate 0.75', () => {
    // 同じローテで相手サーブ4本: 取れた場合は自サーブになるので、3試合+1試合で同ローテを作る
    const win = (): MatchData => ({ cfg, events: [start('them'), rally('spike_kill', 'us', 4, 'us')], receptions: [] });
    const lose = (): MatchData => ({ cfg, events: [start('them'), rally('other_point', 'them', 11, 'them')], receptions: [] });
    const rows = rotationStats([win(), win(), win(), lose()]);
    const row = rows.find((r) => r.receiveRallies === 4)!;
    expect(row.sideouts).toBe(3);
    expect(row.sideoutRate).toBeCloseTo(0.75);
    expect(row.pointsWon).toBe(3);
    expect(row.pointsLost).toBe(1);
  });
  it('ブレイク率', () => {
    const ser = rotationStats([{ cfg, events: [start('us'), rally('serve_ace', 'us', 1, 'us'), rally('spike_error', 'us', 4, 'them')], receptions: [] }]);
    const sr = ser.reduce((a, r) => ({ s: a.s + r.serveRallies, b: a.b + r.breaks }), { s: 0, b: 0 });
    expect(sr).toEqual({ s: 2, b: 1 });
    expect(ser.find((r) => r.serveRallies === 2)!.breakRate).toBeCloseTo(0.5);
  });
});
