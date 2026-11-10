// タイムアウト終了の合図（短いビープ音と振動）。
// ブラウザはユーザーの操作（タップ）の中でないと音を出せないので、
// TO ボタンや画面の最初のタップで unlockAudio() を呼んで AudioContext を作り・再開しておく。

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function audioCtor(): Ctor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
}

/** 音を鳴らせる状態か（このページで一度タップして AudioContext が動いている） */
export function isAudioUnlocked(): boolean {
  return ctx !== null && ctx.state === 'running';
}

/** 音の解除状態が変わったら呼ぶ */
export function onAudioUnlockChange(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** タップなどの操作の中で呼ぶ。AudioContext を作り、止まっていれば再開する（何度呼んでもよい） */
export function unlockAudio(): void {
  const C = audioCtor();
  if (!C) return;
  try {
    if (!ctx) ctx = new C();
    const done = () => listeners.forEach((f) => f());
    if (ctx.state !== 'running') void ctx.resume().then(done, () => {});
    else done();
    // iOS Safari は無音を一度鳴らすと確実に解除される
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // 音が使えない環境では何もしない
  }
}

/** 短いビープ音を2回（解除前は鳴らない）と、対応端末なら振動 */
export function timeoutEndAlert(sound: boolean): void {
  if (sound && ctx && ctx.state === 'running') {
    try {
      const t0 = ctx.currentTime;
      for (const off of [0, 0.25]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t0 + off);
        gain.gain.exponentialRampToValueAtTime(0.4, t0 + off + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + off);
        osc.stop(t0 + off + 0.2);
      }
    } catch {
      // 鳴らせなくても続ける
    }
  }
  if (sound && typeof navigator !== 'undefined') navigator.vibrate?.([200, 100, 200]);
}
