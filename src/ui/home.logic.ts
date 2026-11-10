// ホーム画面（試合一覧）の判断ロジック（画面から切り出してテストする）
import type { Match } from '../core/types';

/** 端末の現地時刻での今日（YYYY-MM-DD） */
export function localDate(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 終わった試合として扱うか（試合日が今日より前）。
 * 終わった試合は「見る」（閲覧モード）を主ボタンにして、入力モードの「1つ戻す」で古い記録を消す誤操作を防ぐ。
 * 一覧で全試合のイベントを読まずに済むよう、日付だけで判断する（当日の試合は入力を主にする）。
 */
export function isPastMatch(m: Pick<Match, 'date'>, today: string): boolean {
  return m.date < today;
}

/** 試合を削除できないときの理由（できるなら null）。クラウドでは削除時に記録の一覧をサーバーから読むのでオンライン必須 */
export function deleteBlockedReason(mode: 'local' | 'cloud', online: boolean): string | null {
  return mode === 'cloud' && !online ? 'オンラインのときに削除してください' : null;
}
