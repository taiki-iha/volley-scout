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

const notify = () => listeners.forEach((f) => f());

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
    if (!ctx) {
      ctx = new C();
      // 解除後に止まった（iOS の画面ロック・アプリ切替・着信など）ときも知らせ、タップの待ち受けと案内を出し直す
      ctx.onstatechange = notify;
    }
    const done = notify;
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

function beep(c: AudioContext): void {
  try {
    const t0 = c.currentTime;
    for (const off of [0, 0.25]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t0 + off);
      gain.gain.exponentialRampToValueAtTime(0.4, t0 + off + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + off);
      osc.stop(t0 + off + 0.2);
    }
  } catch {
    // 鳴らせなくても続ける
  }
}

/**
 * 短いビープ音を2回と、対応端末なら振動。一度も解除していなければ音は鳴らない。
 * 解除後に止まっていた（suspended / interrupted）ら再開を試み、再開できたら鳴らす
 * （操作の外なのでブラウザに断られることがある。そのときは画面の案内でタップを促す）。
 */
export function timeoutEndAlert(sound: boolean): void {
  if (sound && ctx) {
    const c = ctx;
    if (c.state === 'running') beep(c);
    else void c.resume().then(() => { if (c.state === 'running') beep(c); }, () => {});
  }
  if (sound && typeof navigator !== 'undefined') navigator.vibrate?.([200, 100, 200]);
}
