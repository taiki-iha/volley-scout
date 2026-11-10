import { describe, expect, it } from 'vitest';
import type { Match, MatchEvent } from '../core/types';
import { HIT_COLOR, courseShapes, csvFileName, filterMatches, fmtPct, opponentLabel, opponentLineupRows, playerRows, rotationRows, scorerRows } from './analysis.logic';

const cfg = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 } as const;
const mk = (id: string, date: string, kind: Match['kind'], opponentId = 'o1'): Match =>
  ({ id, date, kind, opponentId, tournament: '', config: cfg, createdAt: 0 });

describe('fmtPct', () => {
  it('小数1桁、null は -', () => {
    expect(fmtPct(0.5)).toBe('50.0%');
    expect(fmtPct(1 / 3)).toBe('33.3%');
    expect(fmtPct(0)).toBe('0.0%');
    expect(fmtPct(null)).toBe('-');
  });
});

describe('filterMatches', () => {
  const ms = [mk('a', '2026-11-01', 'practice'), mk('b', '2026-11-05', 'official'), mk('c', '2026-11-10', 'official', 'o2')];
  it('期間は両端を含む', () => {
    expect(filterMatches(ms, { from: '2026-11-01', to: '2026-11-05', kind: 'all' }).map((m) => m.id)).toEqual(['b', 'a']);
  });
  it('種別と相手で絞る', () => {
    expect(filterMatches(ms, { from: '', to: '', kind: 'official' }).map((m) => m.id)).toEqual(['c', 'b']);
    expect(filterMatches(ms, { from: '', to: '', kind: 'all', opponentId: 'o2' }).map((m) => m.id)).toEqual(['c']);
  });
});

describe('csvFileName', () => {
  it('種類と日付', () => {
    expect(csvFileName('選手別', new Date(2026, 0, 5))).toBe('volley_選手別_20260105.csv');
    expect(csvFileName('相手サーバー別', new Date(2026, 10, 9))).toBe('volley_相手サーバー別_20261109.csv');
  });
});

describe('rows', () => {
  it('相手選手の名前は登録があれば表示', () => {
    const t = { id: 'o1', name: 'X', players: [{ no: 7, name: '田中', position: null }, { no: 8, name: '', position: null }] };
    expect(opponentLabel(7, t)).toBe('7 田中');
    expect(opponentLabel(8, t)).toBe('8');
    expect(opponentLabel(9, undefined)).toBe('9');
  });
  it('ローテ行', () => {
    const r = rotationRows([{ rotation: 1, pointsWon: 3, pointsLost: 1, receiveRallies: 2, sideouts: 1, sideoutRate: 0.5, serveRallies: 2, breaks: 2, breakRate: 1 }]);
    expect(r[0]).toMatchObject({ ローテ: 'S1', サイドアウト率: '50.0%', ブレイク率: '100.0%' });
  });
  it('選手行は自チームのみ・名前付き', () => {
    const base = {
      spike: { attempts: 0, kills: 0, errors: 0, blocked: 0, killRate: null, efficiency: null, killsByHit: { left: 0, center: 0, right: 0, back: 0 } },
      serve: { total: 0, aces: 0, errors: 0, errorRate: null }, blockPoints: 0,
      reception: { total: 0, A: 0, B: 0, C: 0, D: 0, passRate: null, perfectRate: null },
    } as const;
    const rows = playerRows([{ side: 'us', no: 3, ...base }, { side: 'them', no: 3, ...base }], [{ no: 3, name: '山田', position: 'OH' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 選手: '3 山田', 決定率: '-' });
  });
  it('選手行に打った位置別の決定数（決定レフト〜バック）が効果率の後に並ぶ', () => {
    const s = {
      side: 'us' as const, no: 4,
      spike: { attempts: 5, kills: 3, errors: 1, blocked: 0, killRate: 0.6, efficiency: 0.4, killsByHit: { left: 2, center: 0, right: 0, back: 1 } },
      serve: { total: 0, aces: 0, errors: 0, errorRate: null }, blockPoints: 0,
      reception: { total: 0, A: 0, B: 0, C: 0, D: 0, passRate: null, perfectRate: null },
    };
    const row = playerRows([s], [])[0];
    expect(row).toMatchObject({ 決定レフト: 2, 決定センター: 0, 決定ライト: 0, 決定バック: 1 });
    const keys = Object.keys(row);
    expect(keys.slice(keys.indexOf('効果率') + 1, keys.indexOf('効果率') + 5)).toEqual(['決定レフト', '決定センター', '決定ライト', '決定バック']);
    expect(keys.some((k) => k.startsWith('決定ゾーン'))).toBe(false);
  });
});

describe('opponentLineupRows', () => {
  const team = { id: 'o1', name: 'X', players: [{ no: 11, name: '佐藤', position: 'S' as const }, { no: 20, name: '', position: 'L' as const }] };
  const ss = (seq: number, set: number, themSetter: number | null, them = [11, 12, 13, 14, 15, 16]): MatchEvent => ({
    id: `s${seq}`, seq, set, at: seq, t: 'set_start',
    lineups: { us: [1, 2, 3, 4, 5, 6], them: them as [number, number, number, number, number, number] },
    setters: { us: 2, them: themSetter }, liberos: { us: [], them: themSetter === null ? [] : [20] }, firstServe: 'us',
  });
  it('試合×セットごとにポジション1〜6・セッター・リベロ・開始ローテ', () => {
    const rows = opponentLineupRows([
      { match: mk('b', '2026-11-05', 'official'), events: [ss(1, 1, 13), ss(5, 2, null, [21, 22, 23, 24, 25, 26])] },
      { match: mk('a', '2026-11-01', 'practice'), events: [ss(1, 1, 11)] },
    ], team);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      日付: '2026-11-05', セット: 1, ポジション1: '11 佐藤', ポジション2: '12', ポジション3: '13', ポジション4: '14', ポジション5: '15', ポジション6: '16',
      セッター: '13', リベロ: '20', 開始ローテ: 'S3',
    });
    expect(rows[1]).toMatchObject({ 日付: '2026-11-05', セット: 2, ポジション1: '21', セッター: '不明', リベロ: 'なし', 開始ローテ: 'R1' });
    expect(rows[2]).toMatchObject({ 日付: '2026-11-01', セット: 1, セッター: '11 佐藤', 開始ローテ: 'S1' });
  });
  it('セット順に並べ、同じセットの set_start が複数あれば最後のもの', () => {
    const rows = opponentLineupRows([{ match: mk('a', '2026-11-01', 'practice'), events: [ss(9, 2, 11), ss(1, 1, 11), ss(3, 1, 12)] }], team);
    expect(rows.map((r) => [r.セット, r.開始ローテ])).toEqual([[1, 'S2'], [2, 'S1']]);
  });
});


