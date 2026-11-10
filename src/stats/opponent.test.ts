import { describe, it, expect } from 'vitest';
import { courseMarks, coursePlayers } from './course';
import { opponentScorers, receptionByOpponentServer, receptionRows } from './opponent';
import type { LandPoint, Lineup, MatchConfig, MatchEvent, PlayKind, Reception, Side, Zone } from '../core/types';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];
let n = 0;
const start = (firstServe: Side): MatchEvent => {
  n++;
  return { id: `s${n}`, seq: n, set: 1, at: n, t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe };
};
const rally = (play: PlayKind, side: Side | null, player: number | null, pointTo: Side, zone: Zone | null = null, land: LandPoint | null = null): MatchEvent => {
  n++;
  return { id: `r${n}`, seq: n, set: 1, at: n, t: 'rally', side, player, play, zone, land, blocker: null, pointTo };
};

describe('opponentScorers', () => {
  it('相手#14 の決定2本（落下ゾーン5）→ 打った位置レフト・落下ゾーン別、自チーム得点は含まない', () => {
    // 相手 [11..16]: #14 はポジション4（レフト）。相手が連続得点（サーブ権が相手のままならローテしない）
    const ev = [start('them'), rally('spike_kill', 'them', 14, 'them', 5), rally('spike_kill', 'them', 14, 'them', 5),
      rally('serve_ace', 'them', 11, 'them', 1), rally('spike_kill', 'us', 4, 'us', 4)];
    const r = opponentScorers([{ cfg, events: ev, receptions: [] }]);
    expect(r.map((x) => x.no)).toEqual([14, 11]);
    expect(r[0].points).toBe(2);
    expect(r[0].byHit).toEqual({ left: 2, center: 0, right: 0, back: 0 });
    expect(r[0].byLandZone[5]).toBe(2);
    expect(r[0].byPlay.spike_kill).toBe(2);
    // サービスエースは落下ゾーンだけ（打った位置には数えない）
    expect(r[1].byPlay.serve_ace).toBe(1);
    expect(r[1].byLandZone[1]).toBe(1);
    expect(r[1].byHit).toEqual({ left: 0, center: 0, right: 0, back: 0 });
  });
  it('v1.0 の記録（land の項目なし）の zone は落下ゾーンに数えない', () => {
    const s0 = start('them');
    const old = { ...rally('spike_kill', 'them', 14, 'them', 4) } as Record<string, unknown>;
    delete old.land;
    const r = opponentScorers([{ cfg, events: [s0, old as unknown as MatchEvent], receptions: [] }]);
    expect(r[0].points).toBe(1);
    expect(r[0].byHit.left).toBe(1);
    expect(Object.values(r[0].byLandZone).every((v) => v === 0)).toBe(true);
  });
  it('複数試合合算', () => {
    const m = () => ({ cfg, events: [start('us'), rally('spike_kill', 'them', 7, 'them', 4)], receptions: [] });
    expect(opponentScorers([m(), m()])[0].points).toBe(2);
  });
});

describe('courseMarks（コース図）', () => {
  it('落下点のある決定とエースだけ、打った位置とポジション付き、指定した側だけ', () => {
    const p = { x: 0.2, y: 0.8 };
    const ev = [start('us'),
      rally('serve_ace', 'us', 1, 'us', 5, p),            // 自チームのエース
      rally('spike_kill', 'us', 3, 'us', 6, p),           // #3 ポジション3 = センター
      rally('spike_kill', 'us', 4, 'us'),                 // 落下点なし → 描かない
      rally('spike_error', 'us', 4, 'them'),              // 決定以外は描かない
      rally('spike_kill', 'them', 13, 'them', 5, p)];     // 相手側
    const us = courseMarks([{ cfg, events: ev, receptions: [] }], 'us');
    expect(us).toEqual([
      { kind: 'ace', side: 'us', player: 1, land: p, hit: null, fromPos: null },
      { kind: 'kill', side: 'us', player: 3, land: p, hit: 'center', fromPos: 3 },
    ]);
    expect(coursePlayers(us)).toEqual([1, 3]);
    const them = courseMarks([{ cfg, events: ev, receptions: [] }], 'them');
    expect(them).toHaveLength(1);
    // 相手はサイドアウトでローテ済み [12,13,14,15,16,11] → #13 はポジション2 = ライト
    expect(them[0]).toMatchObject({ kind: 'kill', player: 13, hit: 'right', fromPos: 2 });
  });
  it('旧データ（land の項目なし）は描かない', () => {
    const old = { ...rally('spike_kill', 'us', 4, 'us', 4) } as Record<string, unknown>;
    delete old.land;
    expect(courseMarks([{ cfg, events: [start('us'), old as unknown as MatchEvent], receptions: [] }], 'us')).toEqual([]);
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
