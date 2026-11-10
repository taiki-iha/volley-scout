import { HIT_LABEL, HIT_POSITIONS, attackOrigin, toSvg, type HitPos } from '../core/court';
import { setterRotation } from '../core/rotation';
import type { Match, MatchEvent, OpponentTeam, Player, Side, Zone } from '../core/types';
import type { CourseMark } from '../stats/course';
import type { OpponentScorer, ServerReception } from '../stats/opponent';
import type { PlayerStats } from '../stats/player';
import type { RotationStats } from '../stats/rotation';

export type KindFilter = 'all' | 'practice' | 'official';
export type CsvRow = Record<string, string | number | null>;

export const KIND_LABEL: Record<KindFilter, string> = { all: 'すべて', practice: '練習試合', official: '公式戦' };
export const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];

/** 割合（0〜1）を小数1桁の % にする。null は「-」 */
export function fmtPct(v: number | null): string {
  return v === null ? '-' : `${(v * 100).toFixed(1)}%`;
}

/** 数値の小数1桁（% ではない値用）。null は「-」 */
export function fmtNum(v: number | null): string {
  return v === null ? '-' : v.toFixed(1);
}

/** 期間（YYYY-MM-DD、両端を含む。空文字は無制限）と種別で絞り込む。新しい順に並べる */
export function filterMatches(
  matches: Match[],
  f: { from: string; to: string; kind: KindFilter; opponentId?: string },
): Match[] {
  return matches
    .filter((m) => (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to)
      && (f.kind === 'all' || m.kind === f.kind)
      && (f.opponentId === undefined || m.opponentId === f.opponentId))
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

export type CsvTable = '選手別' | 'ローテ別' | '相手得点' | '相手サーバー別' | '相手スタメン';

/** volley_<種類>_<日付YYYYMMDD>.csv（種類 = 出力する表） */
export function csvFileName(table: CsvTable, now: Date): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `volley_${table}_${y}${mo}${d}.csv`;
}

export function playerLabel(no: number, players: Player[]): string {
  const p = players.find((x) => x.no === no);
  return p ? `${no} ${p.name}` : `${no}`;
}

export function opponentLabel(no: number, team: OpponentTeam | undefined): string {
  const p = team?.players.find((x) => x.no === no);
  return p && p.name ? `${no} ${p.name}` : `${no}`;
}

export function playerRows(stats: PlayerStats[], players: Player[]): CsvRow[] {
  return stats.filter((s) => s.side === 'us').map((s) => ({
    選手: playerLabel(s.no, players),
    スパイク本数: s.spike.attempts, 決定: s.spike.kills, ミス: s.spike.errors, ブロックされ: s.spike.blocked,
    決定率: fmtPct(s.spike.killRate), 効果率: fmtPct(s.spike.efficiency),
    // 打った位置別の決定数（そのラリー時点のローテでの打った選手の位置。前衛 4/3/2 = レフト/センター/ライト、後衛 = バック）
    ...hitColumns(s.spike.killsByHit),
    サーブ本数: s.serve.total, エース: s.serve.aces, サーブミス: s.serve.errors, サーブミス率: fmtPct(s.serve.errorRate),
    ブロック得点: s.blockPoints,
    レシーブ本数: s.reception.total, A: s.reception.A, B: s.reception.B, C: s.reception.C, D: s.reception.D,
    返球率: fmtPct(s.reception.passRate), A率: fmtPct(s.reception.perfectRate),
  }));
}

/** 打った位置別の決定数の列（決定レフト・決定センター・決定ライト・決定バック） */
function hitColumns(by: Record<HitPos, number>): CsvRow {
  return Object.fromEntries(HIT_POSITIONS.map((h) => [`決定${HIT_LABEL[h]}`, by[h]]));
}

export function rotationRows(stats: RotationStats[]): CsvRow[] {
  return stats.map((r) => ({
    ローテ: `S${r.rotation}`, 得点: r.pointsWon, 失点: r.pointsLost,
    レシーブ局面: r.receiveRallies, サイドアウト: r.sideouts, サイドアウト率: fmtPct(r.sideoutRate),
    サーブ局面: r.serveRallies, ブレイク: r.breaks, ブレイク率: fmtPct(r.breakRate),
  }));
}

