// 試合中の入力画面（Live / SetStart / MatchSetup / SubDialog）の判断ロジック。画面から切り出してテストする。
import { badCondition } from '../core/condition';
import type { MatchState } from '../core/replay';
import { isFrontRow, server, setterRotation } from '../core/rotation';
import { pointWinner } from '../core/rules';
import type {
  ConditionThresholds, Lineup, MatchConfig, MatchEvent, OpponentPlayer, OpponentTeam, PlayKind, Player, Position, Side, Zone,
} from '../core/types';
import type { NewEvent } from '../data/store';
import { playerStats } from '../stats/player';
import type { Result } from './validate';

export const other = (s: Side): Side => (s === 'us' ? 'them' : 'us');
export const SIDE_LABEL: Record<Side, string> = { us: '自チーム', them: '相手' };

export const PLAY_LABEL: Record<PlayKind | 'attempt', string> = {
  spike_kill: 'スパイク決定', spike_error: 'スパイクミス', spike_blocked: 'スパイク被ブロック',
  serve_ace: 'サーブエース', serve_error: 'サーブミス', block_point: 'ブロック得点',
  other_point: 'その他の得点', other_error: 'その他のミス', attempt: 'スパイク（継続）',
};
/** パネルに並べる順（左右2列で 得点系=左 / ミス系=右） */
export const PLAY_ORDER: (PlayKind | 'attempt')[] = [
  'spike_kill', 'spike_error', 'serve_ace', 'serve_error', 'block_point', 'spike_blocked', 'other_point', 'other_error', 'attempt',
];
export const isScoring = (p: PlayKind | 'attempt'): boolean =>
  p === 'spike_kill' || p === 'serve_ace' || p === 'block_point' || p === 'other_point';

/** コート図と同じ並び（上段=前衛 4 3 2 / 下段=後衛 5 6 1） */
export const ZONE_GRID: Zone[] = [4, 3, 2, 5, 6, 1];

export const ROLE_SHORT: Record<Position, string> = { S: 'S', OH: 'OH', MB: 'MB', OP: 'OP', L: 'L' };

// ---------- イベント生成 ----------

/** NewEvent のうち rally / attempt（どちらも NewEvent に代入できる） */
export type RallyNewEvent = Extract<NewEvent, { t: 'rally' }>;
export type AttemptNewEvent = Extract<NewEvent, { t: 'attempt' }>;

export function needsZone(play: PlayKind | 'attempt'): boolean {
  return play === 'spike_kill' || play === 'spike_error' || play === 'spike_blocked' || play === 'attempt';
}

export function buildRallyEvent(
  set: number, sel: { side: Side; player: number } | null, play: PlayKind, zone: Zone | null, blocker: number | null,
  noPlayerPointTo?: Side,
): RallyNewEvent {
  if (sel === null) {
    if (noPlayerPointTo === undefined) throw new Error('buildRallyEvent: 選手なしのときは noPlayerPointTo が必要です');
    return { t: 'rally', set, side: null, player: null, play, zone: null, blocker: null, pointTo: noPlayerPointTo };
  }
  return {
    t: 'rally', set, side: sel.side, player: sel.player, play,
    zone: needsZone(play) ? zone : null,
    blocker: play === 'spike_blocked' ? blocker : null,
    pointTo: pointWinner(sel.side, play),
  };
}

export function buildAttemptEvent(set: number, side: Side, player: number, zone: Zone | null): AttemptNewEvent {
  return { t: 'attempt', set, side, player, zone };
}

/** 選んだ選手が、今サーブ権を持つ側のサーバー（ポジション1）か */
export function isCurrentServer(sel: Sel, serving: Side, lineups: Record<Side, Lineup>): boolean {
  return sel.side === serving && server(lineups[serving]) === sel.player;
}

