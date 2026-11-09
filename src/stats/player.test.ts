import { describe, it, expect } from 'vitest';
import { playerStats } from './player';
import type { Lineup, MatchConfig, MatchData, MatchEvent, PlayKind, Reception, Side, Zone } from '../core/types';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];

let n = 0;
function start(firstServe: Side, set = 1, idp = 'm'): MatchEvent {
  n++;
  return { id: `${idp}s${n}`, seq: n, set, at: n, t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe };
}
function rally(play: PlayKind, side: Side | null, player: number | null, pointTo: Side, o: { zone?: Zone | null; blocker?: number | null; set?: number; idp?: string } = {}): MatchEvent {
  n++;
  return { id: `${o.idp ?? 'm'}r${n}`, seq: n, set: o.set ?? 1, at: n, t: 'rally', side, player, play, zone: o.zone ?? null, blocker: o.blocker ?? null, pointTo };
}
function attempt(side: Side, player: number, set = 1): MatchEvent {
  n++;
  return { id: `a${n}`, seq: n, set, at: n, t: 'attempt', side, player, zone: null };
}
const one = (events: MatchEvent[], receptions: Reception[] = [], set?: number) =>
  playerStats([{ cfg, events, receptions }], set === undefined ? undefined : { set });
const find = (r: ReturnType<typeof one>, side: Side, no: number) => r.find((p) => p.side === side && p.no === no)!;

