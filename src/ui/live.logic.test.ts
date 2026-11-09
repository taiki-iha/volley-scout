import { describe, it, expect } from 'vitest';
import { replay } from '../core/replay';
import { DEFAULT_THRESHOLDS } from '../core/condition';
import type { Lineup, MatchConfig, MatchEvent, Side } from '../core/types';
import type { NewEvent } from '../data/store';
import {
  IDLE, assignSlot, backRow, benchOf, blockerCandidates, buildAttemptEvent, buildMatchConfig, buildRallyEvent, canStartSet,
  chooseBlocker, choosePlay, chooseZone, conditionRows, initialDraft, liberoReplaced, needsZone, nextEmptySlot, nextSetNeeded,
  nextSetNo, rotationLabel, subOutCandidates, toggleLibero, validateSetStart, withOpponentNo, type SetStartDraft, type Step,
} from './live.logic';

const cfg: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const US: Lineup = [1, 2, 3, 4, 5, 6];
const THEM: Lineup = [11, 12, 13, 14, 15, 16];

let seq = 0;
function mk(e: NewEvent): MatchEvent {
  seq++;
  return { ...e, id: String(seq).padStart(10, '0'), seq, at: seq } as MatchEvent;
}
function start(set: number, firstServe: Side = 'us'): MatchEvent {
  return mk({ t: 'set_start', set, lineups: { us: US, them: THEM }, setters: { us: 2, them: 11 }, liberos: { us: [10], them: [] }, firstServe });
}
function points(set: number, side: Side, n: number): MatchEvent[] {
  return Array.from({ length: n }, () => mk(buildRallyEvent(set, null, 'other_point', null, null, side)));
}

describe('buildRallyEvent', () => {
  it('被ブロックは相手の得点でブロッカーを記録', () => {
    expect(buildRallyEvent(1, { side: 'us', player: 4 }, 'spike_blocked', 4, 7)).toEqual({
      t: 'rally', set: 1, side: 'us', player: 4, play: 'spike_blocked', zone: 4, blocker: 7, pointTo: 'them',
    });
  });
  it('選手なしは noPlayerPointTo の側に得点', () => {
    const e = buildRallyEvent(2, null, 'other_point', null, null, 'us');
    expect(e).toMatchObject({ t: 'rally', set: 2, side: null, player: null, pointTo: 'us' });
  });
  it('選手なしで noPlayerPointTo が無いとエラー', () => {
    expect(() => buildRallyEvent(1, null, 'other_point', null, null)).toThrow();
  });
  it('相手のスパイク決定は相手の得点、サーブ系はゾーンを持たない', () => {
    expect(buildRallyEvent(1, { side: 'them', player: 9 }, 'spike_kill', 2, null).pointTo).toBe('them');
    expect(buildRallyEvent(1, { side: 'us', player: 3 }, 'serve_error', 2, 5)).toMatchObject({ zone: null, blocker: null, pointTo: 'them' });
  });
  it('スパイク（継続）は attempt', () => {
    expect(buildAttemptEvent(1, 'us', 4, 3)).toEqual({ t: 'attempt', set: 1, side: 'us', player: 4, zone: 3 });
  });
});

describe('needsZone', () => {
  it('スパイク系と継続だけ true', () => {
    expect(needsZone('serve_ace')).toBe(false);
    expect(needsZone('serve_error')).toBe(false);
    expect(needsZone('block_point')).toBe(false);
    expect(needsZone('other_point')).toBe(false);
    expect(needsZone('other_error')).toBe(false);
    expect(needsZone('spike_kill')).toBe(true);
    expect(needsZone('spike_error')).toBe(true);
    expect(needsZone('spike_blocked')).toBe(true);
    expect(needsZone('attempt')).toBe(true);
  });
});