export function scorerRows(scorers: OpponentScorer[], team: OpponentTeam | undefined): CsvRow[] {
  return scorers.map((s) => {
    // 打った位置別（スパイク決定）と、落下ゾーン別（スパイク決定・サービスエース。自チームコートで守る側から見た番号）
    const row: CsvRow = { 選手: opponentLabel(s.no, team), 得点: s.points, ...hitColumns(s.byHit) };
    for (const z of ZONES) row[`落下ゾーン${z}`] = s.byLandZone[z];
    return row;
  });
}

export function serverRows(rows: ServerReception[], team: OpponentTeam | undefined): CsvRow[] {
  return rows.map((r) => ({
    サーバー: opponentLabel(r.server, team), 本数: r.total, A: r.A, B: r.B, C: r.C, D: r.D, 返球率: fmtPct(r.passRate),
  }));
}

/**
 * 相手のスタメン配置とローテの記録（次の対戦のため）。試合（渡した順）× セット（昇順）ごとに1行。
 * 各セットの set_start から、ポジション1〜6・セッター・リベロ・開始時のローテを出す。
 * 開始ローテはセッターが分かればセッター基準の S1〜S6、不明なら開始順の番号 R1。
 */
export function opponentLineupRows(items: { match: Match; events: MatchEvent[] }[], team: OpponentTeam | undefined): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const { match, events } of items) {
    // 同じセット番号の set_start が複数あれば最後（seq 最大）のものを使う（replay と同じ）
    const bySet = new Map<number, Extract<MatchEvent, { t: 'set_start' }>>();
    for (const e of [...events].sort((a, b) => a.seq - b.seq)) if (e.t === 'set_start') bySet.set(e.set, e);
    for (const set of [...bySet.keys()].sort((a, b) => a - b)) {
      const e = bySet.get(set)!;
      const lineup = e.lineups.them;
      const setter = e.setters.them ?? null;
      const r = setterRotation(lineup, setter);
      const row: CsvRow = { 日付: match.date, セット: set };
      lineup.forEach((no, i) => { row[`ポジション${i + 1}`] = opponentLabel(no, team); });
      row.セッター = setter === null ? '不明' : opponentLabel(setter, team);
      row.リベロ = e.liberos.them.length ? e.liberos.them.map((no) => opponentLabel(no, team)).join('・') : 'なし';
      row.開始ローテ = r === null ? 'R1' : `S${r}`;
      rows.push(row);
    }
  }
  return rows;
}


// ---------- コース図 ----------

/** 打った位置ごとの矢印の色（凡例と同じ）。位置不明は灰色 */
export const HIT_COLOR: Record<HitPos | 'unknown', string> = {
  left: '#2a6fdb', center: '#e67e22', right: '#8e44ad', back: '#16a085', unknown: '#7f8c8d',
};

/** SVG に描く1つの印。座標は m（core/court.ts toSvg: 相手コート x 0〜9、自チーム x 9〜18、画面と同じ向き） */
export interface CourseShape {
  kind: 'kill' | 'ace';
  player: number;
  to: { x: number; y: number };                 // 落下点
  from: { x: number; y: number } | null;        // 矢印の始点（打った位置。不明・エースは null）
  color: string;
}

/** コース図の印。player を指定するとその選手だけ。落下点は守る側（打った側の相手）のコートに描く */
export function courseShapes(marks: CourseMark[], player: number | null): CourseShape[] {
  return marks
    .filter((m) => player === null || m.player === player)
    .map((m) => {
      const def: Side = m.side === 'us' ? 'them' : 'us';
      return {
        kind: m.kind, player: m.player,
        to: toSvg(def, m.land),
        from: m.kind === 'kill' && m.fromPos !== null ? toSvg(m.side, attackOrigin(m.fromPos)) : null,
        color: m.kind === 'ace' ? '#c0392b' : HIT_COLOR[m.hit ?? 'unknown'],
      };
    });
}
