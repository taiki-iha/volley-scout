import { describe, it, expect } from 'vitest';
import type { MatchEvent, Reception } from '../core/types';
import type { ReceptionRow } from '../stats/opponent';
import { editContextLabel, editContexts, hitLabel, landZonePatch, mergeRows, nextUngradedRowId, playChangePatch, playChoices, receiverCandidates } from './reception.logic';

const row = (id: string, preset: ReceptionRow['preset'] = null): ReceptionRow => ({
  rallyId: id, set: 1, scoreBefore: { us: 0, them: 0 }, server: 3, usRotation: 1, preset,
});

describe('reception.logic', () => {
  it('mergeRows: 保存済みを優先し、なければ preset を初期値にする', () => {
    const saved: Reception[] = [{ rallyId: 'a', receiver: 5, grade: 'B' }];
    const m = mergeRows([row('a'), row('b', 'D'), row('c')], saved);
    expect(m[0]).toMatchObject({ receiver: 5, grade: 'B', saved: true });
    expect(m[1]).toMatchObject({ receiver: null, grade: 'D', saved: false });
    expect(m[2]).toMatchObject({ receiver: null, grade: null, saved: false });
  });
  it('nextUngradedRowId: 次の未入力行、末尾なら先頭へ戻り、全部済みなら null', () => {
    const saved: Reception[] = [{ rallyId: 'a', receiver: 1, grade: 'A' }, { rallyId: 'c', receiver: 2, grade: 'B' }];
    const m = mergeRows([row('a'), row('b'), row('c'), row('d')], saved);
    expect(nextUngradedRowId(m, 'a')).toBe('b');
    expect(nextUngradedRowId(m, 'c')).toBe('d');
    expect(nextUngradedRowId(m, 'd')).toBe('b');
    const all = mergeRows([row('a'), row('b')], [{ rallyId: 'a', receiver: 1, grade: 'A' }, { rallyId: 'b', receiver: null, grade: 'C' }]);
    expect(nextUngradedRowId(all, 'a')).toBeNull();
  });
  it('nextUngradedRowId: preset D で未保存の行は未完了として扱う', () => {
    const m = mergeRows([row('a'), row('b', 'D')], [{ rallyId: 'a', receiver: 1, grade: 'A' }]);
    expect(nextUngradedRowId(m, 'a')).toBe('b');
  });
  it('receiverCandidates は背番号順', () => {
    expect(receiverCandidates([9, 3, 12, 1, 7, 5])).toEqual([1, 3, 5, 7, 9, 12]);
  });
  it('playChoices: 得点系↔ミス系をまたぐものは不可', () => {
    const c = playChoices('spike_kill');
    expect(c.find((x) => x.play === 'serve_ace')?.allowed).toBe(true);
    expect(c.find((x) => x.play === 'spike_error')?.allowed).toBe(false);
    expect(playChoices('spike_error').find((x) => x.play === 'other_error')?.allowed).toBe(true);
  });
  it('playChangePatch: 不要な落下ゾーン・落下点・ブロッカーを消す', () => {
    const cur = { t: 'rally', play: 'spike_blocked', zone: null, land: null, blocker: 6 } as Extract<MatchEvent, { t: 'rally' }>;
    expect(playChangePatch(cur, 'spike_error')).toEqual({ play: 'spike_error', blocker: null });
    const kill = { t: 'rally', play: 'spike_kill', zone: 4, land: { x: 0.1, y: 0.2 }, blocker: null } as Extract<MatchEvent, { t: 'rally' }>;
    // スパイク決定 ↔ サービスエースは落下点を残す
    expect(playChangePatch(kill, 'serve_ace')).toEqual({ play: 'serve_ace' });
    expect(playChangePatch(kill, 'block_point')).toEqual({ play: 'block_point', zone: null, land: null });
    // 旧データ（land なし）でも落とさない
    const old = { t: 'rally', play: 'spike_kill', zone: 4, blocker: null } as unknown as Extract<MatchEvent, { t: 'rally' }>;
    expect(playChangePatch(old, 'other_point')).toEqual({ play: 'other_point', zone: null });
  });
  it('落下ゾーンを選び直すと落下点は消す', () => {
    expect(landZonePatch(2)).toEqual({ zone: 2, land: null });
    expect(landZonePatch(null)).toEqual({ zone: null, land: null });
  });
  it('打った位置の表示: スパイク系だけ、その時の並びから', () => {
    const lineup = [1, 2, 3, 4, 5, 6];
    expect(hitLabel('spike_kill', lineup, 4)).toBe('レフト');
    expect(hitLabel('spike_blocked', lineup, 2)).toBe('ライト');
    expect(hitLabel('spike_error', lineup, 6)).toBe('バック');
    expect(hitLabel('serve_ace', lineup, 1)).toBeNull();
    expect(hitLabel('spike_kill', lineup, 9)).toBeNull();
    expect(hitLabel('spike_kill', undefined, 4)).toBeNull();
  });
});

describe('editContexts（記録の修正画面の点数・サーバー）', () => {
  const cfg = { format: 'bestOf' as const, sets: 3, points: 25, finalSetPoints: 15 };
  let n = 0;
  const ev = (e: Record<string, unknown>): MatchEvent => { n++; return { id: `e${String(n).padStart(3, '0')}`, seq: n, at: n, set: 1, ...e } as MatchEvent; };
  const start = ev({ t: 'set_start', lineups: { us: [1, 2, 3, 4, 5, 6], them: [11, 12, 13, 14, 15, 16] }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe: 'us' });
  const r1 = ev({ t: 'rally', side: 'us', player: 1, play: 'serve_ace', zone: null, land: null, blocker: null, pointTo: 'us' });
  const a1 = ev({ t: 'attempt', side: 'us', player: 4, zone: 4 });
  const r2 = ev({ t: 'rally', side: 'them', player: 14, play: 'spike_kill', zone: 4, land: null, blocker: null, pointTo: 'them' });
  const a2 = ev({ t: 'attempt', side: 'us', player: 3, zone: 3 });
  const events = [start, r1, a1, r2, a2];

  it('rally はそのラリーの前の点数とサーバー', () => {
    const m = editContexts(cfg, events);
    expect(m.get(r1.id)).toEqual({ set: 1, score: { us: 0, them: 0 }, serving: 'us', server: 1 });
    expect(m.get(r2.id)).toEqual({ set: 1, score: { us: 1, them: 0 }, serving: 'us', server: 1 });
  });
  it('attempt は同じラリー（次の rally）の状況、まだラリー中なら今の状況', () => {
    const m = editContexts(cfg, events);
    expect(m.get(a1.id)).toEqual(m.get(r2.id));
    // r2 で相手がサイドアウト → 相手がローテして #12 がサーブ
    expect(m.get(a2.id)).toEqual({ set: 1, score: { us: 1, them: 1 }, serving: 'them', server: 12 });
    expect(m.has(start.id)).toBe(false);
  });
  it('表示は「自チーム-相手」の点数とサーバー', () => {
    expect(editContextLabel({ set: 1, score: { us: 12, them: 10 }, serving: 'them', server: 7 })).toBe('12-10 サーブ 相手 #7');
  });
});

