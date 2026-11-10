import { describe, it, expect } from 'vitest';
import { replay } from './replay';
import { rotate } from './rotation';
import type { Lineup, MatchConfig, MatchEvent, Side } from './types';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];

type Partial_ = { [K in MatchEvent['t']]: Omit<Extract<MatchEvent, { t: K }>, 'id' | 'seq' | 'set' | 'at'> & { set?: number } }[MatchEvent['t']];
function ev(seq: number, partial: Partial_): MatchEvent {
  return { id: `e${seq}`, seq, set: 1, at: seq * 1000, ...partial } as MatchEvent;
}
function start(seq: number, firstServe: Side, set = 1): MatchEvent {
  return ev(seq, {
    t: 'set_start', set, lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 },
    liberos: { us: [10], them: [] }, firstServe,
  });
}
function rally(seq: number, pointTo: Side, set = 1): MatchEvent {
  return ev(seq, { t: 'rally', set, side: null, player: null, play: 'other_point', zone: null, land: null, blocker: null, pointTo });
}
// us 25 - them 23 で終わる rally 列（最後の1本で終了）
function to25_23(startSeq: number, set = 1): MatchEvent[] {
  const out: MatchEvent[] = [];
  let s = startSeq;
  for (let i = 0; i < 23; i++) { out.push(rally(s++, 'us', set)); out.push(rally(s++, 'them', set)); }
  out.push(rally(s++, 'us', set)); out.push(rally(s++, 'us', set));
  return out;
}

