import { useState } from 'preact/hooks';
import type { Match, OpponentTeam } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { deleteBlockedReason, isPastMatch, localDate } from '../home.logic';
import { showError } from '../notify';
import { navigate } from '../router';
import { useBusy } from '../useBusy';

export function Home() {
  const store = useStore();
  const matches = useWatch<Match[]>((cb) => store.watchMatches(cb), [store]);
  const opponents = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);
  const oppName = (id: string) => opponents?.find((o) => o.id === id)?.name ?? '（相手不明）';
  const sorted = [...(matches ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const isAdmin = store.role() === 'admin';
  const today = localDate(new Date());

  // 削除は「削除」→「本当に削除」の2段階（試合の外なので確認を入れる）
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<{ id: string; text: string } | null>(null);
  const [busy, run] = useBusy();

  const askDelete = (id: string) => {
    const reason = deleteBlockedReason(store.mode, navigator.onLine);
    if (reason) { setConfirmId(null); setDeleteMsg({ id, text: reason }); return; }
    setDeleteMsg(null);
    setConfirmId(id);
  };
  const doDelete = (id: string) => run(async () => {
    const reason = deleteBlockedReason(store.mode, navigator.onLine);
    if (reason) { setConfirmId(null); setDeleteMsg({ id, text: reason }); return; }
    try {
      await store.deleteMatch(id);
      setConfirmId(null);
    } catch (e) {
      showError(e, '削除できませんでした');
    }
  });

  const go = (m: Match, page: string) => () => navigate(`/match/${encodeURIComponent(m.id)}/${page}`);

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
          {sorted.map((m) => {
            // 終わった試合は閲覧を主にする（入力モードの「1つ戻す」で古い記録を消さないように）
            const past = isPastMatch(m, today);
            return (
              <li key={m.id} class="row">
                <span class="grow">{m.date}　{m.kind === 'official' ? '公式戦' : '練習試合'}　vs {oppName(m.opponentId)}{m.tournament ? `（${m.tournament}）` : ''}</span>
                {past ? (
                  <>
                    <button class="primary" onClick={go(m, 'view')}>見る</button>
                    <button onClick={go(m, 'live')}>入力</button>
                  </>
                ) : (
                  <>
                    <button class="primary" onClick={go(m, 'live')}>記録</button>
                    <button onClick={go(m, 'view')}>見る</button>
                  </>
                )}
                <button onClick={go(m, 'reception')}>レシーブ</button>
                <button onClick={go(m, 'edit')}>修正</button>
                {isAdmin && (confirmId === m.id ? (
                  <>
                    <button class="danger" disabled={busy} onClick={() => doDelete(m.id)}>本当に削除</button>
                    <button disabled={busy} onClick={() => setConfirmId(null)}>やめる</button>
                  </>
                ) : (
                  <button class="danger" onClick={() => askDelete(m.id)}>削除</button>
                ))}
                {deleteMsg?.id === m.id && <span class="error">{deleteMsg.text}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