describe('playerStats', () => {
  it('スパイク集計: 決定2・ミス1・被ブロック1・継続5', () => {
    const ev: MatchEvent[] = [start('them')];
    ev.push(rally('spike_kill', 'us', 4, 'us', { zone: 4 }));
    ev.push(rally('spike_kill', 'us', 4, 'us', { zone: 4 }));
    ev.push(rally('spike_error', 'us', 4, 'them'));
    ev.push(rally('spike_blocked', 'us', 4, 'them', { blocker: 12 }));
    for (let i = 0; i < 5; i++) ev.push(attempt('us', 4));
    const p = find(one(ev), 'us', 4);
    expect(p.spike.attempts).toBe(9);
    expect(p.spike.kills).toBe(2);
    expect(p.spike.errors).toBe(2);
    expect(p.spike.blocked).toBe(1);
    expect(p.spike.killRate).toBeCloseTo(2 / 9);
    expect(p.spike.efficiency).toBeCloseTo(0);
    expect(p.spike.killsByZone[4]).toBe(2);
    expect(p.spike.killsByZone[1]).toBe(0);
  });

  it('スパイクなしは null', () => {
    const ev = [start('us'), rally('serve_ace', 'us', 1, 'us')];
    const p = find(one(ev), 'us', 1);
    expect(p.spike.attempts).toBe(0);
    expect(p.spike.killRate).toBeNull();
    expect(p.spike.efficiency).toBeNull();
  });

  it('サーブ: total は server の rally 数、ace/error', () => {
    const ev = [
      start('us'),
      rally('serve_ace', 'us', 1, 'us'),
      rally('serve_error', 'us', 1, 'them'),
      rally('other_point', null, null, 'them'),
    ];
    const r = one(ev);
    const p = find(r, 'us', 1);
    expect(p.serve.total).toBe(2);
    expect(p.serve.aces).toBe(1);
    expect(p.serve.errors).toBe(1);
    expect(p.serve.errorRate).toBeCloseTo(0.5);
    const themServes = r.filter((x) => x.side === 'them').reduce((a, x) => a + x.serve.total, 0);
    expect(themServes).toBe(1); // 相手のサーブ権は rotate 後の選手（行が生成される）
  });

  it('serve.total が 0 なら errorRate は null', () => {
    const ev = [start('them'), rally('block_point', 'us', 3, 'us')];
    expect(find(one(ev), 'us', 3).serve.errorRate).toBeNull();
  });

  it('ブロック得点: block_point と相手の被ブロックの blocker', () => {
    const ev = [
      start('us'),
      rally('block_point', 'us', 3, 'us'),
      rally('spike_blocked', 'them', 14, 'us', { blocker: 3 }),
      rally('spike_blocked', 'us', 4, 'them', { blocker: 12 }),
    ];
    const r = one(ev);
    expect(find(r, 'us', 3).blockPoints).toBe(2);
    expect(find(r, 'them', 12).blockPoints).toBe(1);
    expect(find(r, 'them', 14).spike.blocked).toBe(1);
  });

  it('レセプション集計', () => {
    const ev = [start('them'), rally('other_point', null, null, 'us'), rally('other_point', null, null, 'us')];
    const rid = ev[1].id;
    const rec: Reception[] = [
      { rallyId: rid, receiver: 5, grade: 'A' },
      { rallyId: rid, receiver: 5, grade: 'B' },
      { rallyId: rid, receiver: 5, grade: 'C' },
      { rallyId: rid, receiver: 5, grade: 'D' },
      { rallyId: rid, receiver: null, grade: 'A' },
    ];
    const p = find(one(ev, rec), 'us', 5);
    expect(p.reception).toEqual({ total: 4, A: 1, B: 1, C: 1, D: 1, passRate: 0.5, perfectRate: 0.25 });
  });

  it('レセプションなしは null 率', () => {
    const p = find(one([start('us'), rally('serve_ace', 'us', 1, 'us')]), 'us', 1);
    expect(p.reception.total).toBe(0);
    expect(p.reception.passRate).toBeNull();
    expect(p.reception.perfectRate).toBeNull();
  });

  it('並び順: us 先、背番号昇順', () => {
    const ev = [start('us'), rally('block_point', 'them', 12, 'them'), rally('spike_kill', 'us', 9, 'us'), rally('spike_kill', 'us', 4, 'us'), rally('spike_kill', 'them', 11, 'them')];
    const r = one(ev);
    expect(r.map((p) => `${p.side}${p.no}`)).toEqual(['us1', 'us2', 'us4', 'us9', 'them11', 'them12']); // us2 はサイドアウト後のサーバーとして行が出る;
  });

  it('セットフィルタ', () => {
    const ev = [
      start('them', 1),
      rally('spike_kill', 'us', 4, 'us', { set: 1 }),
      start('them', 2),
      rally('spike_kill', 'us', 4, 'us', { set: 2 }),
      rally('spike_kill', 'us', 4, 'us', { set: 2 }),
    ];
    const rec: Reception[] = [{ rallyId: ev[1].id, receiver: 5, grade: 'A' }, { rallyId: ev[3].id, receiver: 5, grade: 'D' }];
    const r2 = one(ev, rec, 2);
    expect(find(r2, 'us', 4).spike.kills).toBe(2);
    expect(find(r2, 'us', 5).reception).toMatchObject({ total: 1, D: 1, A: 0 });
    const r1 = one(ev, rec, 1);
    expect(find(r1, 'us', 4).spike.kills).toBe(1);
    expect(find(r1, 'us', 5).reception.A).toBe(1);
  });

  it('複数試合の通算', () => {
    n = 0;
    const m1: MatchData = { cfg, events: [start('us', 1, 'x'), rally('serve_ace', 'us', 1, 'us', { idp: 'x' }), rally('spike_kill', 'us', 4, 'us', { idp: 'x' })], receptions: [] };
    n = 0;
    const m2: MatchData = { cfg, events: [start('us', 1, 'y'), rally('serve_error', 'us', 1, 'them', { idp: 'y' })], receptions: [] };
    const r = playerStats([m1, m2]);
    const p = find(r, 'us', 1);
    expect(p.serve.total).toBe(3);
    expect(p.serve.aces).toBe(1);
    expect(p.serve.errors).toBe(1);
    expect(find(r, 'us', 4).spike.kills).toBe(1);
  });
});
