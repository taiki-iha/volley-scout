// 画面上部に出す、操作を止めないエラーメッセージ
type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();

export function showError(e: unknown, prefix = '保存できませんでした'): void {
  const detail = e instanceof Error ? e.message : String(e);
  listeners.forEach((f) => f(`${prefix}: ${detail}`));
}
export function clearError(): void { listeners.forEach((f) => f(null)); }
export function onMessage(f: Listener): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
/** ストアの書き込み Promise を渡す。失敗したらバナーに出す。 */
export function report(p: Promise<unknown>): Promise<boolean> {
  return p.then(() => true, (e) => { showError(e); return false; });
}
