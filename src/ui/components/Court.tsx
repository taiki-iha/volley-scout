import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Lineup, Side } from '../../core/types';
import { SIDE_LABEL, courtChange, type CourtSnap, type Sel } from '../live.logic';

interface Props {
  side: Side;
  set: number;                // セット番号（セットが変わったら動きを出さない）
  lineup: Lineup;
  rotations: number;          // そのセットのローテ回数（増えた＝ローテ、減った＝1つ戻す）
  serving: boolean;           // このチームがサーブ権を持つ
  setter: number | null;
  liberos: number[];
  roleOf: (no: number) => string;
  bad: Set<number>;           // 調子の悪い選手（自チームのみ）
  selected: Sel | null;
  onTap?: (no: number) => void;  // 閲覧モードでは無し
}

// ネットが中央。左=相手（ネットは右側）、右=自チーム（ネットは左側）。
// 自チーム: 前衛列（ネット側）上から 2,3,4 / 後衛列 上から 1,6,5（ネットに向かって左手が下）
// 相手:     前衛列（ネット側）上から 4,3,2 / 後衛列 上から 5,6,1
const LAYOUT: Record<Side, number[]> = {
  // grid の並び（行ごとに 左列, 右列）。値はポジション番号
  them: [5, 4, 6, 3, 1, 2],
  us: [2, 1, 3, 6, 4, 5],
};

const MOVE_MS = 500;     // ローテで選手が動く時間
const FLASH_MS = 1000;   // コートが光る・「ローテ」表示が出ている時間
const ENTER_MS = 1200;   // 交代で入った選手の強調

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Pos = { x: number; y: number };

export function Court({ side, set, lineup, rotations, serving, setter, liberos, roleOf, bad, selected, onTap }: Props) {
  // 選手の丸は背番号を key にする（ローテで同じ DOM 要素が別のマスへ移る → 位置の変化を測って動かす = FLIP）
  const grid = useRef<HTMLDivElement>(null);
  const players = (): [number, HTMLElement][] =>
    [...(grid.current?.querySelectorAll<HTMLElement>('.pl[data-no]') ?? [])].map((el) => [Number(el.dataset.no), el]);
  const prev = useRef<CourtSnap | null>(null);
  const before = useRef<Map<number, Pos> | null>(null);
  const key = `${set}|${rotations}|${lineup.join(',')}`;
  const shownKey = useRef<string | null>(null);
  const [flash, setFlash] = useState<{ n: number; label: string } | null>(null);
  const [entered, setEntered] = useState<number[]>([]);
  const timers = useRef<number[]>([]);

  // 描画の直前（DOM はまだ前の並び）に、各選手の今の位置を控える
  if (shownKey.current !== null && shownKey.current !== key) {
    const m = new Map<number, Pos>();
    for (const [no, el] of players()) m.set(no, { x: el.offsetLeft, y: el.offsetTop });
    before.current = m;
  }

  useLayoutEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    const snap: CourtSnap = { set, lineup, rotations };
    const change = courtChange(prev.current, snap);
    prev.current = snap;
    const old = before.current;
    before.current = null;
    const later = (f: () => void, ms: number) => { timers.current.push(window.setTimeout(f, ms)); };

    if (change.rotated) {
      setFlash((f) => ({ n: (f?.n ?? 0) + 1, label: change.rotated === 'forward' ? 'ローテ' : 'ローテ戻し' }));
      later(() => setFlash(null), FLASH_MS);
    }
    if (change.entered.length) {
      setEntered(change.entered);
      later(() => setEntered([]), ENTER_MS);
    }
    // 動きを減らす設定のときは動かさない（光る表示だけ）
    if (!change.rotated || !old || reducedMotion()) return;
    const moved: HTMLElement[] = [];
    for (const [no, el] of players()) {
      const b = old.get(no);
      if (!b) continue;
      const dx = b.x - el.offsetLeft;
      const dy = b.y - el.offsetTop;
      if (dx === 0 && dy === 0) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      moved.push(el);
    }
    if (!moved.length) return;
    void moved[0].offsetWidth;  // 元の位置に置いた状態を確定させてから動かす
    requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = `transform ${MOVE_MS}ms ease`;
        el.style.transform = '';
      }
    });
    later(() => { for (const el of moved) el.style.transition = ''; }, MOVE_MS + 50);
  }, [key]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  return (
    <div class={`court court-${side}`}>
      <div class="court-label">{SIDE_LABEL[side]}</div>
      {flash && (
        <>
          <div key={`g${flash.n}`} class="rot-glow" aria-hidden="true" />
          <div key={`b${flash.n}`} class="rot-badge" role="status">{flash.label}</div>
        </>
      )}
      <div class="court-grid" ref={grid}>
        {LAYOUT[side].map((pos) => {
          const no = lineup[pos - 1];
          const isServer = serving && pos === 1;
          const cls = [
            'pl',
            liberos.includes(no) ? 'libero' : '',
            bad.has(no) ? 'bad' : '',
            selected && selected.side === side && selected.player === no ? 'sel' : '',
            pos >= 2 && pos <= 4 ? 'front' : 'back',
            entered.includes(no) ? 'entered' : '',
          ].filter(Boolean).join(' ');
          const role = no === setter ? 'S' : roleOf(no);
          return (
            <button key={no} class={cls} disabled={!onTap} onClick={() => onTap?.(no)} aria-label={`${SIDE_LABEL[side]} ポジション${pos} 背番号${no}`}
              data-no={no}>
              <b>{no}</b>
              {role && <small>{role}</small>}
              {isServer && <span class="srv">サーブ</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