/** 選んだ選手に出すプレーの一覧（PLAY_ORDER の順）。サーブエース・サーブミスは今のサーバーのときだけ */
export function availablePlays(sel: Sel, serving: Side, lineups: Record<Side, Lineup>): (PlayKind | 'attempt')[] {
  const serverSelected = isCurrentServer(sel, serving, lineups);
  return PLAY_ORDER.filter((p) => serverSelected || (p !== 'serve_ace' && p !== 'serve_error'));
}

/**
 * 「被ブロックは自チームの打者から入力」の案内を出すか。相手の「ブロック得点」から入れると自チームの打者が
 * 不明になり効果率が正しく出ないため。ブロックできるのは前衛（ポジション 2,3,4）の相手選手だけなので、そのときだけ出す
 * （サーバーは後衛なので、プレーが一番多いときに1行増えて 1024×768 からはみ出すこともない）。
 */
export function showBlockHint(sel: Sel, lineups: Record<Side, Lineup>): boolean {
  return sel.side === 'them' && isFrontRow(lineups.them, sel.player);
}

// ---------- 入力の段階（選手 → プレー → ゾーン → ブロッカー） ----------

export type Sel = { side: Side; player: number };
export type Step =
  | { k: 'idle' }
  | { k: 'play'; sel: Sel }
  | { k: 'zone'; sel: Sel; play: PlayKind | 'attempt' }
  | { k: 'blocker'; sel: Sel; zone: Zone | null };
export interface StepResult { step: Step; event?: NewEvent }

export const IDLE: Step = { k: 'idle' };

export function choosePlay(step: Step, play: PlayKind | 'attempt', set: number): StepResult {
  if (step.k === 'idle') return { step };
  const sel = step.sel;
  if (needsZone(play)) return { step: { k: 'zone', sel, play } };
  // needsZone が false なのは 'attempt' 以外
  return { step: IDLE, event: buildRallyEvent(set, sel, play as PlayKind, null, null) };
}

export function chooseZone(step: Step, zone: Zone | null, set: number): StepResult {
  if (step.k !== 'zone') return { step };
  const { sel, play } = step;
  if (play === 'attempt') return { step: IDLE, event: buildAttemptEvent(set, sel.side, sel.player, zone) };
  if (play === 'spike_blocked') return { step: { k: 'blocker', sel, zone } };
  return { step: IDLE, event: buildRallyEvent(set, sel, play, zone, null) };
}

export function chooseBlocker(step: Step, blocker: number | null, set: number): StepResult {
  if (step.k !== 'blocker') return { step };
  return { step: IDLE, event: buildRallyEvent(set, step.sel, 'spike_blocked', step.zone, blocker) };
}

/** ブロッカー候補 = 打った側の相手チームの前衛（ポジション 4,3,2 の順） */
export function blockerCandidates(lineups: Record<Side, Lineup>, hitter: Side): number[] {
  const l = lineups[other(hitter)];
  return [l[3], l[2], l[1]];
}

// ---------- セットの進行 ----------

/** 現在セットが終わっていて、試合はまだ終わっていない */
export function nextSetNeeded(state: MatchState, cfg: MatchConfig): boolean {
  const cur = state.current;
  return !!cur && cur.over && !state.matchOver && cur.set < cfg.sets;
}

export function nextSetNo(state: MatchState): number {
  return state.current ? state.current.set + 1 : 1;
}

/**
 * セット n の set_start を追加してよいか（R4: 同じセット番号の set_start は二度と作らない）。
 * n の set_start がまだ無く、n===1 なら一度もセットが始まっていない／n>1 なら n-1 セットが終わっている。
 */
export function canStartSet(events: MatchEvent[], state: MatchState, cfg: MatchConfig, n: number): boolean {
  if (n < 1 || n > cfg.sets || state.matchOver) return false;
  if (events.some((e) => e.t === 'set_start' && e.set === n)) return false;
  if (n === 1) return state.sets.length === 0;
  const prev = state.sets.find((s) => s.set === n - 1);
  return !!prev && prev.over && state.current?.set === n - 1;
}

// ---------- セット開始の入力 ----------

