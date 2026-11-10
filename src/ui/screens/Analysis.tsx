import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Match, MatchData, MatchEvent, OpponentTeam, Player, Reception } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { opponentScorers, receptionByOpponentServer } from '../../stats/opponent';
import { playerStats } from '../../stats/player';
import { rotationStats, unknownSetterRallies } from '../../stats/rotation';
import {
  KIND_LABEL, csvFileName, type CsvTable, filterMatches, playerRows, rotationRows, scorerRows, serverRows, type KindFilter,
} from '../analysis.logic';
import { BarChart } from '../components/BarChart';
import { StatTable } from '../components/StatTable';

/** 選択した試合すべての events / receptions を購読する。全試合ぶん届くまで undefined */
function useMatchData(matches: Match[]): MatchData[] | undefined {
  const store = useStore();
  const key = matches.map((m) => m.id).join('|');
  const [data, setData] = useState<{ key: string; list: MatchData[] } | undefined>(undefined);
  useEffect(() => {
    setData(undefined);
    const events = new Map<string, MatchEvent[]>();
    const recs = new Map<string, Reception[]>();
    const publish = () => {
      if (matches.some((m) => !events.has(m.id) || !recs.has(m.id))) return;
      setData({
        key,
        list: matches.map((m) => ({ cfg: m.config, events: events.get(m.id)!, receptions: recs.get(m.id)! })),
      });
    };
    const unsubs = matches.flatMap((m) => [
      store.watchEvents(m.id, (e) => { events.set(m.id, e); publish(); }),
      store.watchReceptions(m.id, (r) => { recs.set(m.id, r); publish(); }),
    ]);
    publish(); // 対象が 0 試合のとき
    return () => unsubs.forEach((u) => u());
  }, [store, key]);
  return data && data.key === key ? data.list : undefined;
}

type Tab = 'player' | 'rotation' | 'opponent';
const TAB_LABEL: Record<Tab, string> = { player: '選手別', rotation: 'ローテ別', opponent: '相手' };

function preselectedMatch(): string {
  const q = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(q).get('match') ?? '';
}

export function Analysis() {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const players = useWatch<Player[]>((cb) => store.watchPlayers(cb), [store]);
  const teams = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);

  const [tab, setTab] = useState<Tab>('player');
  const [matchId, setMatchId] = useState<string>(preselectedMatch);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [oppId, setOppId] = useState('');

  const teamName = (id: string) => teams?.find((t) => t.id === id)?.name ?? '(不明)';
  const one = matchId !== '' ? matches?.find((m) => m.id === matchId) : undefined;
  const sorted = useMemo(() => filterMatches(matches ?? [], { from: '', to: '', kind: 'all' }), [matches]);
  const inFilter = useMemo(
    () => (one ? [one] : filterMatches(matches ?? [], { from, to, kind })),
    [matches, one, from, to, kind],
  );
  const oppTeams = (teams ?? []).filter((t) => inFilter.some((m) => m.opponentId === t.id));
  const effOpp = oppTeams.some((t) => t.id === oppId) ? oppId : (oppTeams[0]?.id ?? '');
  const target = useMemo(
    () => (tab === 'opponent' ? inFilter.filter((m) => m.opponentId === effOpp) : inFilter),
    [tab, inFilter, effOpp],
  );
  const data = useMatchData(target);
  const fileName = (t: CsvTable) => csvFileName(t, new Date());
  const oppTeam = teams?.find((t) => t.id === effOpp);

  return (
    <div class="screen wide">
      <h1>分析</h1>
      <section class="card">
        <h2>対象の試合</h2>
        <div class="an-filter">
          <label class="field">試合を1つ選ぶ
            <select value={matchId} onChange={(e) => setMatchId(e.currentTarget.value)}>
              <option value="">（期間で絞り込む）</option>
              {sorted.map((m) => <option key={m.id} value={m.id}>{m.date} vs {teamName(m.opponentId)}（{KIND_LABEL[m.kind]}）</option>)}
            </select>
          </label>
          <label class="field">開始日
            <input type="date" value={from} disabled={!!one} onInput={(e) => setFrom(e.currentTarget.value)} />
          </label>
          <label class="field">終了日
            <input type="date" value={to} disabled={!!one} onInput={(e) => setTo(e.currentTarget.value)} />
          </label>
          <label class="field">種別
            <select value={kind} disabled={!!one} onChange={(e) => setKind(e.currentTarget.value as KindFilter)}>
              {(Object.keys(KIND_LABEL) as KindFilter[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        <p class="muted">対象: {matches === undefined ? '読み込み中…' : `${inFilter.length}試合`}</p>
      </section>

      <div class="an-tabs" role="tablist">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
        ))}
      </div>

      {tab === 'opponent' && (
        <label class="field">相手チーム
          <select value={effOpp} onChange={(e) => setOppId(e.currentTarget.value)}>
            {oppTeams.length === 0 && <option value="">（対象の試合に相手がありません）</option>}
            {oppTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}

      {matches === undefined || players === undefined || teams === undefined || data === undefined ? (
        <p class="muted">読み込み中…</p>
      ) : tab === 'player' ? (
        <StatTable title="選手別成績" rows={playerRows(playerStats(data), players)} fileName={fileName('選手別')} />
      ) : tab === 'rotation' ? (
        <RotationTab data={data} fileName={fileName('ローテ別')} />
      ) : (
        <>
          <StatTable title={`${oppTeam?.name ?? ''} 選手別の得点（ゾーン別）`} rows={scorerRows(opponentScorers(data), oppTeam)} fileName={fileName('相手得点')} />
          <StatTable title="相手サーバー別のレシーブ成績" rows={serverRows(receptionByOpponentServer(data), oppTeam)} fileName={fileName('相手サーバー別')} />
        </>
      )}
    </div>
  );
}

function RotationTab({ data, fileName }: { data: MatchData[]; fileName: string }) {
  const stats = rotationStats(data);
  const unknown = unknownSetterRallies(data);
  return (
    <>
      <p class="muted">自チームのセッターを指定していないセットのラリーは、ローテ番号が決まらないため集計に含まれません。{unknown > 0 && `（対象外 ${unknown} ラリー）`}</p>
      <StatTable title="ローテ別成績" rows={rotationRows(stats)} fileName={fileName} />
      <section class="card">
        <h2>得点・失点</h2>
        <BarChart rows={stats.map((r) => ({ label: `S${r.rotation}`, won: r.pointsWon, lost: r.pointsLost }))} />
      </section>
    </>
  );
}
