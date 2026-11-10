import { useEffect, useState } from 'preact/hooks';

/** 現在時刻（ミリ秒）。intervalMs ごとに更新して再描画する。この hook を使う小さな部品だけが毎秒描き直される */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
