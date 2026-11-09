import type { ConditionThresholds, Match, MatchEvent, OpponentTeam, Player, Reception } from '../core/types';

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Unsub = () => void;
export interface Settings { thresholds: ConditionThresholds; }
export type NewEvent = DistributiveOmit<MatchEvent, 'id' | 'seq' | 'at'>;
export type RallyEvent = Extract<MatchEvent, { t: 'rally' }>;
export type AttemptEvent = Extract<MatchEvent, { t: 'attempt' }>;
export type RallyPatch = Partial<Pick<RallyEvent, 'player' | 'play' | 'zone' | 'blocker'>>;
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
