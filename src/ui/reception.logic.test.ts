import { describe, it, expect } from 'vitest';
import type { MatchEvent, Reception } from '../core/types';
import type { ReceptionRow } from '../stats/opponent';
import { mergeRows, nextUngradedRowId, playChangePatch, playChoices, receiverCandidates } from './reception.logic';

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
  it('playChangePatch: 不要なゾーン・ブロッカーを消す', () => {
    const cur = { t: 'rally', play: 'spike_blocked', zone: 4, blocker: 6 } as Extract<MatchEvent, { t: 'rally' }>;
    expect(playChangePatch(cur, 'spike_error')).toEqual({ play: 'spike_error', blocker: null });
    expect(playChangePatch(cur, 'other_error')).toEqual({ play: 'other_error', zone: null, blocker: null });
  });
});
