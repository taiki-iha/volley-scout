// 試合後のレシーブ入力・記録修正画面の判断ロジック（画面から切り出してテストする）
import { replay } from '../core/replay';
import { server } from '../core/rotation';
import type { Grade, Lineup, MatchConfig, MatchEvent, PlayKind, Reception, Side } from '../core/types';
import type { ReceptionRow } from '../stats/opponent';
import { PLAY_ORDER, SIDE_LABEL, isScoring } from './live.logic';

export const GRADES: Grade[] = ['A', 'B', 'C', 'D'];
export const GRADE_DEFS: Record<Grade, string> = {
  A: 'セッターが動かずにトスでき、どの攻撃も使える返球',
  B: 'セッターが少し動く。攻撃の選択肢がやや減る',
  C: 'セッターが大きく動く、または二段トス。速攻は使えない',
  D: '返球できない（サービスエースを取られた、またはダイレクトで相手コートに返った）',
};

export interface MergedRow {
  row: ReceptionRow;
  receiver: number | null;   // 不明は null
  grade: Grade | null;       // 未入力は null（preset 'D' は D）
  saved: boolean;            // 保存済みのレシーブがある
}

/** 行と保存済みレシーブを突き合わせる。保存済みがなければ preset を判定の初期値にする */
export function mergeRows(rows: readonly ReceptionRow[], saved: readonly Reception[]): MergedRow[] {
  const by = new Map(saved.map((r) => [r.rallyId, r]));
  return rows.map((row) => {
    const s = by.get(row.rallyId);
    if (s) return { row, receiver: s.receiver, grade: s.grade, saved: true };
    return { row, receiver: null, grade: row.preset, saved: false };
  });
}

/** 判定をつけ終えた行の次で、判定が未入力の最初の行（なければ先頭から探す）。すべて入力済みなら null */
export function nextUngradedRowId(rows: readonly MergedRow[], afterRallyId: string): string | null {
  const i = rows.findIndex((r) => r.row.rallyId === afterRallyId);
  const order = [...rows.slice(i + 1), ...rows.slice(0, Math.max(i, 0))];
  // 保存済みでない行（preset D を含む）で、受け手がまだ決まっていないものも「未完了」として扱う
  return order.find((r) => r.grade === null || !r.saved)?.row.rallyId ?? null;
}

/** 受け手の候補（その時コートにいた6人を背番号順） */
export const receiverCandidates = (lineup: Lineup): number[] => [...lineup].sort((a, b) => a - b);

/** 修正画面で選べるプレー（得点系↔ミス系をまたぐものは allowed=false） */
export function playChoices(cur: PlayKind): { play: PlayKind; allowed: boolean }[] {
  return PLAY_ORDER.filter((p): p is PlayKind => p !== 'attempt')
    .map((play) => ({ play, allowed: isScoring(play) === isScoring(cur) }));
}

type Rally = Extract<MatchEvent, { t: 'rally' }>;

const needsZone = (p: PlayKind) => p === 'spike_kill' || p === 'spike_error' || p === 'spike_blocked';

/** プレー変更時に、不要になるゾーン・ブロッカーを消すパッチを作る */
export function playChangePatch(cur: Rally, play: PlayKind): Partial<Pick<Rally, 'play' | 'zone' | 'blocker'>> {
  const patch: Partial<Pick<Rally, 'play' | 'zone' | 'blocker'>> = { play };
  if (!needsZone(play) && cur.zone !== null) patch.zone = null;
  if (play !== 'spike_blocked' && cur.blocker !== null) patch.blocker = null;
  return patch;
}

export { needsZone };

/** 修正画面の各行に出す「そのラリーの前の」セット・点数・サーバー（動画と照らし合わせるため） */
export interface EditContext { set: number; score: Record<Side, number>; serving: Side; server: number }

/**
 * rally / attempt イベントの id → そのラリー開始時の状況。
 * rally は replay の scoreBefore。attempt（スパイク継続）は同じセットで次に来る rally のもの（同じラリー中の出来事なので）。
 * 次の rally がまだ無い attempt は、そのセットの現在の状況。セット終了後に入った rally など状況が無いものは含めない。
 */
export function editContexts(cfg: MatchConfig, events: readonly MatchEvent[]): Map<string, EditContext> {
  const st = replay(cfg, [...events]);
  const byRally = new Map(st.rallies.map((r) => [r.eventId, { set: r.set, score: r.scoreBefore, serving: r.serving, server: r.server }]));
  const out = new Map<string, EditContext>();
  const pending: Extract<MatchEvent, { t: 'attempt' }>[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1))) {
    if (e.t === 'attempt') pending.push(e);
    if (e.t !== 'rally') continue;
    const ctx = byRally.get(e.id);
    if (!ctx) continue;
    out.set(e.id, ctx);
    for (const a of pending.splice(0)) if (a.set === ctx.set) out.set(a.id, ctx);
  }
  // まだラリーが終わっていない attempt は、そのセットの今の状況
  for (const a of pending) {
    const s = [...st.sets].reverse().find((x) => x.set === a.set);
    if (s && !s.over) out.set(a.id, { set: s.set, score: { ...s.score }, serving: s.serving, server: server(s.lineups[s.serving]) });
  }
  return out;
}

/** 例: 「12-10 サーブ 自チーム #5」（点数は 自チーム-相手） */
export function editContextLabel(c: EditContext): string {
  return `${c.score.us}-${c.score.them} サーブ ${SIDE_LABEL[c.serving]} #${c.server}`;
}

