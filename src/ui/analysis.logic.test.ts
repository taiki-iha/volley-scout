import { describe, expect, it } from 'vitest';
import type { Match } from '../core/types';
import { csvFileName, filterMatches, fmtPct, opponentLabel, playerRows, rotationRows } from './analysis.logic';

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
    expect(csvFileName('official', new Date(2026, 0, 5))).toBe('volley_公式戦_20260105.csv');
    expect(csvFileName('all', new Date(2026, 10, 9))).toBe('volley_すべて_20261109.csv');
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
      spike: { attempts: 0, kills: 0, errors: 0, blocked: 0, killRate: null, efficiency: null, killsByZone: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } },
      serve: { total: 0, aces: 0, errors: 0, errorRate: null }, blockPoints: 0,
      reception: { total: 0, A: 0, B: 0, C: 0, D: 0, passRate: null, perfectRate: null },
    } as const;
    const rows = playerRows([{ side: 'us', no: 3, ...base }, { side: 'them', no: 3, ...base }], [{ no: 3, name: '山田', position: 'OH' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 選手: '3 山田', 決定率: '-' });
  });
});
