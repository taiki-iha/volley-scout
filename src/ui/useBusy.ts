import { useRef, useState } from 'preact/hooks';

/** 書き込み中の二重送信を防ぐ。run は実行中なら無視され、終了時（成功・失敗とも）に busy を解除する。 */
export function useBusy(): [boolean, (f: () => Promise<void>) => Promise<void>] {
  const flag = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => {
    if (flag.current) return;
    flag.current = true;
    setBusy(true);
    try { await f(); } finally { flag.current = false; setBusy(false); }
  };
  return [busy, run];
}
