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

/** intervalMs ごとに再描画だけ起こす。null の間は止める（時刻は描画時に Date.now() で読む） */
export function useTicker(intervalMs: number | null): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (intervalMs === null) return;
    const id = setInterval(() => setN((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
