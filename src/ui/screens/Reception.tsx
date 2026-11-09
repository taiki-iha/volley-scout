import { useMemo, useState } from 'preact/hooks';
import { replay } from '../../core/replay';
import type { Grade, Match, MatchEvent, Player, Reception as Rec } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { receptionRows } from '../../stats/opponent';
import { report } from '../notify';
import { navigate } from '../router';
import { GRADES, GRADE_DEFS, mergeRows, nextUngradedRowId, receiverCandidates } from '../reception.logic';

export function ReceptionScreen({ id }: { id: string }) {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const events = useWatch<MatchEvent[]>((cb) => store.watchEvents(id, cb), [store, id]);
  const saved = useWatch<Rec[]>((cb) => store.watchReceptions(id, cb), [store, id]);
  const players = useWatch<Player[]>((cb) => store.watchPlayers(cb), [store]);
  // 判定を選ぶ前に選んだ受け手（まだ保存できない行）
  const [pending, setPending] = useState<Record<string, number | null>>({});

  const cfg = matches?.find((m) => m.id === id)?.config;
  const data = useMemo(() => {
    if (!cfg || !events) return null;
    const lineups = new Map(replay(cfg, events).rallies.map((r) => [r.eventId, r.usLineup]));
    return { rows: receptionRows(cfg, events), lineups };
  }, [cfg, events]);

  if (!matches || !events || !saved || !players) return <div class="screen"><p class="muted">読み込み中…</p></div>;
  if (!cfg || !data) return <div class="screen"><h1>試合が見つかりません</h1></div>;

  const merged = mergeRows(data.rows, saved);
  const nameOf = (no: number) => players.find((p) => p.no === no)?.name ?? '';
  const done = merged.filter((m) => m.saved).length;

  const focusNext = (list: typeof merged, rallyId: string) => {
    const next = nextUngradedRowId(list, rallyId);
    if (!next) return;
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-rally="${next}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('.grade-btn')?.focus({ preventScroll: true });
    }, 50);
  };

  const pickGrade = (rallyId: string, grade: Grade) => {
    const m = merged.find((x) => x.row.rallyId === rallyId)!;
    const receiver = m.saved ? m.receiver : (pending[rallyId] ?? null);
    report(store.saveReception(id, { rallyId, receiver, grade }));
    const next = merged.map((x) => (x.row.rallyId === rallyId ? { ...x, grade, receiver, saved: true } : x));
    focusNext(next, rallyId);
  };

  const pickReceiver = (rallyId: string, receiver: number | null) => {
    const m = merged.find((x) => x.row.rallyId === rallyId)!;
    if (m.saved || m.grade !== null) {
      // 保存済み、または preset D の行（受け手を選んだ時点で保存する）
      report(store.saveReception(id, { rallyId, receiver, grade: m.grade! }));
      return;
    }
    setPending((p) => ({ ...p, [rallyId]: receiver }));
  };

  return (
    <div class="screen wide">
      <div class="row"><h1 class="grow">レシーブ入力</h1><span class="tag">{done} / {merged.length} 本</span></div>
      <section class="card grade-defs">
        <dl>
          {GRADES.map((g) => <div key={g} class="def-row"><dt>{g}</dt><dd>{GRADE_DEFS[g]}</dd></div>)}
        </dl>
      </section>
      {merged.length === 0 && <p class="muted">相手サーブのラリーがありません</p>}
      <ul class="list rc-list">
        {merged.map((m) => {
          const rid = m.row.rallyId;
          const hasPending = rid in pending;
          const recv = m.saved ? m.receiver : (hasPending ? pending[rid] : null);
          const unknownChosen = m.saved ? m.receiver === null : hasPending && pending[rid] === null;
          const cands = receiverCandidates(data.lineups.get(rid) ?? [0, 0, 0, 0, 0, 0]);
          return (
            <li key={rid} data-rally={rid} class={`rc-row${m.saved ? ' done' : ''}`}>
              <div class="rc-info">
                第{m.row.set}セット　{m.row.scoreBefore.us}-{m.row.scoreBefore.them}　相手S#{m.row.server}
                {m.row.usRotation !== null && <span class="muted">　S{m.row.usRotation}</span>}
                {m.row.preset === 'D' && <span class="tag">サービスエース</span>}
              </div>
              <div class="rc-recv">
                {cands.map((no) => (
                  <button key={no} class={`rc-p${recv === no ? ' on' : ''}`} onClick={() => pickReceiver(rid, no)}>
                    <b>{no}</b><small>{nameOf(no)}</small>
                  </button>
                ))}
                <button class={`rc-p${unknownChosen ? ' on' : ''}`} onClick={() => pickReceiver(rid, null)}>不明</button>
              </div>
              <div class="rc-grades">
                {GRADES.map((g) => (
                  <button key={g} class={`grade-btn g-${g}${m.grade === g ? ' on' : ''}`} onClick={() => pickGrade(rid, g)}>{g}</button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div class="row"><button onClick={() => navigate(`/match/${encodeURIComponent(id)}/edit`)}>記録の修正へ</button></div>
    </div>
  );
}
