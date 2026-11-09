import { replay } from '../core/replay';
import type { Grade, MatchConfig, MatchData, MatchEvent, PlayKind, Side, Zone } from '../core/types';
import { ratio } from './player';

export interface OpponentScorer { no: number; points: number; byZone: Record<Zone, number>; byPlay: Partial<Record<PlayKind, number>>; }
export interface ServerReception { server: number; total: number; A: number; B: number; C: number; D: number; passRate: number | null; }
export interface ReceptionRow { rallyId: string; set: number; scoreBefore: Record<Side, number>; server: number; usRotation: number | null; preset: Grade | null; }

type RallyEvent = Extract<MatchEvent, { t: 'rally' }>;

// replay に採用されたラリーだけを時系列順に返す（セット終了後に無視されたものは除外）
function validRallies(cfg: MatchConfig, events: MatchEvent[]) {
  const byId = new Map<string, RallyEvent>();
  for (const e of events) if (e.t === 'rally') byId.set(e.id, e);
  const out: { ctx: ReturnType<typeof replay>['rallies'][number]; ev: RallyEvent }[] = [];
  for (const ctx of replay(cfg, events).rallies) {
    const ev = byId.get(ctx.eventId);
    if (ev) out.push({ ctx, ev });
  }
  return out;
}

export function opponentScorers(data: MatchData[]): OpponentScorer[] {
  const map = new Map<number, OpponentScorer>();
  for (const m of data) {
    for (const { ev } of validRallies(m.cfg, m.events)) {
      if (ev.side !== 'them' || ev.pointTo !== 'them' || ev.player === null) continue;
      let s = map.get(ev.player);
      if (!s) {
        s = { no: ev.player, points: 0, byZone: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }, byPlay: {} };
        map.set(ev.player, s);
      }
      s.points++;
      if (ev.zone !== null) s.byZone[ev.zone]++;
      s.byPlay[ev.play] = (s.byPlay[ev.play] ?? 0) + 1;
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || a.no - b.no);
}

export function receptionByOpponentServer(data: MatchData[]): ServerReception[] {
  const map = new Map<number, Record<Grade, number> & { server: number }>();
  for (const m of data) {
    const server = new Map<string, number>();
    for (const { ctx } of validRallies(m.cfg, m.events)) {
      if (ctx.serving === 'them') server.set(ctx.eventId, ctx.server);
    }
    for (const rc of m.receptions) {
      const sv = server.get(rc.rallyId);
      if (sv === undefined) continue;
      let a = map.get(sv);
      if (!a) {
        a = { server: sv, A: 0, B: 0, C: 0, D: 0 };
        map.set(sv, a);
      }
      a[rc.grade]++;
    }
  }
  return [...map.values()]
    .sort((x, y) => x.server - y.server)
    .map((a) => {
      const total = a.A + a.B + a.C + a.D;
      return { server: a.server, total, A: a.A, B: a.B, C: a.C, D: a.D, passRate: ratio(a.A + a.B, total) };
    });
}

// 相手サーブのラリー（サーブミス除く）。相手のサーブエースは preset 'D'
export function receptionRows(cfg: MatchConfig, events: MatchEvent[]): ReceptionRow[] {
  const rows: ReceptionRow[] = [];
  for (const { ctx, ev } of validRallies(cfg, events)) {
    if (ctx.serving !== 'them' || ev.play === 'serve_error') continue;
    rows.push({
      rallyId: ctx.eventId, set: ctx.set, scoreBefore: ctx.scoreBefore, server: ctx.server,
      usRotation: ctx.usRotation, preset: ev.play === 'serve_ace' ? 'D' : null,
    });
  }
  return rows;
}
