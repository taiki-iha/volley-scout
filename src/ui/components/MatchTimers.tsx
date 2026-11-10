import { useEffect, useRef, useState } from 'preact/hooks';
import type { MatchEvent } from '../../core/types';
import { SIDE_LABEL } from '../live.logic';
import type { SetFlow } from '../scoreFlow.logic';
import { isAudioUnlocked, onAudioUnlockChange, timeoutEndAlert, unlockAudio } from '../sound';
import { TIMEOUTS_PER_SET, formatCountdown, formatElapsed, liveClock, timeoutCountdown } from '../timing.logic';
import { useNow } from '../useNow';

// 毎秒描き直すのはこのファイルの小さな部品だけ（入力画面全体は再描画しない）

/** スコアボードに出す経過時間「このセット mm:ss」「試合 mm:ss（1時間以上は h:mm:ss）」 */
export function MatchClock({ flows, matchOver }: { flows: SetFlow[]; matchOver: boolean }) {
  const now = useNow();
  const c = liveClock(flows, matchOver, now);
  if (!c) return null;
  return (
    <span class="sb-clock" aria-label="経過時間">
      <span class={c.set.running ? '' : 'stopped'}>このセット <b>{formatElapsed(c.set.ms)}</b></span>
      <span class={c.match.running ? '' : 'stopped'}>試合 <b>{formatElapsed(c.match.ms)}</b></span>
    </span>
  );
}

interface OverlayProps { events: MatchEvent[]; durationSec: number; sound: boolean }

/**
 * タイムアウトのカウントダウン（コートの上に重ねる。右側の入力ボタンは隠さない）。
 * 記録時刻から数えるので、再読み込み・監督の端末でも同じ残り時間になる。
 * 次のラリー・1つ戻す・「閉じる」で消える。0 になったら「タイムアウト終了」を数秒出して消え、音と振動で知らせる。
 */
export function TimeoutOverlay({ events, durationSec, sound }: OverlayProps) {
  const now = useNow(250);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const cd = timeoutCountdown(events, now, durationSec);
  // 0 になった瞬間を見つける（表示を閉じていても、タブが裏で更新が遅れても鳴らす）
  const end = timeoutCountdown(events, now, durationSec, Infinity);
  const prev = useRef<{ id: string; phase: string } | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && end && p.id === end.id && p.phase === 'running' && end.phase === 'ended') timeoutEndAlert(sound);
    prev.current = end ? { id: end.id, phase: end.phase } : null;
  }, [end?.id, end?.phase]);

  if (!cd || cd.id === dismissed) return null;
  const cls = cd.phase === 'ended' ? ' ended' : cd.warn ? ' warn' : '';
  return (
    <div class={`to-overlay ${cd.side}${cls}`} role="timer" aria-label="タイムアウトの残り時間">
      <div class="to-title">タイムアウト（{SIDE_LABEL[cd.side]}）</div>
      {cd.phase === 'ended'
        ? <div class="to-time">タイムアウト終了</div>
        : <div class="to-time">残り <b>{formatCountdown(cd.remainingSec)}</b></div>}
      <div class="to-count">このセット {cd.nth}/{TIMEOUTS_PER_SET} 回目</div>
      {cd.nth > TIMEOUTS_PER_SET && (
        <div class="to-over">⚠ {cd.nth}回目のタイムアウトです（ルールでは{TIMEOUTS_PER_SET}回まで）</div>
      )}
      <button class="to-close" onClick={() => setDismissed(cd.id)}>閉じる</button>
    </div>
  );
}

/**
 * 画面の最初のタップで音を使えるようにする（ブラウザは操作の中でしか音を出せない）。
 * hint = true（閲覧画面）なら、まだ解除していない間「音を鳴らすには画面を一度タップ」を出す。
 */
export function AudioUnlock({ hint }: { hint: boolean }) {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked);
  useEffect(() => {
    const off = onAudioUnlockChange(() => setUnlocked(isAudioUnlocked()));
    if (isAudioUnlocked()) return off;
    const opts = { capture: true } as const;
    const evs = ['pointerup', 'touchend', 'keydown', 'click'] as const;
    const f = () => unlockAudio();
    evs.forEach((t) => document.addEventListener(t, f, opts));
    return () => { off(); evs.forEach((t) => document.removeEventListener(t, f, opts)); };
  }, [unlocked]);
  if (!hint || unlocked) return null;
  return <span class="audio-hint" role="note">🔈 音を鳴らすには画面を一度タップ</span>;
}