export interface SetStartDraft {
  lineups: Record<Side, (number | null)[]>;   // index0=ポジション1 … index5=ポジション6
  setters: Record<Side, number | null>;
  liberos: Record<Side, number[]>;
  firstServe: Side | null;
}

/** リベロ l が今のセットで誰と入れ替わって入ったか（最後の libero イベント）。分からなければ null */
export function liberoReplaced(events: MatchEvent[], set: number, libero: number): number | null {
  let out: number | null = null;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.t === 'libero' && e.set === set && e.in === libero) out = e.out;
  }
  return out;
}

export function defaultSetter(lineup: (number | null)[], roster: { no: number; position: Position | null }[]): number | null {
  for (const no of lineup) {
    if (no !== null && roster.find((p) => p.no === no)?.position === 'S') return no;
  }
  return null;
}

/** 前セットの最終配置（コート上のリベロは入れ替わった選手に戻す）を初期値にする。1セット目は空＋リベロ登録選手。 */
export function initialDraft(
  events: MatchEvent[], state: MatchState, players: Player[], opponents: OpponentPlayer[],
): SetStartDraft {
  const prev = state.current;
  if (!prev) {
    return {
      lineups: { us: Array(6).fill(null), them: Array(6).fill(null) },
      setters: { us: null, them: null },
      liberos: {
        us: players.filter((p) => p.position === 'L').map((p) => p.no).slice(0, 2),
        them: opponents.filter((p) => p.position === 'L').map((p) => p.no).slice(0, 2),
      },
      firstServe: null,
    };
  }
  const restore = (side: Side): (number | null)[] => prev.lineups[side].map((no) => {
    if (!prev.liberos[side].includes(no)) return no;
    const back = liberoReplaced(events, prev.set, no);
    return back !== null && !prev.lineups[side].includes(back) ? back : null;
  });
  const startEv = [...events].reverse().find((e) => e.t === 'set_start' && e.set === prev.set);
  const lastFirst = startEv && startEv.t === 'set_start' ? startEv.firstServe : null;
  return {
    lineups: { us: restore('us'), them: restore('them') },
    setters: { ...prev.setters },
    liberos: { us: [...prev.liberos.us], them: [...prev.liberos.them] },
    firstServe: lastFirst ? other(lastFirst) : null,
  };
}

/** 番号 no をポジション index に置く。同じ側の別ポジションにいたらそこは空ける。リベロに入っていたら外す。 */
export function assignSlot(d: SetStartDraft, side: Side, index: number, no: number): SetStartDraft {
  const lineup = d.lineups[side].map((n) => (n === no ? null : n));
  lineup[index] = no;
  return {
    ...d,
    lineups: { ...d.lineups, [side]: lineup },
    liberos: { ...d.liberos, [side]: d.liberos[side].filter((n) => n !== no) },
  };
}

/** リベロの登録を切り替える（コート上の6人に入っていたらそこから外す。最大2人） */
export function toggleLibero(d: SetStartDraft, side: Side, no: number): SetStartDraft {
  const has = d.liberos[side].includes(no);
  if (!has && d.liberos[side].length >= 2) return d;
  return {
    ...d,
    lineups: { ...d.lineups, [side]: d.lineups[side].map((n) => (n === no ? null : n)) },
    liberos: { ...d.liberos, [side]: has ? d.liberos[side].filter((n) => n !== no) : [...d.liberos[side], no] },
    setters: d.setters[side] === no ? { ...d.setters, [side]: null } : d.setters,
  };
}

/** ドラッグ＆ドロップの落とし先: コートのポジション（index0=ポジション1）／ベンチ（選手一覧）／リベロ欄 */
export type DropTarget = { k: 'slot'; index: number } | { k: 'bench' } | { k: 'libero' };

