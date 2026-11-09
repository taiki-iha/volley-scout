// 試合後のレシーブ入力・記録修正画面の判断ロジック（画面から切り出してテストする）
import type { Grade, Lineup, MatchEvent, PlayKind, Reception } from '../core/types';
import type { ReceptionRow } from '../stats/opponent';
import { PLAY_ORDER, isScoring } from './live.logic';

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
