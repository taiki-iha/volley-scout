import { describe, it, expect } from 'vitest';
import type { Lineup, MatchConfig, MatchEvent, Side } from '../core/types';
import { scoreFlow } from './scoreFlow.logic';
import {
  activeTimeout, countdownAt, formatCountdown, formatElapsed, formatTimeOfDay, liveClock, matchSpanMs, setDurationMs, setTimeRows,
  shouldAlertEnd, timeoutCountdown,
} from './timing.logic';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];
const T0 = 1_700_000_000_000;
const S = 1000;
const MIN = 60 * S;

let seq = 0;
const base = (set: number, at: number) => { seq++; return { id: `e${String(seq).padStart(4, '0')}`, seq, set, at }; };
const start = (at: number, set = 1, firstServe: Side = 'us'): MatchEvent => ({
  ...base(set, at), t: 'set_start', lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [], them: [] }, firstServe,
});
const rally = (at: number, pointTo: Side, set = 1): MatchEvent => ({
  ...base(set, at), t: 'rally', side: null, player: null, play: 'other_point', zone: null, land: null, blocker: null, pointTo,
});
const timeout = (at: number, side: Side, set = 1): MatchEvent => ({ ...base(set, at), t: 'timeout', side });
const sub = (at: number, side: Side, set = 1): MatchEvent => ({ ...base(set, at), t: 'sub', side, out: 3, in: 7 });
const attempt = (at: number, set = 1): MatchEvent => ({ ...base(set, at), t: 'attempt', side: 'us', player: 4, zone: null });
/** 25-0 のセット。開始 at0、1点ごとに step ミリ秒 */
const set25 = (at0: number, step: number, set = 1): MatchEvent[] =>
  [start(at0, set), ...Array.from({ length: 25 }, (_, i) => rally(at0 + (i + 1) * step, 'us', set))];

describe('formatElapsed / formatCountdown', () => {
  it('1時間未満は mm:ss、以上は h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59_999)).toBe('00:59');
    expect(formatElapsed(65 * S)).toBe('01:05');
    expect(formatElapsed(59 * MIN + 59 * S)).toBe('59:59');
    expect(formatElapsed(60 * MIN)).toBe('1:00:00');
    expect(formatElapsed(83 * MIN + 7 * S)).toBe('1:23:07');
  });
  it('負の値（時計のずれ）は 0', () => {
    expect(formatElapsed(-5000)).toBe('00:00');
  });
  it('カウントダウンは m:ss（端数は切り上げ）', () => {
    expect(formatCountdown(30)).toBe('0:30');
    expect(formatCountdown(9.2)).toBe('0:10');
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-3)).toBe('0:00');
  });
  it('時刻は HH:MM', () => {
    const d = new Date(2026, 10, 10, 9, 5, 40);
    expect(formatTimeOfDay(d.getTime())).toBe('09:05');
  });
});

describe('得点経過の時刻・目盛り', () => {
  it('列に記録時刻、セットに開始と最後のラリーの時刻', () => {
    const f = scoreFlow(cfg, [start(T0), rally(T0 + 20 * S, 'us'), rally(T0 + 50 * S, 'them')])[0];
    expect(f.startAt).toBe(T0);
    expect(f.lastAt).toBe(T0 + 50 * S);
    expect(f.columns.map((c) => c.at)).toEqual([T0 + 20 * S, T0 + 50 * S]);
  });
  it('5分ごとの区切りを過ぎて最初のラリーに目盛り', () => {
    const ats = [1, 4.9, 5, 6, 9.99, 10.5, 11, 14, 15.2].map((m) => T0 + m * MIN);
    const f = scoreFlow(cfg, [start(T0), ...ats.map((a) => rally(a, 'us'))])[0];
    expect(f.columns.map((c) => c.tick)).toEqual([null, null, 5, null, null, 10, null, null, 15]);
  });
  it('長い中断で区切りを2つ以上越えたら、大きい方だけ', () => {
    const f = scoreFlow(cfg, [start(T0), rally(T0 + 2 * MIN, 'us'), rally(T0 + 12 * MIN, 'us'), rally(T0 + 16 * MIN, 'them')])[0];
    expect(f.columns.map((c) => c.tick)).toEqual([null, 10, 15]);
  });
  it('セット開始より前の時刻（時計のずれ）でも目盛りは付かない', () => {
    const f = scoreFlow(cfg, [start(T0), rally(T0 - 10 * S, 'us')])[0];
    expect(f.columns[0].tick).toBeNull();
  });
  it('セット終了後のラリーは最後のラリーの時刻に入れない', () => {
    const evs = [...set25(T0, 30 * S), rally(T0 + 99 * MIN, 'them')];
    const f = scoreFlow(cfg, evs)[0];
    expect(f.lastAt).toBe(T0 + 25 * 30 * S);
  });
});

