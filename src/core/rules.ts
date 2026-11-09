import type { MatchConfig, PlayKind, Side } from './types';

const SCORING: PlayKind[] = ['spike_kill', 'serve_ace', 'block_point', 'other_point'];
const other = (s: Side): Side => (s === 'us' ? 'them' : 'us');

export function pointWinner(side: Side | null, play: PlayKind): Side {
  if (side === null) throw new Error('pointWinner: side is null; use pointTo directly');
  return SCORING.includes(play) ? side : other(side);
}
export function targetPoints(cfg: MatchConfig, set: number): number {
  return set === cfg.sets && cfg.format === 'bestOf' ? cfg.finalSetPoints : cfg.points;
}
export function isSetOver(cfg: MatchConfig, set: number, us: number, them: number): boolean {
  const t = targetPoints(cfg, set);
  return Math.max(us, them) >= t && Math.abs(us - them) >= 2;
}
export function setsToWin(cfg: MatchConfig): number | null {
  return cfg.format === 'bestOf' ? Math.floor(cfg.sets / 2) + 1 : null;
}
export function isMatchOver(cfg: MatchConfig, setsWon: Record<Side, number>, setsPlayed: number): boolean {
  const need = setsToWin(cfg);
  if (need === null) return setsPlayed >= cfg.sets;
  return setsWon.us >= need || setsWon.them >= need;
}
