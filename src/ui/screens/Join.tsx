import { useState } from 'preact/hooks';
import { createTeam, joinTeam } from '../../data/auth';

function done() {
  location.hash = '#/';
  location.reload();
}

export function Join() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(f: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await f();
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div class="screen">
      <h1>チームに参加</h1>
      <section class="card">
        <h2>チームコードを入力</h2>
        <label class="field">チームコード
          <input value={code} onInput={(e) => setCode(e.currentTarget.value.trim())} placeholder="8文字以上" autocomplete="off" />
        </label>
        <button class="primary" disabled={busy || !code} onClick={() => run(() => joinTeam(code))}>参加する</button>
      </section>
      <section class="card">
        <h2>新しいチームを作る</h2>
        <label class="field">チーム名
          <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">生徒用コード（選手用・8文字以上）
          <input value={memberCode} onInput={(e) => setMemberCode(e.currentTarget.value.trim())} autocomplete="off" />
        </label>
        <label class="field">監督用コード（8文字以上・生徒用と別のもの）
          <input value={adminCode} onInput={(e) => setAdminCode(e.currentTarget.value.trim())} autocomplete="off" />
        </label>
        <button class="primary" disabled={busy || !name || !memberCode || !adminCode} onClick={() => run(() => createTeam(name, memberCode, adminCode))}>チームを作る</button>
      </section>
      {error && <p class="error" role="alert">{error}</p>}
      {busy && <p class="muted">通信中…</p>}
    </div>
  );
}
