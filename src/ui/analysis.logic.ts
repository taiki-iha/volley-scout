import { setterRotation } from '../core/rotation';
import type { Match, MatchEvent, OpponentTeam, Player, Zone } from '../core/types';
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
    // ゾーン別の決定数（相手得点の表と同じくゾーンごとに1列。サーブの列と紛れないよう「決定」を付ける）
    ...Object.fromEntries(ZONES.map((z) => [`決定ゾーン${z}`, s.spike.killsByZone[z]])),
    サーブ本数: s.serve.total, エース: s.serve.aces, サーブミス: s.serve.errors, サーブミス率: fmtPct(s.serve.errorRate),
    ブロック得点: s.blockPoints,
    レシーブ本数: s.reception.total, A: s.reception.A, B: s.reception.B, C: s.reception.C, D: s.reception.D,
    返球率: fmtPct(s.reception.passRate), A率: fmtPct(s.reception.perfectRate),
  }));
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
    const row: CsvRow = { 選手: opponentLabel(s.no, team), 得点: s.points };
    for (const z of ZONES) row[`ゾーン${z}`] = s.byZone[z];
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

