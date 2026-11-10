import type { ConditionThresholds, OpponentPlayer, Player, Position } from '../core/types';

export const POSITIONS: Position[] = ['S', 'OH', 'MB', 'OP', 'L'];
export const POSITION_LABEL: Record<Position, string> = {
  S: 'S（セッター）', OH: 'OH（アウトサイド）', MB: 'MB（ミドル）', OP: 'OP（オポジット）', L: 'L（リベロ）',
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseJerseyNo(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  return Number(t);
}

/** 自チーム選手の入力チェック。editingNo は編集中の選手の元の背番号（重複判定から除く） */
export function validatePlayer(
  input: { no: string; name: string; position: Position },
  existing: Player[],
  editingNo: number | null,
): Result<Player> {
  const no = parseJerseyNo(input.no);
  if (no === null) return { ok: false, error: '背番号は0〜999の整数で入力してください' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: '名前を入力してください' };
  if (existing.some((p) => p.no === no && p.no !== editingNo)) return { ok: false, error: `背番号${no}は既に登録されています` };
  return { ok: true, value: { no, name, position: input.position } };
}

/** 相手選手の入力チェック（背番号必須・名前任意・ポジション任意） */
export function validateOpponentPlayer(
  input: { no: string; name: string; position: Position | '' },
  existing: OpponentPlayer[],
  editingNo: number | null,
): Result<OpponentPlayer> {
  const no = parseJerseyNo(input.no);
  if (no === null) return { ok: false, error: '背番号は0〜999の整数で入力してください' };
  if (existing.some((p) => p.no === no && p.no !== editingNo)) return { ok: false, error: `背番号${no}は既に登録されています` };
  return { ok: true, value: { no, name: input.name.trim(), position: input.position === '' ? null : input.position } };
}

export function toPercent(rate: number): number { return Math.round(rate * 1000) / 10; }
export function fromPercent(pct: number): number { return Math.round(pct * 10) / 1000; }

/** 設定画面の入力（文字列）を ConditionThresholds に変換。killRate は % 入力。 */
export function parseThresholds(input: { minSpikes: string; maxKillRatePct: string; maxServeErrorsPerSet: string }): Result<ConditionThresholds> {
  const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const minSpikes = int(input.minSpikes);
  if (!(minSpikes >= 1)) return { ok: false, error: 'スパイク本数は1以上の整数にしてください' };
  const pctText = input.maxKillRatePct.trim();
  const pct = /^\d+(\.\d+)?$/.test(pctText) ? Number(pctText) : NaN;
  if (!(pct >= 0 && pct <= 100)) return { ok: false, error: '決定率は0〜100の数値（%）にしてください' };
  const maxServeErrorsPerSet = int(input.maxServeErrorsPerSet);
  if (!(maxServeErrorsPerSet >= 1)) return { ok: false, error: 'サーブミス数は1以上の整数にしてください' };
  return { ok: true, value: { minSpikes, maxKillRate: fromPercent(pct), maxServeErrorsPerSet } };
}

/** タイムアウトの長さ（秒）の入力。10〜120 の整数 */
export function parseTimeoutSec(raw: string): Result<number> {
  const t = raw.trim();
  const n = /^\d{1,4}$/.test(t) ? Number(t) : NaN;
  if (!(n >= 10 && n <= 120)) return { ok: false, error: 'タイムアウトの長さは10〜120の整数（秒）にしてください' };
  return { ok: true, value: n };
}