describe('入力の段階', () => {
  const sel = { side: 'us' as Side, player: 4 };
  const play: Step = { k: 'play', sel };
  it('ゾーン不要のプレーはすぐイベント', () => {
    const r = choosePlay(play, 'serve_ace', 1);
    expect(r.step).toEqual(IDLE);
    expect(r.event).toMatchObject({ t: 'rally', play: 'serve_ace', pointTo: 'us' });
  });
  it('スパイク決定 → ゾーン → イベント', () => {
    const r1 = choosePlay(play, 'spike_kill', 1);
    expect(r1.step).toEqual({ k: 'zone', sel, play: 'spike_kill' });
    expect(r1.event).toBeUndefined();
    const r2 = chooseZone(r1.step, 4, 1);
    expect(r2.event).toMatchObject({ play: 'spike_kill', zone: 4, pointTo: 'us' });
  });
  it('被ブロック → ゾーン → ブロッカー（スキップ可）', () => {
    const r1 = chooseZone(choosePlay(play, 'spike_blocked', 1).step, 2, 1);
    expect(r1.step).toEqual({ k: 'blocker', sel, zone: 2 });
    expect(chooseBlocker(r1.step, 14, 1).event).toMatchObject({ blocker: 14, zone: 2, pointTo: 'them' });
    expect(chooseBlocker(r1.step, null, 1).event).toMatchObject({ blocker: null });
  });
  it('継続 → ゾーン → attempt', () => {
    const r = chooseZone(choosePlay(play, 'attempt', 1).step, null, 1);
    expect(r.event).toEqual({ t: 'attempt', set: 1, side: 'us', player: 4, zone: null });
  });
  it('選手未選択なら何もしない', () => {
    expect(choosePlay(IDLE, 'serve_ace', 1)).toEqual({ step: IDLE });
  });
  it('ブロッカー候補は相手の前衛 4,3,2', () => {
    expect(blockerCandidates({ us: US, them: THEM }, 'us')).toEqual([14, 13, 12]);
  });
});

describe('セットの進行', () => {
  it('セット1は一度だけ開始できる（R4）', () => {
    const empty = replay(cfg, []);
    expect(canStartSet([], empty, cfg, 1)).toBe(true);
    expect(nextSetNo(empty)).toBe(1);
    const evs = [start(1)];
    const st = replay(cfg, evs);
    expect(canStartSet(evs, st, cfg, 1)).toBe(false);
    expect(canStartSet(evs, st, cfg, 2)).toBe(false);
    expect(nextSetNeeded(st, cfg)).toBe(false);
  });
  it('セット終了で次のセットが必要、開始後は二度と作らない', () => {
    const evs = [start(1), ...points(1, 'us', 25)];
    const st = replay(cfg, evs);
    expect(nextSetNeeded(st, cfg)).toBe(true);
    expect(nextSetNo(st)).toBe(2);
    expect(canStartSet(evs, st, cfg, 2)).toBe(true);
    const evs2 = [...evs, start(2)];
    const st2 = replay(cfg, evs2);
    expect(canStartSet(evs2, st2, cfg, 2)).toBe(false);
    expect(nextSetNeeded(st2, cfg)).toBe(false);
  });
  it('試合終了なら次のセットは不要', () => {
    const evs = [start(1), ...points(1, 'us', 25), start(2), ...points(2, 'us', 25)];
    const st = replay(cfg, evs);
    expect(st.matchOver).toBe(true);
    expect(nextSetNeeded(st, cfg)).toBe(false);
    expect(canStartSet(evs, st, cfg, 3)).toBe(false);
  });
  it('セット数固定は最後のセットまで続く', () => {
    const fixed: MatchConfig = { format: 'fixed', sets: 3, points: 25, finalSetPoints: 25 };
    const evs = [start(1), ...points(1, 'us', 25), start(2), ...points(2, 'us', 25)];
    const st = replay(fixed, evs);
    expect(nextSetNeeded(st, fixed)).toBe(true);
    expect(canStartSet(evs, st, fixed, 3)).toBe(true);
  });
});