describe('セット・試合の時間', () => {
  it('セットの時間 = 開始 → 最後のラリー。ラリーなしは null', () => {
    const flows = scoreFlow(cfg, [...set25(T0, 60 * S), start(T0 + 30 * MIN, 2)]);
    expect(setDurationMs(flows[0])).toBe(25 * MIN);
    expect(setDurationMs(flows[1])).toBeNull();
  });
  it('試合全体 = 最初の開始 → 最後のラリー（セット間を含む）', () => {
    const flows = scoreFlow(cfg, [...set25(T0, 60 * S), ...set25(T0 + 30 * MIN, 40 * S, 2)]);
    expect(matchSpanMs(flows)).toBe(30 * MIN + 25 * 40 * S);
    expect(matchSpanMs([])).toBeNull();
    expect(matchSpanMs(scoreFlow(cfg, [start(T0)]))).toBeNull();
  });
  it('表: セットごとの行と試合全体の行', () => {
    const flows = scoreFlow(cfg, [...set25(T0, 60 * S), start(T0 + 30 * MIN, 2), rally(T0 + 31 * MIN, 'them', 2)]);
    const rows = setTimeRows(flows);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ セット: '第1セット', 得点: '25-0', 開始: formatTimeOfDay(T0), 時間: '25:00', 状態: '終了' });
    expect(rows[1]).toEqual({ セット: '第2セット', 得点: '0-1', 開始: formatTimeOfDay(T0 + 30 * MIN), 時間: '01:00', 状態: '途中' });
    expect(rows[2]).toMatchObject({ セット: '試合全体（セット間を含む）', 時間: '31:00' });
    expect(setTimeRows([])).toEqual([]);
  });
});

describe('liveClock（入力・閲覧画面の経過時間）', () => {
  it('セットがなければ null', () => {
    expect(liveClock([], false, T0)).toBeNull();
  });
  it('セット進行中はどちらも now から数える', () => {
    const flows = scoreFlow(cfg, [start(T0), rally(T0 + MIN, 'us')]);
    expect(liveClock(flows, false, T0 + 3 * MIN + 4 * S)).toEqual({
      set: { ms: 3 * MIN + 4 * S, running: true }, match: { ms: 3 * MIN + 4 * S, running: true },
    });
  });
  it('セットが終わったらセットの時間は最後のラリーで止まり、試合は進み続ける', () => {
    const flows = scoreFlow(cfg, set25(T0, 60 * S));
    expect(liveClock(flows, false, T0 + 40 * MIN)).toEqual({
      set: { ms: 25 * MIN, running: false }, match: { ms: 40 * MIN, running: true },
    });
  });
  it('次のセットが始まったらセットは新しい開始から', () => {
    const flows = scoreFlow(cfg, [...set25(T0, 60 * S), start(T0 + 30 * MIN, 2)]);
    expect(liveClock(flows, false, T0 + 32 * MIN)).toEqual({
      set: { ms: 2 * MIN, running: true }, match: { ms: 32 * MIN, running: true },
    });
  });
  it('試合が終わったら試合の時間も最後のラリーで止まる', () => {
    const flows = scoreFlow(cfg, [...set25(T0, 60 * S), ...set25(T0 + 30 * MIN, 60 * S, 2)]);
    expect(liveClock(flows, true, T0 + 5 * 60 * MIN)).toEqual({
      set: { ms: 25 * MIN, running: false }, match: { ms: 55 * MIN, running: false },
    });
  });
  it('時計のずれで now が開始より前でも 0', () => {
    const flows = scoreFlow(cfg, [start(T0)]);
    expect(liveClock(flows, false, T0 - 5000)).toEqual({ set: { ms: 0, running: true }, match: { ms: 0, running: true } });
  });
});

