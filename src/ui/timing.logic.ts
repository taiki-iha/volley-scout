import type { MatchEvent, Side } from '../core/types';
import { compareEvents } from '../data/eventPatch';
import type { CsvRow } from './analysis.logic';
import type { SetFlow } from './scoreFlow.logic';

// 試合の経過時間とタイムアウトのカウントダウン（純粋関数。現在時刻 now は呼ぶ側が渡す）
// 時刻はすべてイベントの記録時刻 at（ミリ秒）から求める。追加の入力はない。

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 経過時間の表示。1時間未満は mm:ss、1時間以上は h:mm:ss。負の値（端末の時計のずれ）は 0 とする */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** カウントダウンの残り秒の表示（m:ss） */
export function formatCountdown(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${pad2(t % 60)}`;
}

/** 時計の時刻（HH:MM、端末のタイムゾーン） */
export function formatTimeOfDay(at: number): string {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** セットの時間 = set_start → そのセットで最後に数えたラリー。ラリーがまだなければ null */
export function setDurationMs(f: SetFlow): number | null {
  return f.lastAt === null ? null : Math.max(0, f.lastAt - f.startAt);
}

/** 試合全体の時間 = 最初の set_start → 試合で最後に数えたラリー（セット間を含む）。ラリーがなければ null */
export function matchSpanMs(flows: SetFlow[]): number | null {
  if (flows.length === 0) return null;
  let last: number | null = null;
  for (const f of flows) if (f.lastAt !== null && (last === null || f.lastAt > last)) last = f.lastAt;
  return last === null ? null : Math.max(0, last - flows[0].startAt);
}

export interface Clock { ms: number; running: boolean }
export interface LiveClock { set: Clock; match: Clock }

/**
 * 入力・閲覧画面の経過時間。
 * - このセット: 進行中は now − 現在セットの開始。終わったら、そのセットの最後のラリーで止める。
 * - 試合: 進行中（セット間を含む）は now − 最初のセットの開始。試合が終わったら、試合の最後のラリーで止める。
 * セットがまだなければ null。
 */
export function liveClock(flows: SetFlow[], matchOver: boolean, now: number): LiveClock | null {
  if (flows.length === 0) return null;
  const cur = flows[flows.length - 1];
  const setDone = cur.over && cur.lastAt !== null;
  const set: Clock = setDone
    ? { ms: Math.max(0, cur.lastAt! - cur.startAt), running: false }
    : { ms: Math.max(0, now - cur.startAt), running: true };
  const span = matchSpanMs(flows);
  const match: Clock = matchOver && span !== null
    ? { ms: span, running: false }
    : { ms: Math.max(0, now - flows[0].startAt), running: true };
  return { set, match };
}

/** 分析: セットごとの時間の表（画面と CSV で同じ行）。最後に試合全体の行を付ける */
export function setTimeRows(flows: SetFlow[]): CsvRow[] {
  if (flows.length === 0) return [];
  const rows: CsvRow[] = flows.map((f) => {
    const d = setDurationMs(f);
    return {
      セット: `第${f.set}セット`,
      得点: `${f.score.us}-${f.score.them}`,
      開始: formatTimeOfDay(f.startAt),
      時間: d === null ? null : formatElapsed(d),
      状態: f.over ? '終了' : '途中',
    };
  });
  const span = matchSpanMs(flows);
  rows.push({
    セット: '試合全体（セット間を含む）', 得点: '', 開始: formatTimeOfDay(flows[0].startAt),
    時間: span === null ? null : formatElapsed(span), 状態: '',
  });
  return rows;
}

// ---------- タイムアウトのカウントダウン ----------

/** 6人制のルール: 1セットに各チーム2回まで */
export const TIMEOUTS_PER_SET = 2;
/** 0 になってから「タイムアウト終了」を出しておく時間 */
export const TIMEOUT_END_SHOW_MS = 5000;
/** 残りがこの秒数以下で色を変える */
export const TIMEOUT_WARN_SEC = 10;

export interface TimeoutCountdown {
  id: string;            // タイムアウトのイベント id（閉じた・音を鳴らしたの記録に使う）
  side: Side;
  nth: number;           // このセットでそのチームの何回目か
  phase: 'running' | 'ended';
  remainingSec: number;  // 残り秒（切り上げ。ended なら 0）
  warn: boolean;         // 残り TIMEOUT_WARN_SEC 秒以下
}

/**
 * いま出すタイムアウトのカウントダウン。最後に記録したタイムアウトだけが対象
 * （両チームのタイムアウトが重なったら新しい方）。その後にラリーかセット開始が記録されたら出さない。
 * 1つ戻すでタイムアウトのイベントが消えれば、そのカウントダウンも消える（イベントから毎回求めるため）。
 * 開始は記録時刻 at から数えるので、再読み込みや別の端末でも同じ残り時間になる。
 * 0 になってから endShowMs の間は phase = 'ended'、それを過ぎたら null。
 */
export function timeoutCountdown(
  events: readonly MatchEvent[], now: number, durationSec: number, endShowMs = TIMEOUT_END_SHOW_MS,
): TimeoutCountdown | null {
  const sorted = [...events].sort(compareEvents);
  let i = sorted.length - 1;
  while (i >= 0 && sorted[i].t !== 'timeout') {
    if (sorted[i].t === 'rally' || sorted[i].t === 'set_start') return null;
    i--;
  }
  if (i < 0) return null;
  const to = sorted[i] as Extract<MatchEvent, { t: 'timeout' }>;

  // 何回目か: そのセットの（最新の）set_start より後の、同じチームのタイムアウトを数える
  let nth = 0;
  for (let j = i; j >= 0; j--) {
    const e = sorted[j];
    if (e.t === 'set_start' && e.set === to.set) break;
    if (e.t === 'timeout' && e.set === to.set && e.side === to.side) nth++;
  }

  const remainingMs = durationSec * 1000 - Math.max(0, now - to.at);
  if (remainingMs > 0) {
    const remainingSec = Math.ceil(remainingMs / 1000);
    return { id: to.id, side: to.side, nth, phase: 'running', remainingSec, warn: remainingSec <= TIMEOUT_WARN_SEC };
  }
  if (remainingMs > -endShowMs) return { id: to.id, side: to.side, nth, phase: 'ended', remainingSec: 0, warn: false };
  return null;
}
