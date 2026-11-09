import { useRef, useState } from 'preact/hooks';
import type { OpponentTeam } from '../../core/types';
import { useStore, useWatch } from '../../data/StoreContext';
import { buildMatchConfig, type FormatChoice } from '../live.logic';
import { report } from '../notify';
import { navigate } from '../router';
import { useBusy } from '../useBusy';

const NEW = '__new__';

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function MatchSetup() {
  const store = useStore();
  const teams = useWatch<OpponentTeam[]>((cb) => store.watchOpponents(cb), [store]);
  const [kind, setKind] = useState<'practice' | 'official'>('practice');
  const [date, setDate] = useState(today());
  const [opponentId, setOpponentId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [tournament, setTournament] = useState('');
  const [format, setFormat] = useState<FormatChoice>('bo3');
  const [fixedSets, setFixedSets] = useState('3');
  const [points, setPoints] = useState('25');
  const [finalSetPoints, setFinalSetPoints] = useState('15');
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const newTeamId = useRef<string | null>(null);  // 新しい相手チームの ID（二重送信でも同じチームになる）

  async function create() {
    const cfg = buildMatchConfig({ format, fixedSets, points, finalSetPoints });
    if (!cfg.ok) { setError(cfg.error); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('日付を入れてください'); return; }
    if (!opponentId) { setError('相手チームを選んでください'); return; }
    if (opponentId === NEW && !newTeamName.trim()) { setError('新しい相手チームの名前を入れてください'); return; }
    setError('');
    await run(async () => {
      let oppId = opponentId;
      if (opponentId === NEW) {
        const t: OpponentTeam = { id: (newTeamId.current ??= newId()), name: newTeamName.trim(), players: [] };
        if (!(await report(store.saveOpponent(t)))) return;
        oppId = t.id;
      }
      let id = '';
      const ok = await report(store.createMatch({ date, kind, opponentId: oppId, tournament: tournament.trim(), config: cfg.value }).then((x) => { id = x; }));
      if (ok) navigate(`/match/${encodeURIComponent(id)}/live`);
    });
  }

  return (
    <div class="screen">
      <h1>新しい試合</h1>
      <section class="card">
        <h2>種別</h2>
        <div class="row">
          <button class={kind === 'practice' ? 'primary' : ''} onClick={() => setKind('practice')}>練習試合</button>
          <button class={kind === 'official' ? 'primary' : ''} onClick={() => setKind('official')}>公式戦</button>
        </div>
        <div class="form-row" style={{ marginTop: '12px' }}>
          <label class="field">日付
            <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
          </label>
          <label class="field grow">相手チーム
            <select value={opponentId} onChange={(e) => setOpponentId(e.currentTarget.value)}>
              <option value="">選んでください</option>
              {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value={NEW}>＋ 新しい相手チーム</option>
            </select>
          </label>
          {opponentId === NEW && (
            <label class="field grow">新しい相手チーム名
              <input value={newTeamName} onInput={(e) => { newTeamId.current = null; setNewTeamName(e.currentTarget.value); }} />
            </label>
          )}
        </div>
        <label class="field">大会名（任意）
          <input value={tournament} onInput={(e) => setTournament(e.currentTarget.value)} />
        </label>
      </section>
      <section class="card">
        <h2>試合形式</h2>
        <div class="row">
          <button class={format === 'bo3' ? 'primary' : ''} onClick={() => setFormat('bo3')}>3セットマッチ</button>
          <button class={format === 'bo5' ? 'primary' : ''} onClick={() => setFormat('bo5')}>5セットマッチ</button>
          <button class={format === 'fixed' ? 'primary' : ''} onClick={() => setFormat('fixed')}>セット数固定</button>
        </div>
        <div class="form-row" style={{ marginTop: '12px' }}>
          {format === 'fixed' && (
            <label class="field">セット数
              <input inputMode="numeric" value={fixedSets} onInput={(e) => setFixedSets(e.currentTarget.value)} />
            </label>
          )}
          <label class="field">1セットの点数
            <input inputMode="numeric" value={points} onInput={(e) => setPoints(e.currentTarget.value)} />
          </label>
          {format !== 'fixed' && (
            <label class="field">最終セットの点数
              <input inputMode="numeric" value={finalSetPoints} onInput={(e) => setFinalSetPoints(e.currentTarget.value)} />
            </label>
          )}
        </div>
        <p class="muted">{format === 'fixed' ? '勝敗が決まっても全セットを行います。' : 'デュースあり（2点差がつくまで続く）。'}</p>
      </section>
      {error && <p class="error" role="alert">{error}</p>}
      <button class="primary big" disabled={busy} onClick={create}>試合を作成してセット開始へ</button>
    </div>
  );
}
