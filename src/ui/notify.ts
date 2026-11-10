// 画面上部に出す、操作を止めないエラーメッセージ
import { errorText } from '../data/firebaseError';

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
// 表示中のメッセージ。バナーが購読する前（起動直後など）に出したものも、購読した時点で表示する
let current: string | null = null;

function emit(msg: string | null): void {
  current = msg;
  listeners.forEach((f) => f(msg));
}

export function showError(e: unknown, prefix = '保存できませんでした'): void {
  emit(`${prefix}: ${errorText(e)}`);
}
/** 接頭辞なしでそのまま出す */
export function showMessage(msg: string): void { emit(msg); }
export function clearError(): void { emit(null); }
export function onMessage(f: Listener): () => void {
  listeners.add(f);
  if (current !== null) f(current);
  return () => { listeners.delete(f); };
}
/** ストアの書き込み Promise を渡す。失敗したらバナーに出す。 */
export function report(p: Promise<unknown>): Promise<boolean> {
  return p.then(() => true, (e) => { showError(e); return false; });
}
