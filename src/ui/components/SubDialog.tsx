import { useState } from 'preact/hooks';
import type { SetState } from '../../core/replay';
import type { MatchEvent, OpponentTeam, Side } from '../../core/types';
import type { NewEvent } from '../../data/store';
import { useStore } from '../../data/StoreContext';
import { SIDE_LABEL, backRow, benchOf, buildLiberoEvent, buildSubEvent, liberoReplaced, withOpponentNo } from '../live.logic';
import { report } from '../notify';
import { parseJerseyNo } from '../validate';

interface Props {
  matchId: string;
  cur: SetState;
  events: MatchEvent[];
  usRoster: number[];
  team: OpponentTeam | undefined;
  onClose: () => void;
}

type Tab = 'us' | 'libero' | 'them';

export function SubDialog({ matchId, cur, events, usRoster, team, onClose }: Props) {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('us');
  const [out, setOut] = useState<number | null>(null);
  const [newNo, setNewNo] = useState('');
  const [error, setError] = useState('');

  const send = (e: NewEvent) => { report(store.appendEvent(matchId, e)); onClose(); };
  const changeTab = (t: Tab) => { setTab(t); setOut(null); setError(''); };

  function subPane(side: Side) {
    const lineup = cur.lineups[side];
    const roster = side === 'us' ? usRoster : (team?.players ?? []).map((p) => p.no);
    const bench = benchOf(roster, lineup, cur.liberos[side]);
    const addAndSub = async () => {
      const no = parseJerseyNo(newNo);
      if (no === null || out === null) { setError('背番号は0〜999の整数で入れてください'); return; }
      if (lineup.includes(no) || cur.liberos[side].includes(no)) { setError(`#${no} はもうコートかリベロにいます`); return; }
      const t = team ? withOpponentNo(team, no) : null;
      if (t) report(store.saveOpponent(t));
      send(buildSubEvent(cur.set, side, out, no));
    };
    return (
      <>
        <p class="muted">交代 {cur.subsUsed[side]}/6 回（7回目以降は警告のみ）</p>
        <h3>① 下がる選手（コート）</h3>
        <div class="chips">
          {lineup.map((no) => (
            <button key={no} class={`chip${out === no ? ' in' : ''}`} onClick={() => setOut(no)}><b>{no}</b></button>
          ))}
        </div>
        <h3>② 入る選手（ベンチ）</h3>
        {out === null ? <p class="muted">先に下がる選手を選んでください</p> : (
          <>
            <div class="chips">
              {bench.length === 0 && <span class="muted">ベンチの選手がいません</span>}
              {bench.map((no) => (
                <button key={no} class="chip" onClick={() => send(buildSubEvent(cur.set, side, out, no))}><b>{no}</b></button>
              ))}
            </div>
            {side === 'them' && (
              <div class="form-row">
                <label class="field grow">未登録の背番号
                  <input inputMode="numeric" value={newNo} onInput={(e) => setNewNo(e.currentTarget.value)} />
                </label>
                <button onClick={addAndSub}>この番号を入れる</button>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  function liberoPane() {
    const sides = (['us', 'them'] as Side[]).filter((s) => cur.liberos[s].length > 0);
    if (sides.length === 0) return <p class="muted">リベロが登録されていません（セット開始時に登録します）</p>;
    return (
      <>
        <p class="muted">リベロの入れ替えは交代回数に数えません。</p>
        {sides.map((side) => cur.liberos[side].map((lib) => {
          const lineup = cur.lineups[side];
          if (lineup.includes(lib)) {
            const back = liberoReplaced(events, cur.set, lib);
            const candidates = back !== null && !lineup.includes(back)
              ? [back]
              : benchOf(side === 'us' ? usRoster : (team?.players ?? []).map((p) => p.no), lineup, cur.liberos[side]);
            return (
              <div key={`${side}${lib}`} class="lib-row">
                <h3>{SIDE_LABEL[side]} リベロ #{lib}（コート上）→ 下げて戻す選手</h3>
                <div class="chips">
                  {candidates.map((no) => (
                    <button key={no} class="chip" onClick={() => send(buildLiberoEvent(cur.set, side, lib, no))}><b>{no}</b></button>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={`${side}${lib}`} class="lib-row">
              <h3>{SIDE_LABEL[side]} リベロ #{lib} → 入れ替える後衛の選手</h3>
              <div class="chips">
                {backRow(lineup).filter((no) => !cur.liberos[side].includes(no)).map((no) => (
                  <button key={no} class="chip" onClick={() => send(buildLiberoEvent(cur.set, side, no, lib))}><b>{no}</b></button>
                ))}
              </div>
            </div>
          );
        }))}
      </>
    );
  }

  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="dialog" role="dialog" aria-label="選手交代">
        <div class="row tabs">
          <button class={tab === 'us' ? 'primary' : ''} onClick={() => changeTab('us')}>自チーム交代</button>
          <button class={tab === 'libero' ? 'primary' : ''} onClick={() => changeTab('libero')}>リベロ入替</button>
          <button class={tab === 'them' ? 'primary' : ''} onClick={() => changeTab('them')}>相手チーム交代</button>
          <span class="grow" />
          <button onClick={onClose}>閉じる</button>
        </div>
        {tab === 'us' && subPane('us')}
        {tab === 'them' && subPane('them')}
        {tab === 'libero' && liberoPane()}
        {error && <p class="error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
