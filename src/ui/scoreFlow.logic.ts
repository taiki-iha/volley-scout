import { replay } from '../core/replay';
import { isSetOver } from '../core/rules';
import type { MatchConfig, MatchEvent, Side } from '../core/types';

/** 得点経過の1列（1ラリー）。取った側の段にその時点の得点、もう一方は null */
export interface FlowColumn { eventId: string; us: number | null; them: number | null; runOf: Side | null }
/** タイムアウト・選手交代の印。afterColumn = その時点までに入っていた列の数（0 = 最初の得点より前） */
export interface FlowMarker { afterColumn: number; kind: 'timeout' | 'sub'; side: Side }
export interface SetFlow {
  set: number; columns: FlowColumn[]; markers: FlowMarker[];
  score: Record<Side, number>; over: boolean; winner: Side | null;
}

/** 連続得点（同じチームが2点以上続けて取った）の列に、そのチームを入れる */
function markRuns(cols: FlowColumn[]): void {
  let i = 0;
  while (i < cols.length) {
    const side: Side = cols[i].us !== null ? 'us' : 'them';
    let j = i;
    while (j < cols.length && (cols[j].us !== null ? 'us' : 'them') === side) j++;
    if (j - i >= 2) for (let k = i; k < j; k++) cols[k].runOf = side;
    i = j;
  }
}

/**
 * セットごとの得点経過（テレビ中継の「得点経過」）。replay が実際に適用したラリーだけを数える
 * （セット終了後のラリーは数えない）。リベロの入れ替えは印にしない。
 * セット番号の再開始は replay と同じく、その時点で最新の同じ番号のセットに入れる。
 */
export function scoreFlow(cfg: MatchConfig, events: MatchEvent[]): SetFlow[] {
  const state = replay(cfg, events);
  const applied = new Set(state.rallies.map((r) => r.eventId));
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const flows: SetFlow[] = [];
  const target = (set: number): SetFlow | undefined => {
    for (let i = flows.length - 1; i >= 0; i--) if (flows[i].set === set) return flows[i];
    return undefined;
  };
  for (const e of sorted) {
    if (e.t === 'set_start') {
      flows.push({ set: e.set, columns: [], markers: [], score: { us: 0, them: 0 }, over: false, winner: null });
      continue;
    }
    const f = target(e.set);
    if (!f || f.over) continue;
    if (e.t === 'rally') {
      if (!applied.has(e.id)) continue;
      const score = { ...f.score, [e.pointTo]: f.score[e.pointTo] + 1 };
      f.score = score;
      f.columns.push({ eventId: e.id, us: e.pointTo === 'us' ? score.us : null, them: e.pointTo === 'them' ? score.them : null, runOf: null });
      if (isSetOver(cfg, f.set, score.us, score.them)) {
        f.over = true;
        f.winner = score.us > score.them ? 'us' : 'them';
      }
    } else if (e.t === 'timeout' || e.t === 'sub') {
      f.markers.push({ afterColumn: f.columns.length, kind: e.t, side: e.side });
    }
  }
  for (const f of flows) markRuns(f.columns);
  return flows;
}
