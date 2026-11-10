export type Side = 'us' | 'them';
export type Position = 'S' | 'OH' | 'MB' | 'OP' | 'L';
export interface Player { no: number; name: string; position: Position; }
export interface OpponentPlayer { no: number; name: string; position: Position | null; } // 名前は '' 可、ポジション不明は null
export interface OpponentTeam { id: string; name: string; players: OpponentPlayer[]; }
export type Lineup = [number, number, number, number, number, number]; // index0=ポジション1 … index5=ポジション6（背番号）
export interface MatchConfig { format: 'bestOf' | 'fixed'; sets: number; points: number; finalSetPoints: number; }
export interface Match { id: string; date: string; kind: 'practice' | 'official'; opponentId: string; tournament: string; config: MatchConfig; createdAt: number; }

export type PlayKind =
  | 'spike_kill' | 'spike_error' | 'spike_blocked' | 'serve_ace' | 'serve_error'
  | 'block_point' | 'other_point' | 'other_error';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;
/**
 * 落下点。守る側のコート上の正規化座標（0〜1）で、守る側の選手がネットを向いて見た向き:
 * x = 0 が守る側の左サイドライン・1 が右サイドライン、y = 0 がネット・1 がエンドライン（詳しくは core/court.ts）。
 */
export interface LandPoint { x: number; y: number }

interface Base { id: string; seq: number; set: number; at: number; }
export type MatchEvent =
  | (Base & { t: 'set_start'; lineups: Record<Side, Lineup>; setters: Record<Side, number | null>; liberos: Record<Side, number[]>; firstServe: Side })
  // zone = 守る側コートの落下ゾーン（スパイク決定・サービスエースのみ。それ以外は null）。land = タップした落下点（不明・旧データは null）。
  // 打った位置（レフト等）は保存せず、分析でそのラリー時点の並びから求める（core/court.ts hitPosition）。
  | (Base & { t: 'rally'; side: Side | null; player: number | null; play: PlayKind; zone: Zone | null; land: LandPoint | null; blocker: number | null; pointTo: Side })
  | (Base & { t: 'attempt'; side: Side; player: number; zone: Zone | null })      // スパイク（継続）。zone は使わない（v1.1 から null で記録）
  | (Base & { t: 'sub'; side: Side; out: number; in: number })
  | (Base & { t: 'libero'; side: Side; out: number; in: number })
  | (Base & { t: 'timeout'; side: Side });

export type Grade = 'A' | 'B' | 'C' | 'D';
export interface Reception { rallyId: string; receiver: number | null; grade: Grade; }
export interface ConditionThresholds { minSpikes: number; maxKillRate: number; maxServeErrorsPerSet: number; } // 既定 5 / 0.3 / 2
export interface MatchData { cfg: MatchConfig; events: MatchEvent[]; receptions: Reception[]; }
