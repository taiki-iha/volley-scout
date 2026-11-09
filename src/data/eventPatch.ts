import type { MatchEvent, PlayKind } from '../core/types';
import type { EventPatch, NewEvent } from './store';

// memoryStore と firestoreStore で共通のイベント操作（純粋関数）

const SCORING: PlayKind[] = ['spike_kill', 'serve_ace', 'block_point', 'other_point'];
const isScoring = (p: PlayKind) => SCORING.includes(p);

/** 現在の最大 seq（イベントなしなら 0） */
export const maxSeq = (list: readonly MatchEvent[]): number => list.reduce((m, x) => Math.max(m, x.seq), 0);

/** id = seq を10桁ゼロ埋め */
export const eventId = (seq: number): string => String(seq).padStart(10, '0');

/**
 * クラウド版のイベント id = seq を10桁ゼロ埋め + '-' + ランダムな接尾辞。
 * 端末のキャッシュが古くて既存と同じ seq になっても、別ドキュメントになるので他のイベントを上書きしない。
 * 10桁ゼロ埋めなので id の文字列順は seq 順と一致する。
 */
export const cloudEventId = (seq: number, suffix: string): string => `${eventId(seq)}-${suffix}`;

/** ランダムな接尾辞（英小文字と数字 8 文字） */
export function randomSuffix(rand: () => number = Math.random): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}

/** イベントの並び順: seq 昇順、同じ seq なら id 昇順（どの端末でも同じ順になる） */
export function compareEvents(a: MatchEvent, b: MatchEvent): number {
  return a.seq - b.seq || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export const sortEvents = (list: readonly MatchEvent[]): MatchEvent[] => [...list].sort(compareEvents);

/** 次に追加するイベント（seq = 最大 seq + 1、id は makeId(seq)。既定は10桁ゼロ埋め） */
export function buildNextEvent(
  list: readonly MatchEvent[], e: NewEvent, at: number, makeId: (seq: number) => string = eventId,
): MatchEvent {
  const seq = maxSeq(list) + 1;
  return { ...e, seq, id: makeId(seq), at } as MatchEvent;
}

/** undoLast で消す対象（並び順で最後 = 最大の (seq, id) のイベント）。なければ null */
export function lastEvent(list: readonly MatchEvent[]): MatchEvent | null {
  return list.reduce<MatchEvent | null>((m, x) => (m === null || compareEvents(x, m) > 0 ? x : m), null);
}

/**
 * updateEvent の修正内容を検証して適用した新しいイベントを返す。
 * - rally: player/play/zone/blocker のみ。得点↔ミスが入れ替わる play 変更は不可。pointTo は不変。
 * - attempt: player/zone のみ。
 * - それ以外の種類は修正不可。undefined の値は無視する。
 */
export function applyEventPatch(cur: MatchEvent, patch: EventPatch): MatchEvent {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Record<string, unknown>;
  if (cur.t === 'rally') {
    const allowed = ['player', 'play', 'zone', 'blocker'];
    if (Object.keys(clean).some((k) => !allowed.includes(k))) throw new Error('この項目は修正できません');
    const play = clean.play as PlayKind | undefined;
    if (play !== undefined && isScoring(play) !== isScoring(cur.play)) throw new Error('点数が変わる修正はできません');
    return { ...cur, ...clean, pointTo: cur.pointTo } as MatchEvent;
  }
  if (cur.t === 'attempt') {
    if (Object.keys(clean).some((k) => k !== 'player' && k !== 'zone')) throw new Error('この項目は修正できません');
    return { ...cur, ...clean } as MatchEvent;
  }
  throw new Error('このイベントは修正できません');
}
