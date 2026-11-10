import { useRef, useState } from 'preact/hooks';
import type { MatchState } from '../../core/replay';
import type { MatchEvent, OpponentTeam, Player, Position, Side } from '../../core/types';
import { useStore } from '../../data/StoreContext';
import {
  SIDE_LABEL, ZONE_GRID, assignSlot, defaultSetter, dropPlayer, initialDraft, nextEmptySlot, toggleLibero, validateSetStart, withOpponentNo,
  type DropTarget, type SetStartDraft,
} from '../live.logic';
import { report } from '../notify';
import { useBusy } from '../useBusy';
import { parseJerseyNo } from '../validate';

interface Props {
  matchId: string;
  setNo: number;
  events: MatchEvent[];
  state: MatchState;
  players: Player[];
  team: OpponentTeam | undefined;
  canStart: () => boolean;      // R4: 同じセットの set_start を二度作らないための最終確認
  onStarted: () => void;
  onCancel?: () => void;
}

interface Cand { no: number; label: string; position: Position | null }

/** ドラッグ中の選手（指の下に丸を出す）。over = 指の下にある落とし先（data-drop の値） */
interface Drag { side: Side; no: number; x: number; y: number; over: string | null }
/** 押した直後（まだ動かしていない）の状態。8px 動いたらドラッグ開始 */
interface Press { side: Side; no: number; pointerId: number; x0: number; y0: number; started: boolean }

const DRAG_START_PX = 8;

/** 指の下の落とし先（同じ側のものだけ）。data-drop = 'slot:<index>' | 'bench' | 'libero' */
function dropAt(x: number, y: number, side: Side): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]');
  return el && el.dataset.side === side ? (el.dataset.drop ?? null) : null;
}
function parseDrop(key: string): DropTarget | null {
  if (key === 'bench') return { k: 'bench' };
  if (key === 'libero') return { k: 'libero' };
  const m = /^slot:([0-5])$/.exec(key);
  return m ? { k: 'slot', index: Number(m[1]) } : null;
}