describe('timeoutCountdown', () => {
  const at = T0 + 5 * MIN;
  const evs = () => [start(T0), rally(T0 + MIN, 'us'), timeout(at, 'them')];

  it('タイムアウトがなければ null', () => {
    expect(timeoutCountdown([start(T0), rally(T0 + MIN, 'us')], at, 30)).toBeNull();
    expect(timeoutCountdown([], at, 30)).toBeNull();
  });
  it('記録時刻から数える（再読み込み・別端末でも同じ残り）', () => {
    const e = evs();
    expect(timeoutCountdown(e, at, 30)).toMatchObject({ side: 'them', nth: 1, phase: 'running', remainingSec: 30, warn: false });
    expect(timeoutCountdown(e, at + 12_300, 30)).toMatchObject({ phase: 'running', remainingSec: 18, warn: false });
    expect(timeoutCountdown(e, at + 20_000, 30)).toMatchObject({ remainingSec: 10, warn: true });
    expect(timeoutCountdown(e, at + 29_001, 30)).toMatchObject({ remainingSec: 1, warn: true });
  });
  it('0 になったら ended を数秒出して、その後は null', () => {
    const e = evs();
    expect(timeoutCountdown(e, at + 30_000, 30)).toMatchObject({ phase: 'ended', remainingSec: 0 });
    expect(timeoutCountdown(e, at + 34_999, 30)).toMatchObject({ phase: 'ended' });
    expect(timeoutCountdown(e, at + 35_000, 30)).toBeNull();
    expect(timeoutCountdown(e, at + 31_000, 30, 0)).toBeNull();
  });
  it('長さの設定を使う', () => {
    expect(timeoutCountdown(evs(), at + 50_000, 60)).toMatchObject({ phase: 'running', remainingSec: 10 });
  });
  it('id はタイムアウトのイベント', () => {
    const e = evs();
    expect(timeoutCountdown(e, at, 30)!.id).toBe(e[2].id);
  });
  it('次のラリー・セット開始で消える。交代では消えない', () => {
    expect(timeoutCountdown([...evs(), rally(at + 5 * S, 'us')], at + 6 * S, 30)).toBeNull();
    expect(timeoutCountdown([...evs(), start(at + 5 * S, 2)], at + 6 * S, 30)).toBeNull();
    expect(timeoutCountdown([...evs(), sub(at + 5 * S, 'us')], at + 6 * S, 30)).toMatchObject({ phase: 'running', remainingSec: 24 });
  });
  it('1つ戻す（タイムアウトのイベントが消える）とカウントダウンも消える', () => {
    const e = evs();
    expect(timeoutCountdown(e.slice(0, -1), at + S, 30)).toBeNull();
  });
  it('両チームが続けたら新しい方', () => {
    const e = [...evs(), timeout(at + 10 * S, 'us')];
    expect(timeoutCountdown(e, at + 11 * S, 30)).toMatchObject({ side: 'us', nth: 1, remainingSec: 29 });
  });
  it('何回目か: そのセットの同じチームの回数（3回目も数える）', () => {
    const e = [start(T0), timeout(T0 + S, 'us'), rally(T0 + MIN, 'us'), timeout(T0 + 2 * MIN, 'them'), rally(T0 + 3 * MIN, 'us'),
      timeout(T0 + 4 * MIN, 'us'), rally(T0 + 5 * MIN, 'us'), timeout(T0 + 6 * MIN, 'us')];
    expect(timeoutCountdown(e, T0 + 6 * MIN, 30)).toMatchObject({ side: 'us', nth: 3 });
    expect(timeoutCountdown(e.slice(0, 6), T0 + 4 * MIN, 30)).toMatchObject({ side: 'us', nth: 2 });
  });
  it('前のセットの回数は数えない', () => {
    const e = [start(T0), timeout(T0 + S, 'us'), timeout(T0 + 2 * S, 'us'), ...set25(T0 + MIN, S).slice(1),
      start(T0 + 10 * MIN, 2), timeout(T0 + 11 * MIN, 'us', 2)];
    expect(timeoutCountdown(e, T0 + 11 * MIN, 30)).toMatchObject({ nth: 1 });
  });
  it('seq 順に並べてから判断する（届いた順に依存しない）', () => {
    const e = evs();
    expect(timeoutCountdown([...e].reverse(), at, 30)).toMatchObject({ side: 'them', phase: 'running' });
  });
  it('時計のずれで now が記録より前なら満タン', () => {
    expect(timeoutCountdown(evs(), at - 3000, 30)).toMatchObject({ remainingSec: 30 });
  });
  it('スパイク（継続）の記録でもプレー再開とみなして消える', () => {
    expect(timeoutCountdown([...evs(), attempt(at + 5 * S)], at + 6 * S, 30)).toBeNull();
  });
});

