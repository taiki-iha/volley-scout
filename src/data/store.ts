import type { ConditionThresholds, Match, MatchEvent, OpponentTeam, Player, Reception } from '../core/types';

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Unsub = () => void;
export interface Settings { thresholds: ConditionThresholds; }
export type NewEvent = DistributiveOmit<MatchEvent, 'id' | 'seq' | 'at'>;
export type RallyEvent = Extract<MatchEvent, { t: 'rally' }>;

export interface Store {
  readonly mode: 'local' | 'cloud';
  role(): 'admin' | 'member';
  watchPlayers(cb: (p: Player[]) => void): Unsub; savePlayer(p: Player): Promise<void>; deletePlayer(no: number): Promise<void>;
  watchOpponents(cb: (o: OpponentTeam[]) => void): Unsub; saveOpponent(o: OpponentTeam): Promise<void>; deleteOpponent(id: string): Promise<void>;
  watchMatches(cb: (m: Match[]) => void): Unsub; createMatch(m: Omit<Match, 'id' | 'createdAt'>): Promise<string>; deleteMatch(id: string): Promise<void>;
  watchEvents(matchId: string, cb: (e: MatchEvent[]) => void): Unsub; // seq 昇順で渡す
  appendEvent(matchId: string, e: NewEvent): Promise<void>; // seq = 現在の最大 seq + 1、id = seq を10桁ゼロ埋め
  undoLast(matchId: string): Promise<void>; // 最大 seq のイベントを削除
  updateEvent(matchId: string, id: string, patch: Partial<Pick<RallyEvent, 'player' | 'play' | 'zone' | 'blocker'>>): Promise<void>;
  watchReceptions(matchId: string, cb: (r: Reception[]) => void): Unsub; saveReception(matchId: string, r: Reception): Promise<void>;
  watchSettings(cb: (s: Settings) => void): Unsub; saveSettings(s: Settings): Promise<void>;
}