describe('相手得点の表（打った位置別・落下ゾーン別）', () => {
  it('選手・得点・決定レフト〜バック・落下ゾーン1〜6 の順', () => {
    const rows = scorerRows([{
      no: 7, points: 4, byHit: { left: 2, center: 0, right: 1, back: 0 },
      byLandZone: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 2, 6: 0 }, byPlay: { spike_kill: 3, serve_ace: 1 },
    }], undefined);
    expect(Object.keys(rows[0])).toEqual([
      '選手', '得点', '決定レフト', '決定センター', '決定ライト', '決定バック',
      '落下ゾーン1', '落下ゾーン2', '落下ゾーン3', '落下ゾーン4', '落下ゾーン5', '落下ゾーン6',
    ]);
    expect(rows[0]).toMatchObject({ 選手: '7', 得点: 4, 決定レフト: 2, 決定ライト: 1, 落下ゾーン1: 1, 落下ゾーン5: 2 });
  });
});

describe('courseShapes（コース図の座標）', () => {
  // 自チーム #4 がレフト（ポジション4）から、相手コートの守る側から見て左後ろ（ゾーン5付近）へ
  const kill = { kind: 'kill' as const, side: 'us' as const, player: 4, land: { x: 0.1, y: 0.9 }, hit: 'left' as const, fromPos: 4 };
  const ace = { kind: 'ace' as const, side: 'us' as const, player: 1, land: { x: 0.5, y: 0.5 }, hit: null, fromPos: null };
  it('落下点は相手コート（左半分）、始点は自チームコートのネット寄り、色は打った位置', () => {
    const [s] = courseShapes([kill], null);
    // 相手コートで相手の左後ろ = 画面の左上（ネットから遠く、上側）
    expect(s.to.x).toBeCloseTo(0.9);
    expect(s.to.y).toBeCloseTo(0.9);
    // 自チームのレフト（ポジション4）= 画面の自チームコートの下側、ネット寄り
    expect(s.from!.x).toBeGreaterThan(9);
    expect(s.from!.x).toBeLessThan(12);
    expect(s.from!.y).toBeGreaterThan(6);
    expect(s.color).toBe(HIT_COLOR.left);
  });
  it('エースは矢印なし、選手で絞り込める', () => {
    expect(courseShapes([kill, ace], 1)).toEqual([{ kind: 'ace', player: 1, to: { x: 4.5, y: 4.5 }, from: null, color: '#c0392b' }]);
    expect(courseShapes([kill, ace], null)).toHaveLength(2);
  });
  it('相手の決定は自チームコート（右半分）に落ちる', () => {
    const [s] = courseShapes([{ ...kill, side: 'them' }], null);
    expect(s.to.x).toBeGreaterThan(9);
    expect(s.from!.x).toBeLessThan(9);
  });
});