describe('replay', () => {
  it('イベントなし', () => {
    const st = replay(cfg, []);
    expect(st.current).toBeNull();
    expect(st.sets).toEqual([]);
    expect(st.setsWon).toEqual({ us: 0, them: 0 });
    expect(st.matchOver).toBe(false);
    expect(st.rallies).toEqual([]);
    expect(st.warnings).toEqual([]);
  });

  it('セット開始: firstServe 側がサーバー、ローテしない', () => {
    const st = replay(cfg, [start(1, 'them')]);
    const c = st.current!;
    expect(c.set).toBe(1);
    expect(c.serving).toBe('them');
    expect(c.lineups).toEqual({ us: US, them: THEM });
    expect(c.score).toEqual({ us: 0, them: 0 });
    expect(c.subsUsed).toEqual({ us: 0, them: 0 });
    expect(c.timeouts).toEqual({ us: 0, them: 0 });
    expect(c.over).toBe(false);
    expect(c.winner).toBeNull();
  });

  it('サイドアウト: 受け側が取るとローテして serving になる', () => {
    const st = replay(cfg, [start(1, 'us'), rally(2, 'them')]);
    const c = st.current!;
    expect(c.score).toEqual({ us: 0, them: 1 });
    expect(c.serving).toBe('them');
    expect(c.lineups.them).toEqual(rotate(THEM));
    expect(c.lineups.us).toEqual(US);
  });

  it('ブレイク: サーブ側が取るとローテなし', () => {
    const st = replay(cfg, [start(1, 'us'), rally(2, 'us')]);
    const c = st.current!;
    expect(c.score).toEqual({ us: 1, them: 0 });
    expect(c.serving).toBe('us');
    expect(c.lineups).toEqual({ us: US, them: THEM });
    expect(st.rallies[0].server).toBe(1);
  });

  it('25-23 でセット終了、その後の rally は無視', () => {
    const evs = [start(1, 'us'), ...to25_23(2)];
    const st = replay(cfg, [...evs, rally(100, 'them'), rally(101, 'them')]);
    const c = st.current!;
    expect(c.score).toEqual({ us: 25, them: 23 });
    expect(c.over).toBe(true);
    expect(c.winner).toBe('us');
    expect(st.setsWon).toEqual({ us: 1, them: 0 });
    expect(st.rallies.length).toBe(48);
    expect(st.matchOver).toBe(false);
    expect(st.warnings).toEqual([]);
  });

  it('2セット先取で matchOver、set_start ごとに SetState が増える', () => {
    const evs = [start(1, 'us', 1), ...to25_23(2, 1), start(200, 'them', 2), ...to25_23(201, 2)];
    const st = replay(cfg, evs);
    expect(st.sets.length).toBe(2);
    expect(st.sets[0].set).toBe(1);
    expect(st.current!.set).toBe(2);
    expect(st.setsWon).toEqual({ us: 2, them: 0 });
    expect(st.matchOver).toBe(true);
  });

  it('開始されていないセットのイベントは無視', () => {
    const st = replay(cfg, [start(1, 'us'), rally(2, 'us', 2)]);
    expect(st.current!.score).toEqual({ us: 0, them: 0 });
    expect(st.rallies).toEqual([]);
  });

  it('交代: セッター交代で setters 更新、7回目で警告', () => {
    const evs: MatchEvent[] = [start(1, 'us'), ev(2, { t: 'sub', side: 'us', out: 2, in: 7 })];
    let st = replay(cfg, evs);
    expect(st.current!.setters.us).toBe(7);
    expect(st.current!.lineups.us).toEqual([1, 7, 3, 4, 5, 6]);
    expect(st.current!.subsUsed.us).toBe(1);
    // 計6回
    for (let i = 0; i < 5; i++) {
      const [o, n] = i % 2 === 0 ? [7, 2] : [2, 7];
      evs.push(ev(3 + i, { t: 'sub', side: 'us', out: o, in: n }));
    }
    st = replay(cfg, evs);
    expect(st.current!.subsUsed.us).toBe(6);
    expect(st.warnings).toEqual([]);
    evs.push(ev(20, { t: 'sub', side: 'us', out: 3, in: 8 }));
    st = replay(cfg, evs);
    expect(st.current!.subsUsed.us).toBe(7);
    expect(st.warnings).toContain('自チームの交代が6回を超えています');
  });

  it('相手チームの交代超過警告', () => {
    const evs: MatchEvent[] = [start(1, 'us')];
    for (let i = 0; i < 7; i++) {
      const [o, n] = i % 2 === 0 ? [12, 17] : [17, 12];
      evs.push(ev(2 + i, { t: 'sub', side: 'them', out: o, in: n }));
    }
    const st = replay(cfg, evs);
    expect(st.current!.subsUsed.them).toBe(7);
    expect(st.warnings).toContain('相手チームの交代が6回を超えています');
  });

  it('リベロ入れ替えは subsUsed 不変、タイムアウトは加算、attempt は状態不変', () => {
    const base: MatchEvent[] = [start(1, 'us'), ev(2, { t: 'libero', side: 'us', out: 5, in: 10 })];
    const st = replay(cfg, [...base, ev(3, { t: 'timeout', side: 'them' })]);
    expect(st.current!.lineups.us).toEqual([1, 2, 3, 4, 10, 6]);
    expect(st.current!.subsUsed.us).toBe(0);
    expect(st.current!.timeouts).toEqual({ us: 0, them: 1 });
    const withAttempt = replay(cfg, [...base, ev(3, { t: 'attempt', side: 'us', player: 4, zone: 4 })]);
    expect(withAttempt).toEqual(replay(cfg, base));
  });

  it('リベロが3回のサイドアウトでポジション4に来たら警告', () => {
    // ポジション1の選手1にリベロ10が入る（ポジション1でもサーバー扱い）
    const evs: MatchEvent[] = [start(1, 'them'), ev(2, { t: 'libero', side: 'us', out: 1, in: 10 })];
    let seq = 3;
    evs.push(rally(seq++, 'us')); // 1回目サイドアウト → 10 はポジション6
    expect(replay(cfg, evs).warnings).toEqual([]);
    evs.push(rally(seq++, 'them'));
    evs.push(rally(seq++, 'us')); // 2回目 → ポジション5
    expect(replay(cfg, evs).warnings).toEqual([]);
    evs.push(rally(seq++, 'them'));
    evs.push(rally(seq++, 'us')); // 3回目 → ポジション4
    const st = replay(cfg, evs);
    expect(st.current!.lineups.us[3]).toBe(10);
    expect(st.warnings).toContain('リベロ #10 が前衛にいます');
  });

  it('ポジション1のリベロはサーバー', () => {
    const st = replay(cfg, [start(1, 'us'), ev(2, { t: 'libero', side: 'us', out: 1, in: 10 }), rally(3, 'us')]);
    expect(st.rallies[0].server).toBe(10);
    expect(st.warnings).toEqual([]);
  });

  it('復元: シャッフルしても結果が同一', () => {
    const evs: MatchEvent[] = [
      start(1, 'us'), rally(2, 'them'), ev(3, { t: 'sub', side: 'us', out: 2, in: 7 }),
      rally(4, 'us'), ev(5, { t: 'libero', side: 'us', out: 5, in: 10 }), ev(6, { t: 'timeout', side: 'us' }),
      rally(7, 'us'), rally(8, 'them'), rally(9, 'them'), ev(10, { t: 'attempt', side: 'us', player: 4, zone: 4 }),
      rally(11, 'us'),
    ];
    const shuffled = [evs[7], evs[2], evs[10], evs[0], evs[5], evs[9], evs[1], evs[8], evs[4], evs[3], evs[6]];
    const before = JSON.stringify(shuffled);
    expect(replay(cfg, shuffled)).toEqual(replay(cfg, evs));
    expect(JSON.stringify(shuffled)).toBe(before); // 入力を破壊しない
  });

  it('1つ戻す: セット終了直後から最後のイベントを削ると終了前に戻る', () => {
    const evs = [start(1, 'us'), ...to25_23(2)];
    expect(replay(cfg, evs).current!.over).toBe(true);
    const st = replay(cfg, evs.slice(0, -1));
    expect(st.current!.over).toBe(false);
    expect(st.current!.winner).toBeNull();
    expect(st.current!.score).toEqual({ us: 24, them: 23 });
    expect(st.setsWon).toEqual({ us: 0, them: 0 });
    expect(st.rallies.length).toBe(47);
  });

  it('rallies に得点前の状況が入る', () => {
    const st = replay(cfg, [start(1, 'us'), rally(2, 'us'), rally(3, 'them'), rally(4, 'them')]);
    expect(st.rallies.map((r) => r.eventId)).toEqual(['e2', 'e3', 'e4']);
    expect(st.rallies[0]).toEqual({
      eventId: 'e2', set: 1, serving: 'us', server: 1, usRotation: 2, themRotation: 1,
      usLineup: US, themLineup: THEM, scoreBefore: { us: 0, them: 0 },
    });
    expect(st.rallies[1].serving).toBe('us');
    expect(st.rallies[1].scoreBefore).toEqual({ us: 1, them: 0 });
    // rally 3 で them サイドアウト → them がローテ、サーバーは 12
    expect(st.rallies[2].serving).toBe('them');
    expect(st.rallies[2].server).toBe(12);
    expect(st.rallies[2].themRotation).toBe(6);
    expect(st.rallies[2].scoreBefore).toEqual({ us: 1, them: 1 });
  });
});
