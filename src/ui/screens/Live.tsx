import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_THRESHOLDS } from '../../core/condition';
import { replay } from '../../core/replay';
import type { Match, MatchEvent, OpponentTeam, Player, Side } from '../../core/types';
import type { Settings } from '../../data/store';
import { useStore, useWatch } from '../../data/StoreContext';
import { ConditionList } from '../components/ConditionList';
import { Court } from '../components/Court';
import { PlayPanel } from '../components/PlayPanel';
import { Scoreboard } from '../components/Scoreboard';
import { SubDialog } from '../components/SubDialog';
import {
  IDLE, SIDE_LABEL, buildRallyEvent, buildTimeoutEvent, canStartSet, chooseBlocker, choosePlay, chooseZone, conditionRows,
  nextSetNeeded, nextSetNo, type Step, type StepResult,
} from '../live.logic';
import { report } from '../notify';
import { navigate } from '../router';
import { SetStart } from './SetStart';

export function Live({ id, readonly }: { id: string; readonly: boolean }) {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const events = useWatch<MatchEvent[]>((cb) => store.watchEvents(id, cb), [store, id]);
  const players = useWatch<Player[]>((cb) => store.watchPlayers(cb), [store]);
  const opponents = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);
  const settings = useWatch<Settings>((cb) => store.watchSettings(cb), [store]);

  const match = matches?.find((m) => m.id === id);
  const cfg = match?.config;
  // 表示はすべて、監視しているイベントの replay から作る（手元の仮の状態は持たない）
  const state = useMemo(() => (cfg && events ? replay(cfg, events) : null), [cfg, events]);

  const [step, setStep] = useState<Step>(IDLE);
  const [wantNextSet, setWantNextSet] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  // この画面から送った set_start のセット番号。反映待ちの間に同じセットを二重に始めないため（R4）
  const submitted = useRef(new Set<number>());
  const latest = useRef<{ events: MatchEvent[] | undefined }>({ events });
  latest.current.events = events;

  const curSet = state?.current?.set ?? 0;
  const curOver = state?.current?.over ?? false;
  useEffect(() => { setStep(IDLE); }, [curSet, curOver]);
  useEffect(() => { setWantNextSet(false); }, [curSet]);
  useEffect(() => {
    for (const n of [...submitted.current]) {
      if (events?.some((e) => e.t === 'set_start' && e.set === n)) submitted.current.delete(n);
    }
  }, [events]);

  if (!matches || !events || !players || !opponents) return <div class="screen"><p class="muted">読み込み中…</p></div>;
  if (!match || !cfg || !state) return <div class="screen"><h1>試合が見つかりません</h1></div>;

  const team = opponents.find((o) => o.id === match.opponentId);
  const oppName = team?.name ?? '相手';
  const thresholds = settings?.thresholds ?? DEFAULT_THRESHOLDS;
  const cur = state.current;
  const newSetNo = nextSetNo(state);

  const canStart = (n: number) => () => {
    const evs = latest.current.events ?? [];
    return !submitted.current.has(n) && canStartSet(evs, replay(cfg, evs), cfg, n);
  };

  // ---- セット開始画面 ----
  if (!readonly && (cur === null || wantNextSet) && canStartSet(events, state, cfg, newSetNo)) {
    return (
      <SetStart key={newSetNo} matchId={id} setNo={newSetNo} events={events} state={state} players={players} team={team}
        canStart={canStart(newSetNo)}
        onStarted={() => { submitted.current.add(newSetNo); setWantNextSet(false); }}
        onCancel={cur ? () => setWantNextSet(false) : undefined} />
    );
  }

  const modeLink = readonly
    ? <button onClick={() => navigate(`/match/${encodeURIComponent(id)}/live`)}>入力モードへ</button>
    : <button onClick={() => navigate(`/match/${encodeURIComponent(id)}/view`)}>閲覧モード</button>;

  if (!cur) {
    return (
      <div class="screen">
        <div class="row"><h1 class="grow">vs {oppName}</h1>{modeLink}</div>
        <p class="muted">まだセットが始まっていません</p>
      </div>
    );
  }

  const rows = conditionRows(cfg, events, state, thresholds);
  const bad = new Set(rows.filter((r) => r.bad).map((r) => r.no));
  const roleOf = (side: Side) => (no: number): string => {
    if (side === 'us') return players.find((p) => p.no === no)?.position ?? '';
    return team?.players.find((p) => p.no === no)?.position ?? '';
  };
  const nameOf = (no: number) => players.find((p) => p.no === no)?.name ?? '';

  const apply = (r: StepResult) => {
    setStep(r.step);
    if (r.event) report(store.appendEvent(id, r.event));
  };
  const tap = (side: Side) => (no: number) => {
    if (cur.over) return;
    setStep(step.k !== 'idle' && step.sel.side === side && step.sel.player === no ? IDLE : { k: 'play', sel: { side, player: no } });
  };
  const sel = step.k === 'idle' ? null : step.sel;

  const setEnd = cur.over && (
    <div class="panel-box set-end">
      <b>第{cur.set}セット終了（{cur.winner ? SIDE_LABEL[cur.winner] : ''}の勝ち {cur.score.us}-{cur.score.them}）</b>
      {state.matchOver ? (
        <div class="row">
          <b class="grow">試合終了（セット {state.setsWon.us}-{state.setsWon.them}）</b>
          <button onClick={() => navigate('/analysis')}>分析画面へ</button>
        </div>
      ) : nextSetNeeded(state, cfg) && !readonly ? (
        <button class="primary" onClick={() => setWantNextSet(true)}>次のセットへ</button>
      ) : null}
    </div>
  );

  return (
    <div class={`live${readonly ? ' readonly' : ''}`}>
      <div class="live-top">
        <Scoreboard cur={cur} setsWon={state.setsWon} opponentName={oppName} />
        {modeLink}
      </div>
      <div class="live-main">
        <div class="live-left">
          <div class="courts">
            <Court side="them" lineup={cur.lineups.them} serving={cur.serving === 'them'} setter={cur.setters.them}
              liberos={cur.liberos.them} roleOf={roleOf('them')} bad={new Set()} selected={sel}
              onTap={readonly ? undefined : tap('them')} />
            <div class="net" />
            <Court side="us" lineup={cur.lineups.us} serving={cur.serving === 'us'} setter={cur.setters.us}
              liberos={cur.liberos.us} roleOf={roleOf('us')} bad={bad} selected={sel}
              onTap={readonly ? undefined : tap('us')} />
          </div>
          {state.warnings.length > 0 && (
            <div class="warnings" role="status">{state.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>
          )}
          {readonly && setEnd}
          <ConditionList rows={rows} nameOf={nameOf} large={readonly} />
        </div>
        {!readonly && (
          <div class="live-right">
            {setEnd}
            <PlayPanel step={step} lineups={cur.lineups} disabled={cur.over}
              onPlay={(p) => apply(choosePlay(step, p, cur.set))}
              onZone={(z) => apply(chooseZone(step, z, cur.set))}
              onBlocker={(b) => apply(chooseBlocker(step, b, cur.set))}
              onNoPlayer={(to) => apply({ step: IDLE, event: buildRallyEvent(cur.set, null, to === 'us' ? 'other_point' : 'other_error', null, null, to) })}
              onCancel={() => setStep(IDLE)} />
            <div class="controls">
              <button disabled={cur.over} onClick={() => setSubOpen(true)}>選手交代</button>
              <button disabled={cur.over} onClick={() => report(store.appendEvent(id, buildTimeoutEvent(cur.set, 'us')))}>TO 自チーム</button>
              <button disabled={cur.over} onClick={() => report(store.appendEvent(id, buildTimeoutEvent(cur.set, 'them')))}>TO 相手</button>
              <button class="undo" disabled={events.length === 0} onClick={() => { setStep(IDLE); report(store.undoLast(id)); }}>1つ戻す</button>
            </div>
          </div>
        )}
      </div>
      {subOpen && !readonly && (
        <SubDialog matchId={id} cur={cur} events={events} usRoster={players.map((p) => p.no)} team={team} onClose={() => setSubOpen(false)} />
      )}
    </div>
  );
}