/**
 * 選手 no を target へドラッグして落としたときの配置（同じ側の中だけ）。
 * - slot: コート上の選手なら入れ先の選手と入れ替え（入れ先が空ならそのまま移動）。ベンチ・リベロからなら置き、
 *   入れ先にいた選手はベンチへ戻す。リベロだった選手はリベロから外す。
 * - bench: コートからもリベロからも外す。
 * - libero: リベロに指定する（コート上なら外す。すでに2人なら変えない）。
 * コートから外れた選手がセッターだったら、セッターは未指定（null）に戻す。
 */
export function dropPlayer(d: SetStartDraft, side: Side, no: number, target: DropTarget): SetStartDraft {
  const cur = d.lineups[side];
  const from = cur.indexOf(no);
  let lineup = [...cur];
  let liberos = d.liberos[side];
  if (target.k === 'slot') {
    const i = target.index;
    if (i < 0 || i > 5 || from === i) return d;
    const occupant = lineup[i];
    if (from >= 0) {
      lineup[from] = occupant;
    }
    lineup[i] = no;
    liberos = liberos.filter((n) => n !== no);
  } else if (target.k === 'bench') {
    if (from < 0 && !liberos.includes(no)) return d;
    lineup = lineup.map((n) => (n === no ? null : n));
    liberos = liberos.filter((n) => n !== no);
  } else {
    if (liberos.includes(no)) return d;
    if (liberos.length >= 2) return d;
    lineup = lineup.map((n) => (n === no ? null : n));
    liberos = [...liberos, no];
  }
  const setter = d.setters[side];
  const setterGone = setter !== null && cur.includes(setter) && !lineup.includes(setter);
  return {
    ...d,
    lineups: { ...d.lineups, [side]: lineup },
    liberos: { ...d.liberos, [side]: liberos },
    setters: setterGone ? { ...d.setters, [side]: null } : d.setters,
  };
}

export function nextEmptySlot(lineup: (number | null)[], from: number): number | null {
  for (let k = 1; k <= 6; k++) {
    const i = (from + k) % 6;
    if (lineup[i] === null) return i;
  }
  return null;
}

/** 入力内容をチェックして set_start イベントにする。setters は未指定なら null のまま（セッター不明＝ローテ番号なし） */
export function validateSetStart(d: SetStartDraft, set: number): Result<NewEvent> {
  const lineups = {} as Record<Side, Lineup>;
  for (const side of ['us', 'them'] as Side[]) {
    const l = d.lineups[side];
    const name = SIDE_LABEL[side];
    if (l.length !== 6 || l.some((n) => n === null)) return { ok: false, error: `${name}のポジション1〜6をすべて入れてください` };
    if (new Set(l).size !== 6) return { ok: false, error: `${name}の6人に同じ背番号があります` };
    const libs = d.liberos[side];
    if (new Set(libs).size !== libs.length) return { ok: false, error: `${name}のリベロが重複しています` };
    if (libs.some((n) => l.includes(n))) return { ok: false, error: `${name}のリベロはスタメン6人とは別にしてください` };
    const s = d.setters[side];
    if (s !== null && !l.includes(s)) return { ok: false, error: `${name}のセッターはスタメン6人から選んでください` };
    lineups[side] = l as Lineup;
  }
  if (d.firstServe === null) return { ok: false, error: '最初のサーブ権を選んでください' };
  return {
    ok: true,
    value: {
      t: 'set_start', set, lineups, setters: { ...d.setters },
      liberos: { us: [...d.liberos.us], them: [...d.liberos.them] }, firstServe: d.firstServe,
    },
  };
}

/** 相手チームに未登録の背番号を（名前 ''・ポジション null で）足したチーム。登録済みなら null */
export function withOpponentNo(team: OpponentTeam, no: number): OpponentTeam | null {
  if (team.players.some((p) => p.no === no)) return null;
  return { ...team, players: [...team.players, { no, name: '', position: null }].sort((a, b) => a.no - b.no) };
}

// ---------- 交代 ----------

/** ベンチ = 名簿のうちコート上にもリベロにもいない選手 */
export function benchOf(roster: number[], lineup: Lineup, liberos: number[]): number[] {
  return roster.filter((no) => !lineup.includes(no) && !liberos.includes(no)).sort((a, b) => a - b);
}

