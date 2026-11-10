import { hitPosition, positionOf, type HitPos } from '../core/court';
import { replay } from '../core/replay';
import type { LandPoint, MatchData, MatchEvent, Side } from '../core/types';

/**
 * コース図の1点。side = 打った側（落下点は相手 = 守る側のコート）。
 * land は守る側のチーム座標。kill は打った位置（hit）と打った選手のポジション（fromPos、矢印の始点用）を持つ。
 */
export interface CourseMark {
  kind: 'kill' | 'ace';
  side: Side;
  player: number;
  land: LandPoint;
  hit: HitPos | null;        // kill のみ（コートにいなかった等で不明なら null）
  fromPos: number | null;    // kill のみ。ラリー時点のポジション 1〜6
}

type Rally = Extract<MatchEvent, { t: 'rally' }>;

/**
 * side のチームのスパイク決定・サービスエースのうち、落下点（land）が記録されているもの。
 * replay に採用されたラリーだけ（セット終了後に無視されたものは除く）。打った位置はそのラリー時点の並びから求める。
 */
export function courseMarks(data: MatchData[], side: Side): CourseMark[] {
  const out: CourseMark[] = [];
  for (const m of data) {
    const byId = new Map<string, Rally>();
    for (const e of m.events) if (e.t === 'rally') byId.set(e.id, e);
    for (const ctx of replay(m.cfg, m.events).rallies) {
      const ev = byId.get(ctx.eventId);
      if (!ev || ev.side !== side || ev.player === null) continue;
      const land = ev.land ?? null;
      if (land === null) continue;
      if (ev.play === 'spike_kill') {
        const lineup = side === 'us' ? ctx.usLineup : ctx.themLineup;
        out.push({ kind: 'kill', side, player: ev.player, land, hit: hitPosition(lineup, ev.player), fromPos: positionOf(lineup, ev.player) });
      } else if (ev.play === 'serve_ace') {
        out.push({ kind: 'ace', side, player: ev.player, land, hit: null, fromPos: null });
      }
    }
  }
  return out;
}

/** コース図の選手の選択肢（印のある選手の背番号、昇順） */
export function coursePlayers(marks: CourseMark[]): number[] {
  return [...new Set(marks.map((m) => m.player))].sort((a, b) => a - b);
}