export function SetStart({ matchId, setNo, events, state, players, team, canStart, onStarted, onCancel }: Props) {
  const store = useStore();
  const [draft, setDraft] = useState<SetStartDraft>(() => initialDraft(events, state, players, team?.players ?? []));
  const [active, setActive] = useState<{ side: Side; index: number } | null>({ side: 'us', index: 0 });
  const [liberoMode, setLiberoMode] = useState<Record<Side, boolean>>({ us: false, them: false });
  const [setterTouched, setSetterTouched] = useState<Record<Side, boolean>>({ us: setNo > 1, them: setNo > 1 });
  const [extraThem, setExtraThem] = useState<number[]>([]);
  const [newNo, setNewNo] = useState('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const [drag, setDrag] = useState<Drag | null>(null);
  const press = useRef<Press | null>(null);
  const suppressClickUntil = useRef(0);   // ドラッグを終えた直後の click（タップ扱い）を無視する

  // ---- ドラッグ＆ドロップ（Pointer Events。iPad Safari の指操作でも動くよう HTML5 DnD は使わない） ----
  const dragProps = (side: Side, no: number) => ({
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      press.current = { side, no, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, started: false };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.pointerId !== e.pointerId) return;
      if (!p.started && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_START_PX) return;
      p.started = true;
      e.preventDefault();
      setDrag({ side: p.side, no: p.no, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY, p.side) });
    },
    onPointerUp: (e: PointerEvent) => endDrag(e, true),
    onPointerCancel: (e: PointerEvent) => endDrag(e, false),
    // 捕捉が外れた（要素が消えた等）ときも押した状態・指の下の丸を残さない。pointerup の後は press が空なので何もしない
    onLostPointerCapture: (e: PointerEvent) => endDrag(e, false),
  });
  function endDrag(e: PointerEvent, commit: boolean) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    press.current = null;
    setDrag(null);
    if (!p.started) return;           // 動かしていなければ普通のタップ（click）として扱う
    suppressClickUntil.current = performance.now() + 500;
    if (!commit) return;
    const key = dropAt(e.clientX, e.clientY, p.side);
    const target = key ? parseDrop(key) : null;
    if (target) setDraft((d) => dropPlayer(d, p.side, p.no, target));
  }
  const clickOk = () => performance.now() >= suppressClickUntil.current;
  const dropCls = (side: Side, key: string): string =>
    drag && drag.side === side ? (drag.over === key ? ' drop-ok drop-over' : ' drop-ok') : '';

  const roster: Record<Side, Cand[]> = {
    us: [...players].sort((a, b) => a.no - b.no).map((p) => ({ no: p.no, label: p.name, position: p.position })),
    them: (() => {
      const map = new Map<number, Cand>();
      for (const p of team?.players ?? []) map.set(p.no, { no: p.no, label: p.name, position: p.position });
      for (const no of [...extraThem, ...draft.lineups.them, ...draft.liberos.them]) {
        if (no !== null && !map.has(no)) map.set(no, { no, label: '', position: null });
      }
      return [...map.values()].sort((a, b) => a.no - b.no);
    })(),
  };
  // 自チームの名簿外の番号（前セットから引き継いだ等）も表示する
  for (const no of [...draft.lineups.us, ...draft.liberos.us]) {
    if (no !== null && !roster.us.some((c) => c.no === no)) roster.us.push({ no, label: '', position: null });
  }

  const setterOf = (side: Side): number | null =>
    setterTouched[side] ? draft.setters[side] : (draft.setters[side] ?? defaultSetter(draft.lineups[side], roster[side]));

  function pick(side: Side, no: number) {
    if (liberoMode[side]) { setDraft(toggleLibero(draft, side, no)); return; }
    const index = active && active.side === side ? active.index : nextEmptySlot(draft.lineups[side], -1);
    if (index === null) return;
    const d = assignSlot(draft, side, index, no);
    setDraft(d);
    const next = nextEmptySlot(d.lineups[side], index);
    setActive(next === null ? null : { side, index: next });
  }

  async function addOpponentNo() {
    const no = parseJerseyNo(newNo);
    if (no === null) { setError('背番号は0〜999の整数で入れてください'); return; }
    setError('');
    setNewNo('');
    if (!extraThem.includes(no)) setExtraThem([...extraThem, no]);
    const t = team ? withOpponentNo(team, no) : null;
    if (t) await report(store.saveOpponent(t));
  }

  async function submit() {
    const d: SetStartDraft = { ...draft, setters: { us: setterOf('us'), them: setterOf('them') } };
    const r = validateSetStart(d, setNo);
    if (!r.ok) { setError(r.error); return; }
    setError('');
    await run(async () => {
      if (!canStart()) { setError(`第${setNo}セットはもう始まっています`); return; }
      if (await report(store.appendEvent(matchId, r.value))) onStarted();
    });
  }

  const sideBox = (side: Side) => {
    const lineup = draft.lineups[side];
    const setter = setterOf(side);
    return (
      <section class={`card ss-side ss-${side}`}>
        <h2>{SIDE_LABEL[side]}</h2>
        <div class="ss-court">
          <div class="ss-net">ネット</div>
          {ZONE_GRID.map((pos) => {
            const i = pos - 1;
            const isActive = !liberoMode[side] && active?.side === side && active.index === i;
            return (
              <button key={pos} class={`ss-slot${isActive ? ' active' : ''}${lineup[i] !== null ? ' filled' : ''}${dropCls(side, `slot:${i}`)}`}
                data-drop={`slot:${i}`} data-side={side}
                {...(lineup[i] !== null ? dragProps(side, lineup[i]!) : {})}
                onClick={() => { if (!clickOk()) return; setLiberoMode({ ...liberoMode, [side]: false }); setActive({ side, index: i }); }}>
                <small>ポジション{pos}</small>
                <b>{lineup[i] ?? '–'}</b>
              </button>
            );
          })}
        </div>
        <div class="row ss-modes">
          <button class={!liberoMode[side] ? 'primary' : ''} onClick={() => setLiberoMode({ ...liberoMode, [side]: false })}>スタメンに入れる</button>
          <button class={liberoMode[side] ? 'primary' : ''} onClick={() => setLiberoMode({ ...liberoMode, [side]: true })}>リベロを選ぶ</button>
        </div>
        <p class="muted ss-hint">{liberoMode[side] ? 'リベロにする選手をタップ（最大2人）' : 'ポジションを選んで選手をタップ（選手をコートへドラッグしても入れられます）'}</p>
        <div class={`chips ss-bench${dropCls(side, 'bench')}`} data-drop="bench" data-side={side}>
          {roster[side].length === 0 && <span class="muted">{side === 'us' ? '選手が登録されていません' : '下で背番号を追加してください'}</span>}
          {roster[side].map((c) => {
            const inLineup = lineup.includes(c.no);
            const isLib = draft.liberos[side].includes(c.no);
            return (
              <button key={c.no} class={`chip${inLineup ? ' in' : ''}${isLib ? ' lib' : ''}${drag && drag.side === side && drag.no === c.no ? ' dragging' : ''}`}
                {...dragProps(side, c.no)} onClick={() => { if (clickOk()) pick(side, c.no); }}>
                <b>{c.no}</b>{c.position && <small>{c.position}</small>}{c.label && <small>{c.label}</small>}
              </button>
            );
          })}
        </div>
        {side === 'them' && (
          <div class="form-row">
            <label class="field grow">未登録の背番号を追加
              <input inputMode="numeric" value={newNo} onInput={(e) => setNewNo(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addOpponentNo(); }} />
            </label>
            <button onClick={addOpponentNo}>追加</button>
          </div>
        )}
        <div class={`ss-line ss-lib${dropCls(side, 'libero')}`} data-drop="libero" data-side={side}>
          <span>リベロ:</span>
          {draft.liberos[side].length
            ? draft.liberos[side].map((n) => <span key={n} class="ss-lib-no" {...dragProps(side, n)}>#{n}</span>)
            : <span class="muted">なし（ここへドラッグで指定）</span>}
        </div>
        <div class="ss-line">
          <span>セッター:</span>
          {lineup.filter((n): n is number => n !== null).map((n) => (
            <button key={n} class={`small${setter === n ? ' primary' : ''}`}
              onClick={() => { setSetterTouched({ ...setterTouched, [side]: true }); setDraft({ ...draft, setters: { ...draft.setters, [side]: n } }); }}>
              #{n}
            </button>
          ))}
          <button class={`small${setter === null ? ' primary' : ''}`}
            onClick={() => { setSetterTouched({ ...setterTouched, [side]: true }); setDraft({ ...draft, setters: { ...draft.setters, [side]: null } }); }}>
            不明
          </button>
        </div>
      </section>
    );
  };

  return (
    <div class="screen wide">
      <h1>第{setNo}セット 開始</h1>
      <div class="ss-grid">
        {sideBox('them')}
        {sideBox('us')}
      </div>
      <section class="card">
        <h2>最初のサーブ権</h2>
        <div class="row">
          {(['them', 'us'] as Side[]).map((s) => (
            <button key={s} class={draft.firstServe === s ? 'primary' : ''} onClick={() => setDraft({ ...draft, firstServe: s })}>{SIDE_LABEL[s]}</button>
          ))}
        </div>
      </section>
      {error && <p class="error" role="alert">{error}</p>}
      {drag && (
        // 指の下に選手の丸を出す（pointer-events: none なので落とし先の判定を邪魔しない）
        <div class="drag-ghost" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">{drag.no}</div>
      )}
      <div class="row">
        <button class="primary big grow" disabled={busy} onClick={submit}>第{setNo}セットを始める</button>
        {onCancel && <button class="big" onClick={onCancel}>戻る</button>}
      </div>
    </div>
  );
}
