import { useState } from 'preact/hooks';
import type { Player, Position } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { report } from '../notify';
import { POSITIONS, POSITION_LABEL, validatePlayer } from '../validate';

export function Roster() {
  const store = useStore();
  const players = useWatch<Player[]>((cb) => store.watchPlayers(cb), [store]);
  const [editingNo, setEditingNo] = useState<number | null>(null);
  const [no, setNo] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('OH');
  const [error, setError] = useState('');

  const reset = () => { setEditingNo(null); setNo(''); setName(''); setPosition('OH'); setError(''); };

  async function save() {
    const r = validatePlayer({ no, name, position }, players ?? [], editingNo);
    if (!r.ok) { setError(r.error); return; }
    reset();
    await report(store.savePlayer(r.value));
  }

  const sorted = [...(players ?? [])].sort((a, b) => a.no - b.no);
  return (
    <div class="screen">
      <h1>選手登録</h1>
      <section class="card">
        <h2>{editingNo === null ? '選手を追加' : `背番号${editingNo}を編集`}</h2>
        <div class="form-row">
          <label class="field">背番号
            <input inputMode="numeric" value={no} disabled={editingNo !== null} onInput={(e) => setNo(e.currentTarget.value)} />
          </label>
          <label class="field grow">名前
            <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <label class="field">ポジション
            <select value={position} onChange={(e) => setPosition(e.currentTarget.value as Position)}>
              {POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
            </select>
          </label>
        </div>
        {error && <p class="error" role="alert">{error}</p>}
        <div class="row">
          <button class="primary" onClick={save}>{editingNo === null ? '追加' : '保存'}</button>
          {editingNo !== null && <button onClick={reset}>キャンセル</button>}
        </div>
      </section>
      <h2>選手一覧（{sorted.length}人）</h2>
      {players === undefined ? <p class="muted">読み込み中…</p> : sorted.length === 0 ? <p class="muted">まだ選手がいません</p> : (
        <ul class="list">
          {sorted.map((p) => (
            <li key={p.no} class="row">
              <span class="no">{p.no}</span>
              <span class="grow">{p.name}</span>
              <span class="tag">{p.position}</span>
              <button onClick={() => { setEditingNo(p.no); setNo(String(p.no)); setName(p.name); setPosition(p.position); setError(''); }}>編集</button>
              {store.role() === 'admin' && <button class="danger" onClick={() => report(store.deletePlayer(p.no))}>削除</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
