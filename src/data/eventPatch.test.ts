import { describe, it, expect } from 'vitest';
import type { MatchEvent } from '../core/types';
import { applyEventPatch, buildNextEvent, cloudEventId, eventId, lastEvent, maxSeq, randomSuffix, sortEvents } from './eventPatch';

const rally = (seq: number): MatchEvent => ({
  id: eventId(seq), seq, set: 1, at: 0, t: 'rally', side: 'us', player: 4, play: 'spike_kill', zone: 4, blocker: null, pointTo: 'us',
});
const attempt: MatchEvent = { id: eventId(2), seq: 2, set: 1, at: 0, t: 'attempt', side: 'us', player: 4, zone: 3 };
const timeout: MatchEvent = { id: eventId(3), seq: 3, set: 1, at: 0, t: 'timeout', side: 'us' };

describe('eventPatch', () => {
  it('maxSeq / eventId / buildNextEvent / lastEvent', () => {
    expect(maxSeq([])).toBe(0);
    expect(eventId(12)).toBe('0000000012');
    const list = [rally(3), rally(1), rally(7)];
    const ev = buildNextEvent(list, { t: 'timeout', side: 'them', set: 1 }, 123);
    expect(ev).toMatchObject({ seq: 8, id: '0000000008', at: 123, t: 'timeout' });
    expect(buildNextEvent([], { t: 'timeout', side: 'them', set: 1 }, 0).seq).toBe(1);
    expect(lastEvent(list)?.seq).toBe(7);
    expect(lastEvent([])).toBeNull();
  });

  it('cloudEventId / randomSuffix / sortEvents / 同じ seq の lastEvent', () => {
    expect(cloudEventId(12, 'abc12345')).toBe('0000000012-abc12345');
    expect(randomSuffix(() => 0)).toBe('aaaaaaaa');
    expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/);
    const a = { ...rally(5), id: cloudEventId(5, 'zzz') };
    const b = { ...rally(5), id: cloudEventId(5, 'aaa') };
    const c = { ...rally(10), id: cloudEventId(10, 'mmm') };
    const d = { ...rally(9), id: cloudEventId(9, 'zzz') };
    expect(sortEvents([c, a, d, b]).map((x) => x.id)).toEqual([b.id, a.id, d.id, c.id]);
    expect(lastEvent([a, b])).toBe(a);
    expect(lastEvent([c, a, d])).toBe(c);
    // 古いキャッシュで seq が重なっても id は別になる
    const ev = buildNextEvent([d], { t: 'timeout', side: 'us', set: 1 }, 0, (seq) => cloudEventId(seq, 'qqq'));
    expect(ev.id).toBe('0000000010-qqq');
    expect(ev.id).not.toBe(c.id);
  });

  it('rally: 得点↔ミス跨ぎは不可、同じ側の変更と zone は可、pointTo 不変、元は変えない', () => {
    const r = rally(1);
    expect(() => applyEventPatch(r, { play: 'spike_error' })).toThrow('点数が変わる修正はできません');
    const n = applyEventPatch(r, { play: 'serve_ace', zone: 2, player: undefined });
    expect(n).toMatchObject({ play: 'serve_ace', zone: 2, player: 4, pointTo: 'us' });
    expect(r).toMatchObject({ play: 'spike_kill', zone: 4 });
    expect(() => applyEventPatch(r, { pointTo: 'them' } as never)).toThrow('この項目は修正できません');
  });

  it('attempt は player/zone のみ、その他の種類は不可', () => {
    expect(applyEventPatch(attempt, { player: 9, zone: null })).toMatchObject({ player: 9, zone: null });
    expect(() => applyEventPatch(attempt, { play: 'spike_kill' } as never)).toThrow('この項目は修正できません');
    expect(() => applyEventPatch(timeout, { zone: 1 })).toThrow('このイベントは修正できません');
  });
});