describe('セット開始の入力', () => {
  const full = (): SetStartDraft => ({
    lineups: { us: [...US], them: [...THEM] }, setters: { us: 2, them: null }, liberos: { us: [10], them: [] }, firstServe: 'them',
  });
  it('正しい入力は set_start になる', () => {
    const r = validateSetStart(full(), 2);
    expect(r).toEqual({ ok: true, value: {
      t: 'set_start', set: 2, lineups: { us: US, them: THEM }, setters: { us: 2, them: null }, liberos: { us: [10], them: [] }, firstServe: 'them',
    } });
  });
  it('空き・重複・リベロがスタメン・セッターがコート外・サーブ権未選択はエラー', () => {
    const d1 = full(); d1.lineups.us[3] = null;
    expect(validateSetStart(d1, 1).ok).toBe(false);
    const d2 = full(); d2.lineups.them[0] = 12;
    expect(validateSetStart(d2, 1).ok).toBe(false);
    const d3 = full(); d3.liberos.us = [3];
    expect(validateSetStart(d3, 1).ok).toBe(false);
    const d4 = full(); d4.setters.us = 9;
    expect(validateSetStart(d4, 1).ok).toBe(false);
    const d5 = full(); d5.firstServe = null;
    expect(validateSetStart(d5, 1).ok).toBe(false);
  });
  it('割り当て: 同じ番号は元の位置から外れ、リベロからも外れる', () => {
    const d = assignSlot(full(), 'us', 0, 10);
    expect(d.lineups.us).toEqual([10, 2, 3, 4, 5, 6]);
    expect(d.liberos.us).toEqual([]);
    const d2 = assignSlot(full(), 'us', 0, 3);
    expect(d2.lineups.us).toEqual([3, 2, null, 4, 5, 6]);
    expect(nextEmptySlot(d2.lineups.us, 0)).toBe(2);
    expect(nextEmptySlot(US, 0)).toBeNull();
  });
  it('リベロの切り替え（コートから外す、最大2人）', () => {
    const d = toggleLibero(full(), 'us', 2);
    expect(d.lineups.us).toEqual([1, null, 3, 4, 5, 6]);
    expect(d.liberos.us).toEqual([10, 2]);
    expect(d.setters.us).toBeNull();
    expect(toggleLibero(d, 'us', 7)).toBe(d);
    expect(toggleLibero(d, 'us', 10).liberos.us).toEqual([2]);
  });
  it('1セット目の初期値: 空、リベロはポジションLの選手', () => {
    const d = initialDraft([], replay(cfg, []), [{ no: 10, name: 'a', position: 'L' }, { no: 1, name: 'b', position: 'S' }], [{ no: 20, name: '', position: 'L' }]);
    expect(d.lineups.us).toEqual([null, null, null, null, null, null]);
    expect(d.liberos).toEqual({ us: [10], them: [20] });
    expect(d.firstServe).toBeNull();
  });
  it('2セット目の初期値: 前セット最終配置、コート上のリベロは元の選手に戻す、サーブ権は逆', () => {
    const evs = [start(1, 'us'), mk({ t: 'libero', set: 1, side: 'us', out: 5, in: 10 }), ...points(1, 'them', 25)];
    const st = replay(cfg, evs);
    expect(liberoReplaced(evs, 1, 10)).toBe(5);
    const d = initialDraft(evs, st, [], []);
    expect(d.lineups.us).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.lineups.them).toEqual(st.current!.lineups.them);
    expect(d.firstServe).toBe('them');
    expect(d.liberos.us).toEqual([10]);
    expect(validateSetStart(d, 2).ok).toBe(true);
  });
  it('相手の未登録背番号を追加（登録済みなら null）', () => {
    const t = { id: 'o', name: 'X', players: [{ no: 5, name: '', position: null }] };
    expect(withOpponentNo(t, 5)).toBeNull();
    expect(withOpponentNo(t, 3)!.players).toEqual([{ no: 3, name: '', position: null }, { no: 5, name: '', position: null }]);
  });
});

