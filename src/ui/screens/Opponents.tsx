import { useState } from 'preact/hooks';
import type { OpponentTeam, Position } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { report } from '../notify';
import { useBusy } from '../useBusy';
import { POSITIONS, POSITION_LABEL, validateOpponentPlayer } from '../validate';

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function Opponents() {
  const store = useStore();
  const teams = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);
  const [teamName, setTeamName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, run] = useBusy();

  async function addTeam() {
    const name = teamName.trim();
    if (!name) return;
    const t: OpponentTeam = { id: newId(), name, players: [] };
    await run(async () => { if (await report(store.saveOpponent(t))) { setTeamName(''); setSelectedId(t.id); } });
  }

  const selected = teams?.find((t) => t.id === selectedId) ?? null;
  return (
    <div class="screen">
      <h1>相手チーム登録</h1>
      <section class="card">
        <h2>相手チームを追加</h2>
        <div class="form-row">
          <label class="field grow">チーム名
            <input value={teamName} onInput={(e) => setTeamName(e.currentTarget.value)} />
          </label>
          <button class="primary" disabled={busy} onClick={addTeam}>追加</button>
        </div>
      </section>
      <h2>相手チーム一覧</h2>
      {teams === undefined ? <p class="muted">読み込み中…</p> : teams.length === 0 ? <p class="muted">まだ相手チームがありません</p> : (
        <ul class="list">
          {teams.map((t) => (
            <li key={t.id} class={`row${t.id === selectedId ? ' selected' : ''}`}>
              <span class="grow">{t.name}（{t.players.length}人）</span>
              <button onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}>{t.id === selectedId ? '閉じる' : '選手を編集'}</button>
              {store.role() === 'admin' && (
                <button class="danger" onClick={async () => { if (await report(store.deleteOpponent(t.id)) && t.id === selectedId) setSelectedId(null); }}>削除</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected && <TeamEditor key={selected.id} team={selected} />}
    </div>
  );
}

function TeamEditor({ team }: { team: OpponentTeam }) {
  const store = useStore();
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [no, setNo] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position | ''>('');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();

  const reset = () => { setEditingNo(null); setNo(''); setName(''); setPosition(''); setError(''); };

  async function save() {
    const r = validateOpponentPlayer({ no, name, position }, team.players, editingNo);
    if (!r.ok) { setError(r.error); return; }
    const players = [...team.players.filter((p) => p.no !== editingNo), r.value].sort((a, b) => a.no - b.no);
    await run(async () => { if (await report(store.saveOpponent({ ...team, players }))) reset(); });
  }

  const sorted = [...team.players].sort((a, b) => a.no - b.no);
  return (
    <section class="card">
      <h2>{team.name} の選手</h2>
      <div class="form-row">
        <label class="field">背番号（必須）
          <input inputMode="numeric" value={no} onInput={(e) => setNo(e.currentTarget.value)} />
        </label>
        <label class="field grow">名前（任意）
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">ポジション（任意）
          <select value={position} onChange={(e) => setPosition(e.currentTarget.value as Position | '')}>
            <option value="">?（不明）</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </select>
        </label>
      </div>
      {error && <p class="error" role="alert">{error}</p>}
      <div class="row">
        <button class="primary" disabled={busy} onClick={save}>{editingNo === null ? '選手を追加' : '保存'}</button>
        {editingNo !== null && <button onClick={reset}>キャンセル</button>}
      </div>
      {sorted.length === 0 ? <p class="muted">選手が未登録です</p> : (
        <ul class="list">
          {sorted.map((p) => (
            <li key={p.no} class="row">
              <span class="no">{p.no}</span>
              <span class="grow">{p.name || '（名前なし）'}</span>
              <span class="tag">{p.position ?? '?'}</span>
              <button onClick={() => { setEditingNo(p.no); setNo(String(p.no)); setName(p.name); setPosition(p.position ?? ''); setError(''); }}>編集</button>
              <button class="danger" onClick={() => report(store.saveOpponent({ ...team, players: team.players.filter((q) => q.no !== p.no) }))}>削除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
