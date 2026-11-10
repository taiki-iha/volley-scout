import { describe, it, expect } from 'vitest';
import { replay } from '../core/replay';
import type { Lineup, MatchConfig, MatchEvent, Side } from '../core/types';
import { scoreFlow } from './scoreFlow.logic';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];

let seq = 0;
const base = (set: number) => { seq++; return { id: `e${seq}`, seq, set, at: seq * 1000 }; };
const start = (set = 1, firstServe: Side = 'us'): MatchEvent => ({
  ...base(set), t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [10], them: [] }, firstServe,
});
const rally = (pointTo: Side, set = 1): MatchEvent => ({
  ...base(set), t: 'rally', side: null, player: null, play: 'other_point', zone: null, land: null, blocker: null, pointTo,
});
const timeout = (side: Side, set = 1): MatchEvent => ({ ...base(set), t: 'timeout', side });
const sub = (side: Side, out: number, inn: number, set = 1): MatchEvent => ({ ...base(set), t: 'sub', side, out, in: inn });
const libero = (side: Side, out: number, inn: number, set = 1): MatchEvent => ({ ...base(set), t: 'libero', side, out, in: inn });
const rallies = (pts: string, set = 1): MatchEvent[] => [...pts].map((c) => rally(c === 'u' ? 'us' : 'them', set));
const cells = (f: ReturnType<typeof scoreFlow>[number]) => f.columns.map((c) => [c.us, c.them]);

describe('scoreFlow', () => {
  it('イベントなし・セット開始のみ', () => {
    expect(scoreFlow(cfg, [])).toEqual([]);
    const f = scoreFlow(cfg, [start()]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ set: 1, columns: [], markers: [], score: { us: 0, them: 0 }, over: false, winner: null });
  });

  it('取った側の段にその時点の得点が入り、もう一方は空', () => {
    const f = scoreFlow(cfg, [start(), ...rallies('tututtt')])[0];
    expect(cells(f)).toEqual([[null, 1], [1, null], [null, 2], [2, null], [null, 3], [null, 4], [null, 5]]);
    expect(f.score).toEqual({ us: 2, them: 5 });
  });

  it('2点以上の連続得点だけ runOf が付く', () => {
    const f = scoreFlow(cfg, [start(), ...rallies('tuuutut')])[0];
    expect(f.columns.map((c) => c.runOf)).toEqual([null, 'us', 'us', 'us', null, null, null]);
    const g = scoreFlow(cfg, [start(), ...rallies('uutt')])[0];
    expect(g.columns.map((c) => c.runOf)).toEqual(['us', 'us', 'them', 'them']);
  });

  it('タイムアウト・交代はその時点の列位置に入り、リベロは入らない', () => {
    const f = scoreFlow(cfg, [
      start(), timeout('them'), rally('us'), rally('us'), timeout('them'), libero('us', 5, 10), sub('us', 3, 7), rally('them'),
    ])[0];
    expect(f.markers).toEqual([
      { afterColumn: 0, kind: 'timeout', side: 'them' },
      { afterColumn: 2, kind: 'timeout', side: 'them' },
      { afterColumn: 2, kind: 'sub', side: 'us' },
    ]);
  });

  it('複数セット: セットごとに分かれ、終了・勝者・最終得点が replay と一致', () => {
    const evs = [start(1), ...rallies('u'.repeat(25), 1), start(2, 'them'), ...rallies('ttu', 2)];
    const f = scoreFlow(cfg, evs);
    const st = replay(cfg, evs);
    expect(f.map((s) => s.set)).toEqual([1, 2]);
    expect(f[0]).toMatchObject({ over: true, winner: 'us', score: { us: 25, them: 0 } });
    expect(f[0].columns).toHaveLength(25);
    expect(f[1]).toMatchObject({ over: false, winner: null, score: { us: 1, them: 2 } });
    expect(f.map((s) => s.score)).toEqual(st.sets.map((s) => s.score));
  });

  it('セット終了後のラリー・TO・交代は数えない', () => {
    const f = scoreFlow(cfg, [start(1), ...rallies('u'.repeat(25), 1), rally('them'), timeout('us'), sub('us', 3, 7)])[0];
    expect(f.columns).toHaveLength(25);
    expect(f.markers).toEqual([]);
    expect(f.score).toEqual({ us: 25, them: 0 });
  });

  it('1つ戻す（イベントが減る）と列も減る', () => {
    const evs = [start(), ...rallies('uut'), timeout('us')];
    expect(scoreFlow(cfg, evs)[0].markers).toHaveLength(1);
    const less = evs.slice(0, -1);
    expect(scoreFlow(cfg, less)[0].markers).toHaveLength(0);
    const fewer = less.slice(0, -1);
    const f = scoreFlow(cfg, fewer)[0];
    expect(cells(f)).toEqual([[1, null], [2, null]]);
    expect(f.columns.map((c) => c.runOf)).toEqual(['us', 'us']);
  });

  it('seq 順に並べてから数える（届いた順に依存しない）', () => {
    const evs = [start(), ...rallies('tu'), timeout('us'), rally('us')];
    const f = scoreFlow(cfg, [...evs].reverse())[0];
    expect(cells(f)).toEqual([[null, 1], [1, null], [2, null]]);
    expect(f.markers).toEqual([{ afterColumn: 2, kind: 'timeout', side: 'us' }]);
  });

  it('セット開始のないセットのイベントは無視', () => {
    expect(scoreFlow(cfg, [rally('us', 1), timeout('us', 1)])).toEqual([]);
  });
});
