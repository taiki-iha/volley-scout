import type { Match, OpponentTeam } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { navigate } from '../router';

export function Home() {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const opponents = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);
  const oppName = (id: string) => opponents?.find((o) => o.id === id)?.name ?? '（相手不明）';
  const sorted = [...(matches ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  return (
    <div class="screen">
      <h1>バレー記録</h1>
      <div class="grid">
        <button class="primary big" onClick={() => navigate('/match/new')}>新しい試合を記録</button>
        <button class="big" onClick={() => navigate('/analysis')}>分析を見る</button>
        <button class="big" onClick={() => navigate('/roster')}>選手登録</button>
        <button class="big" onClick={() => navigate('/opponents')}>相手チーム登録</button>
        <button class="big" onClick={() => navigate('/settings')}>設定</button>
      </div>
      <h2>試合一覧</h2>
      {matches === undefined ? <p class="muted">読み込み中…</p> : sorted.length === 0 ? <p class="muted">まだ試合がありません</p> : (
        <ul class="list">
          {sorted.map((m) => (
            <li key={m.id} class="row">
              <span class="grow">{m.date}　{m.kind === 'official' ? '公式戦' : '練習試合'}　vs {oppName(m.opponentId)}{m.tournament ? `（${m.tournament}）` : ''}</span>
              <button onClick={() => navigate(`/match/${encodeURIComponent(m.id)}/live`)}>記録</button>
              <button onClick={() => navigate(`/match/${encodeURIComponent(m.id)}/view`)}>見る</button>
              <button onClick={() => navigate(`/match/${encodeURIComponent(m.id)}/reception`)}>レシーブ</button>
              <button onClick={() => navigate(`/match/${encodeURIComponent(m.id)}/edit`)}>修正</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
