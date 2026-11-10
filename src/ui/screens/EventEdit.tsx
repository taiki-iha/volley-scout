import { useMemo } from 'preact/hooks';
import { replay } from '../../core/replay';
import type { Match, MatchEvent, OpponentTeam, PlayKind, Player, Side, Zone } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import type { EventPatch } from '../../data/store';
import { PLAY_LABEL, SIDE_LABEL, other } from '../live.logic';
import { report } from '../notify';
import { navigate } from '../router';
import { editContextLabel, editContexts, needsZone, playChangePatch, playChoices } from '../reception.logic';

const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];
type Editable = Extract<MatchEvent, { t: 'rally' | 'attempt' }>;

export function EventEdit({ id }: { id: string }) {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const events = useWatch<MatchEvent[]>((cb) => store.watchEvents(id, cb), [store, id]);
  const players = useWatch<Player[]>((cb) => store.watchPlayers(cb), [store]);
  const opponents = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);

  const match = matches?.find((m) => m.id === id);
  const lineups = useMemo(() => {
    if (!match || !events) return new Map<string, Record<Side, number[]>>();
    return new Map(replay(match.config, events).rallies.map((r) => [r.eventId, { us: [...r.usLineup], them: [...r.themLineup] }]));
  }, [match, events]);
  // 動画と照らし合わせて行を探せるよう、そのラリーの前の点数とサーバーを出す
  const contexts = useMemo(() => (match && events ? editContexts(match.config, events) : new Map()), [match, events]);

  if (!matches || !events || !players || !opponents) return <div class="screen"><p class="muted">読み込み中…</p></div>;
  if (!match) return <div class="screen"><h1>試合が見つかりません</h1></div>;

  const team = opponents.find((o) => o.id === match.opponentId);
  // 選択肢: その時コートにいた6人（アタンプトは登録選手/相手選手）＋現在の値
  const nums = (side: Side, lineup: number[] | undefined, current: number | null): number[] => {
    const base = lineup ?? (side === 'us' ? players.map((p) => p.no) : (team?.players ?? []).map((p) => p.no));
    const set = new Set(base);
    if (current !== null) set.add(current);
    return [...set].sort((a, b) => a - b);
  };
  const save = (eid: string, patch: EventPatch) => { report(store.updateEvent(id, eid, patch)); };
  const list = events.filter((e): e is Editable => e.t === 'rally' || e.t === 'attempt');

  const playerSel = (e: Editable) => {
    const opts = e.side === null ? [] : nums(e.side, lineups.get(e.id)?.[e.side], e.player);
    return (
      <label class="field">選手
        <select value={e.player ?? ''} disabled={e.side === null}
          onChange={(ev) => { const v = ev.currentTarget.value; save(e.id, { player: v === '' ? null : Number(v) } as EventPatch); }}>
          {e.t === 'rally' && <option value="">なし</option>}
          {opts.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    );
  };
  const zoneSel = (e: Editable) => (
    <label class="field">ゾーン
      <select value={e.zone ?? ''} onChange={(ev) => { const v = ev.currentTarget.value; save(e.id, { zone: v === '' ? null : (Number(v) as Zone) }); }}>
        <option value="">なし</option>
        {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
    </label>
  );

  return (
    <div class="screen wide">
      <div class="row"><h1 class="grow">記録の修正</h1><button onClick={() => navigate(`/match/${encodeURIComponent(id)}/reception`)}>レシーブ入力へ</button></div>
      <p class="muted">変更はすぐに保存されます。得点とミスを入れ替える修正（点数が変わるもの）は選べません。点数はそのラリーの前の点数（自チーム-相手）です。</p>
      {list.length === 0 && <p class="muted">修正できる記録がありません</p>}
      <ul class="list">
        {list.map((e, i) => (
          <li key={e.id} class="row edit-row">
            <span class="tag">{i + 1}</span>
            <span>第{e.set}セット</span>
            {contexts.has(e.id) && <span class="edit-ctx">{editContextLabel(contexts.get(e.id)!)}</span>}
            <span>{e.side ? SIDE_LABEL[e.side] : '選手なし'}</span>
            {playerSel(e)}
            {e.t === 'rally' ? (
              <>
                <label class="field">プレー
                  <select value={e.play} onChange={(ev) => {
                    const p = ev.currentTarget.value as PlayKind;
                    if (p !== e.play) save(e.id, playChangePatch(e, p));
                  }}>
                    {playChoices(e.play).map((c) => <option key={c.play} value={c.play} disabled={!c.allowed}>{PLAY_LABEL[c.play]}</option>)}
                  </select>
                </label>
                {needsZone(e.play) && zoneSel(e)}
                {e.play === 'spike_blocked' && e.side && (
                  <label class="field">ブロッカー
                    <select value={e.blocker ?? ''} onChange={(ev) => { const v = ev.currentTarget.value; save(e.id, { blocker: v === '' ? null : Number(v) }); }}>
                      <option value="">不明</option>
                      {nums(other(e.side), lineups.get(e.id)?.[other(e.side)], e.blocker).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                <span>{PLAY_LABEL.attempt}</span>
                {zoneSel(e)}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
