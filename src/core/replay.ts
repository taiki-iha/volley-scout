import type { Lineup, MatchConfig, MatchEvent, Side } from './types';
import { rotate, server, isFrontRow, replacePlayer, setterRotation } from './rotation';
import { isSetOver, isMatchOver } from './rules';

export interface SetState {
  set: number; score: Record<Side, number>; serving: Side;
  lineups: Record<Side, Lineup>; setters: Record<Side, number | null>; liberos: Record<Side, number[]>;
  subsUsed: Record<Side, number>; timeouts: Record<Side, number>;
  rotations: Record<Side, number>;  // セット開始からのローテーション回数（セッター不明時の「開始順の番号」用）
  over: boolean; winner: Side | null;
}
export interface RallyContext {           // 各 rally イベント時点（得点前）の状況。分析で使う
  eventId: string; set: number; serving: Side; server: number;
  usRotation: number | null; themRotation: number | null;  // setterRotation の値
  usLineup: Lineup; themLineup: Lineup; scoreBefore: Record<Side, number>;
}
export interface MatchState {
  sets: SetState[]; current: SetState | null; setsWon: Record<Side, number>; matchOver: boolean;
  rallies: RallyContext[]; warnings: string[];  // 現在セットの警告（日本語文）
}

const LABEL: Record<Side, string> = { us: '自チーム', them: '相手チーム' };

function warningsFor(s: SetState): string[] {
  const w: string[] = [];
  for (const side of ['us', 'them'] as Side[]) {
    if (s.subsUsed[side] >= 7) w.push(`${LABEL[side]}の交代が6回を超えています`);
    if (s.timeouts[side] >= 3) w.push(`${LABEL[side]}: ${s.timeouts[side]}回目のタイムアウトです（ルールでは2回まで）`);
  }
  for (const no of s.liberos.us) {
    if (isFrontRow(s.lineups.us, no)) w.push(`リベロ #${no} が前衛にいます`);
  }
  return w;
}

// events は seq 昇順を前提にせず、内部で seq ソートする
export function replay(cfg: MatchConfig, events: MatchEvent[]): MatchState {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const sets: SetState[] = [];
  const setsWon: Record<Side, number> = { us: 0, them: 0 };
  const rallies: RallyContext[] = [];

  const update = (e: MatchEvent, f: (s: SetState) => SetState): void => {
    let i = sets.length - 1;  // 同じセット番号が再開始された場合は最新を対象にする
    while (i >= 0 && sets[i].set !== e.set) i--;
    if (i < 0) return;
    sets[i] = f(sets[i]);
  };

  for (const e of sorted) {
    switch (e.t) {
      case 'set_start':
        sets.push({
          set: e.set, score: { us: 0, them: 0 }, serving: e.firstServe,
          lineups: { us: [...e.lineups.us] as Lineup, them: [...e.lineups.them] as Lineup },
          setters: { ...e.setters }, liberos: { us: [...e.liberos.us], them: [...e.liberos.them] },
          subsUsed: { us: 0, them: 0 }, timeouts: { us: 0, them: 0 }, rotations: { us: 0, them: 0 },
          over: false, winner: null,
        });
        break;
      case 'rally':
        update(e, (s) => {
          if (s.over) return s;
          rallies.push({
            eventId: e.id, set: s.set, serving: s.serving, server: server(s.lineups[s.serving]),
            usRotation: setterRotation(s.lineups.us, s.setters.us ?? null),
            themRotation: setterRotation(s.lineups.them, s.setters.them ?? null),
            usLineup: s.lineups.us, themLineup: s.lineups.them, scoreBefore: { ...s.score },
          });
          const to = e.pointTo;
          const score = { ...s.score, [to]: s.score[to] + 1 };
          const sideout = to !== s.serving;
          const lineups = sideout ? { ...s.lineups, [to]: rotate(s.lineups[to]) } : s.lineups;
          const rotations = sideout ? { ...s.rotations, [to]: s.rotations[to] + 1 } : s.rotations;
          const over = isSetOver(cfg, s.set, score.us, score.them);
          const winner: Side | null = over ? (score.us > score.them ? 'us' : 'them') : null;
          if (winner) setsWon[winner]++;
          return { ...s, score, lineups, rotations, serving: to, over, winner };
        });
        break;
      case 'sub':
        update(e, (s) => ({
          ...s,
          lineups: { ...s.lineups, [e.side]: replacePlayer(s.lineups[e.side], e.out, e.in) },
          setters: s.setters[e.side] === e.out ? { ...s.setters, [e.side]: e.in } : s.setters,
          subsUsed: { ...s.subsUsed, [e.side]: s.subsUsed[e.side] + 1 },
        }));
        break;
      case 'libero':
        update(e, (s) => ({
          ...s, lineups: { ...s.lineups, [e.side]: replacePlayer(s.lineups[e.side], e.out, e.in) },
        }));
        break;
      case 'timeout':
        update(e, (s) => ({ ...s, timeouts: { ...s.timeouts, [e.side]: s.timeouts[e.side] + 1 } }));
        break;
      case 'attempt':
        break;
    }
  }

  const current = sets.length ? sets[sets.length - 1] : null;
  const finished = sets.filter((s) => s.over).length;
  return {
    sets, current, setsWon, matchOver: isMatchOver(cfg, setsWon, finished),
    rallies, warnings: current ? warningsFor(current) : [],
  };
}