export function buildSubEvent(set: number, side: Side, out: number, inNo: number): NewEvent {
  return { t: 'sub', set, side, out, in: inNo };
}
export function buildLiberoEvent(set: number, side: Side, out: number, inNo: number): NewEvent {
  return { t: 'libero', set, side, out, in: inNo };
}
export function buildTimeoutEvent(set: number, side: Side): NewEvent {
  return { t: 'timeout', set, side };
}

/** 通常の交代で下げられる選手 = コート上のリベロ以外（リベロの出入りはリベロ入替で行う） */
export function subOutCandidates(lineup: Lineup, liberos: number[]): number[] {
  return lineup.filter((no) => !liberos.includes(no));
}

/** 後衛（ポジション 1,6,5）の選手。リベロと入れ替えられる候補 */
export function backRow(lineup: Lineup): number[] {
  return [lineup[0], lineup[5], lineup[4]];
}

// ---------- 表示 ----------

/**
 * スコアボードのローテ表示。セッターが分かれば S1〜S6（セッター基準）。
 * セッター不明のとき、相手は「開始順の番号」R1〜R6（セット開始の並びが R1、ローテするごとに +1）、自チームは S?。
 */
export function rotationLabel(side: Side, lineup: Lineup, setter: number | null, rotations: number): string {
  const r = setterRotation(lineup, setter);
  if (r !== null) return `S${r}`;
  return side === 'them' ? `R${(rotations % 6) + 1}` : 'S?';
}

export interface ConditionRow { no: number; kills: number; attempts: number; serveErrorsSet: number; bad: boolean; onCourt: boolean }

/** 自チームの調子一覧。コート上の選手と、この試合で記録のある選手を背番号順に */
export function conditionRows(
  cfg: MatchConfig, events: MatchEvent[], state: MatchState, th: ConditionThresholds,
): ConditionRow[] {
  const cur = state.current;
  if (!cur) return [];
  const data = [{ cfg, events, receptions: [] }];
  const whole = playerStats(data).filter((s) => s.side === 'us');
  const thisSet = playerStats(data, { set: cur.set }).filter((s) => s.side === 'us');
  const onCourt = new Set<number>(cur.lineups.us);
  const nos = new Set<number>([...onCourt, ...whole.map((s) => s.no)]);
  return [...nos].sort((a, b) => a - b).map((no) => {
    const st = whole.find((s) => s.no === no);
    const se = thisSet.find((s) => s.no === no)?.serve.errors ?? 0;
    return {
      no, kills: st?.spike.kills ?? 0, attempts: st?.spike.attempts ?? 0, serveErrorsSet: se,
      bad: st ? badCondition(st, se, th) : se >= th.maxServeErrorsPerSet,
      onCourt: onCourt.has(no),
    };
  });
}


// ---------- 試合作成 ----------

export type FormatChoice = 'bo3' | 'bo5' | 'fixed';
export interface MatchForm { format: FormatChoice; fixedSets: string; points: string; finalSetPoints: string }

export function buildMatchConfig(f: MatchForm): Result<MatchConfig> {
  const int = (s: string): number | null => (/^\d{1,2}$/.test(s.trim()) ? Number(s.trim()) : null);
  const points = int(f.points);
  if (points === null || points < 1) return { ok: false, error: '1セットの点数は1〜99の整数で入れてください' };
  if (f.format === 'fixed') {
    const n = int(f.fixedSets);
    if (n === null || n < 1 || n > 9) return { ok: false, error: 'セット数は1〜9で入れてください' };
    return { ok: true, value: { format: 'fixed', sets: n, points, finalSetPoints: points } };
  }
  const fin = int(f.finalSetPoints);
  if (fin === null || fin < 1) return { ok: false, error: '最終セットの点数は1〜99の整数で入れてください' };
  return { ok: true, value: { format: 'bestOf', sets: f.format === 'bo3' ? 3 : 5, points, finalSetPoints: fin } };
}