describe('交代・表示', () => {
  it('通常の交代の候補にコート上のリベロは入らない', () => {
    expect(subOutCandidates([10, 2, 3, 4, 5, 6], [10])).toEqual([2, 3, 4, 5, 6]);
  });
  it('一度始めたセットを1つ戻すで取り消すと、同じセットをもう一度始められる（R4）', () => {
    const evs = [start(1), ...points(1, 'us', 25), start(2)];
    expect(canStartSet(evs, replay(cfg, evs), cfg, 2)).toBe(false);
    const undone = evs.slice(0, -1);
    expect(canStartSet(undone, replay(cfg, undone), cfg, 2)).toBe(true);
  });
  it('ベンチと後衛', () => {
    expect(benchOf([1, 2, 3, 4, 5, 6, 7, 8, 10], US, [10])).toEqual([7, 8]);
    expect(backRow(US)).toEqual([1, 6, 5]);
  });
  it('ローテ番号', () => {
    expect(rotationLabel(US, 2)).toBe('S2');
    expect(rotationLabel(US, null)).toBe('S?');
  });
  it('調子: スパイク5本以上で決定率30%未満、またはこのセットのサーブミス2本', () => {
    const evs = [
      start(1),
      ...Array.from({ length: 5 }, () => mk(buildRallyEvent(1, { side: 'us', player: 4 }, 'spike_error', 4, null))),
      mk(buildRallyEvent(1, { side: 'us', player: 3 }, 'spike_kill', 3, null)),
    ];
    const st = replay(cfg, evs);
    const rows = conditionRows(cfg, evs, st, DEFAULT_THRESHOLDS);
    expect(rows.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.find((r) => r.no === 4)).toMatchObject({ kills: 0, attempts: 5, bad: true, onCourt: true });
    expect(rows.find((r) => r.no === 3)).toMatchObject({ kills: 1, attempts: 1, bad: false });
  });
  it('調子: 同じセットのサーブミス2本で悪い', () => {
    const evs = [start(1, 'us'), mk(buildRallyEvent(1, { side: 'us', player: 1 }, 'serve_error', null, null))];
    // サイドアウトされたので相手→自チームと戻して再びサーブミス
    evs.push(...points(1, 'us', 1));
    evs.push(mk(buildRallyEvent(1, { side: 'us', player: 2 }, 'serve_error', null, null)));
    evs.push(mk(buildRallyEvent(1, { side: 'us', player: 1 }, 'serve_error', null, null)));
    const st = replay(cfg, evs);
    expect(conditionRows(cfg, evs, st, DEFAULT_THRESHOLDS).find((r) => r.no === 1)).toMatchObject({ serveErrorsSet: 2, bad: true });
  });
});

describe('buildMatchConfig', () => {
  it('3セット・5セット・固定', () => {
    expect(buildMatchConfig({ format: 'bo3', fixedSets: '', points: '25', finalSetPoints: '15' }))
      .toEqual({ ok: true, value: { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 } });
    expect(buildMatchConfig({ format: 'bo5', fixedSets: '', points: '25', finalSetPoints: '15' }))
      .toEqual({ ok: true, value: { format: 'bestOf', sets: 5, points: 25, finalSetPoints: 15 } });
    expect(buildMatchConfig({ format: 'fixed', fixedSets: '4', points: '21', finalSetPoints: '' }))
      .toEqual({ ok: true, value: { format: 'fixed', sets: 4, points: 21, finalSetPoints: 21 } });
    expect(buildMatchConfig({ format: 'fixed', fixedSets: '0', points: '25', finalSetPoints: '' }).ok).toBe(false);
    expect(buildMatchConfig({ format: 'bo3', fixedSets: '', points: 'x', finalSetPoints: '15' }).ok).toBe(false);
  });
});
