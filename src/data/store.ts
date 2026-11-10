import { DEFAULT_THRESHOLDS } from '../core/condition';
import type { ConditionThresholds, Match, MatchEvent, OpponentTeam, Player, Reception } from '../core/types';

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Unsub = () => void;
/**
 * チームの設定。timeoutSec / timeoutSound は後から追加した項目なので、
 * 保存済みの古い設定（thresholds だけ）を読むときは normalizeSettings で既定値を補う。
 */
export interface Settings {
  thresholds: ConditionThresholds;
  timeoutSec: number;      // タイムアウトの長さ（秒）。既定 30、10〜120 の整数
  timeoutSound: boolean;   // タイムアウト終了を音で知らせる（既定 on）
}
export const DEFAULT_TIMEOUT_SEC = 30;
export const DEFAULT_SETTINGS: Settings = { thresholds: DEFAULT_THRESHOLDS, timeoutSec: DEFAULT_TIMEOUT_SEC, timeoutSound: true };

/** 保存済みの設定（古い形式・欠けた項目・範囲外の値を含みうる）を、既定値で補った Settings にする */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const th = (r.thresholds && typeof r.thresholds === 'object' ? r.thresholds : {}) as Partial<ConditionThresholds>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const sec = r.timeoutSec;
  return {
    thresholds: {
      minSpikes: num(th.minSpikes, DEFAULT_THRESHOLDS.minSpikes),
      maxKillRate: num(th.maxKillRate, DEFAULT_THRESHOLDS.maxKillRate),
      maxServeErrorsPerSet: num(th.maxServeErrorsPerSet, DEFAULT_THRESHOLDS.maxServeErrorsPerSet),
    },
    timeoutSec: typeof sec === 'number' && Number.isInteger(sec) && sec >= 10 && sec <= 120 ? sec : DEFAULT_TIMEOUT_SEC,
    timeoutSound: typeof r.timeoutSound === 'boolean' ? r.timeoutSound : true,
  };
}
export type NewEvent = DistributiveOmit<MatchEvent, 'id' | 'seq' | 'at'>;
export type RallyEvent = Extract<MatchEvent, { t: 'rally' }>;
export type AttemptEvent = Extract<MatchEvent, { t: 'attempt' }>;
export type RallyPatch = Partial<Pick<RallyEvent, 'player' | 'play' | 'zone' | 'land' | 'blocker'>>;
export type AttemptPatch = Partial<Pick<AttemptEvent, 'player' | 'zone'>>;
export type EventPatch = RallyPatch | AttemptPatch;

export interface Store {
  readonly mode: 'local' | 'cloud';
  role(): 'admin' | 'member';
  watchPlayers(cb: (p: Player[]) => void): Unsub; savePlayer(p: Player): Promise<void>; deletePlayer(no: number): Promise<void>;
  watchOpponents(cb: (o: OpponentTeam[]) => void): Unsub; saveOpponent(o: OpponentTeam): Promise<void>; deleteOpponent(id: string): Promise<void>;
  watchMatches(cb: (m: Match[]) => void): Unsub; createMatch(m: Omit<Match, 'id' | 'createdAt'>): Promise<string>; deleteMatch(id: string): Promise<void>;
  watchEvents(matchId: string, cb: (e: MatchEvent[]) => void): Unsub; // seq 昇順（同じ seq は id 昇順）で渡す
  appendEvent(matchId: string, e: NewEvent): Promise<void>; // seq = 現在の最大 seq + 1、id = seq を10桁ゼロ埋め（クラウド版は末尾に '-ランダム' が付く）
  undoLast(matchId: string): Promise<void>; // 最後のイベント（最大の seq、同じ seq なら最大の id）を削除
  updateEvent(matchId: string, id: string, patch: EventPatch): Promise<void>;
  watchReceptions(matchId: string, cb: (r: Reception[]) => void): Unsub; saveReception(matchId: string, r: Reception): Promise<void>;
  watchSettings(cb: (s: Settings) => void): Unsub; saveSettings(s: Settings): Promise<void>;
}