describe('activeTimeout / countdownAt / shouldAlertEnd', () => {
  const at = T0 + MIN;
  const e = () => [start(T0), timeout(at, 'us')];

  it('activeTimeout は時刻によらない対象、countdownAt が時刻で表示を決める', () => {
    const a = activeTimeout(e());
    expect(a).toMatchObject({ side: 'us', nth: 1, at });
    expect(countdownAt(a, at + 21 * S, 30)).toMatchObject({ phase: 'running', remainingSec: 9, warn: true });
    expect(countdownAt(a, at + 30 * S, 30)).toMatchObject({ phase: 'ended' });
    expect(countdownAt(a, at + 40 * S, 30)).toBeNull();
    expect(countdownAt(null, at, 30)).toBeNull();
  });
  it('running を見ていて 0 を過ぎた直後だけ鳴らす', () => {
    const a = activeTimeout(e())!;
    const running = { id: a.id, phase: 'running' as const };
    expect(shouldAlertEnd(running, a, at + 30 * S, 30)).toBe(true);
    expect(shouldAlertEnd(running, a, at + 35 * S, 30)).toBe(true);
    expect(shouldAlertEnd(running, a, at + 29 * S, 30)).toBe(false);   // まだ 0 になっていない
  });
  it('5秒より遅れて気づいた（裏のタブ等）ときは鳴らさない', () => {
    const a = activeTimeout(e())!;
    expect(shouldAlertEnd({ id: a.id, phase: 'running' }, a, at + 35 * S + 1, 30)).toBe(false);
  });
  it('前回を見ていない（再読み込み直後）・別のタイムアウト・既に ended・対象なしでは鳴らさない', () => {
    const a = activeTimeout(e())!;
    expect(shouldAlertEnd(null, a, at + 30 * S, 30)).toBe(false);
    expect(shouldAlertEnd({ id: 'other', phase: 'running' }, a, at + 30 * S, 30)).toBe(false);
    expect(shouldAlertEnd({ id: a.id, phase: 'ended' }, a, at + 31 * S, 30)).toBe(false);
    expect(shouldAlertEnd({ id: a.id, phase: 'running' }, null, at + 30 * S, 30)).toBe(false);
  });
});
