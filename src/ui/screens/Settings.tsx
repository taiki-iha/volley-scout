import { useEffect, useState } from 'preact/hooks';
import { changeCodes } from '../../data/auth';
import { useStore, useWatch } from '../../data/StoreContext';
import { DEFAULT_SETTINGS, type Settings as SettingsData } from '../../data/store';
import { report } from '../notify';
import { parseThresholds, parseTimeoutSec, toPercent } from '../validate';

export function Settings({ teamId }: { teamId: string | null }) {
  const store = useStore();
  const settings = useWatch<SettingsData>((cb) => store.watchSettings(cb), [store]);
  const cur = settings ?? DEFAULT_SETTINGS;
  const th = cur.thresholds;
  const [minSpikes, setMinSpikes] = useState(String(th.minSpikes));
  const [pct, setPct] = useState(String(toPercent(th.maxKillRate)));
  const [serveErr, setServeErr] = useState(String(th.maxServeErrorsPerSet));
  const [toSec, setToSec] = useState(String(cur.timeoutSec));
  const [toSound, setToSound] = useState(cur.timeoutSound);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  // 保存済みの値が届いたら入力欄に反映（初回のみ）
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (settings && !loaded) {
      setLoaded(true);
      setMinSpikes(String(settings.thresholds.minSpikes));
      setPct(String(toPercent(settings.thresholds.maxKillRate)));
      setServeErr(String(settings.thresholds.maxServeErrorsPerSet));
      setToSec(String(settings.timeoutSec));
      setToSound(settings.timeoutSound);
    }
  }, [settings]);

  async function save() {
    const r = parseThresholds({ minSpikes, maxKillRatePct: pct, maxServeErrorsPerSet: serveErr });
    if (!r.ok) { setError(r.error); setSaved(false); return; }
    const sec = parseTimeoutSec(toSec);
    if (!sec.ok) { setError(sec.error); setSaved(false); return; }
    setError('');
    setSaved(await report(store.saveSettings({ thresholds: r.value, timeoutSec: sec.value, timeoutSound: toSound })));
  }

  return (
    <div class="screen">
      <h1>設定</h1>
      <section class="card">
        <h2>調子が悪いと判定する基準</h2>
        <label class="field">この本数以上のスパイクを打って（本）
          <input inputMode="numeric" value={minSpikes} onInput={(e) => { setMinSpikes(e.currentTarget.value); setSaved(false); }} />
        </label>
        <label class="field">決定率がこの値より低い（%）
          <input inputMode="decimal" value={pct} onInput={(e) => { setPct(e.currentTarget.value); setSaved(false); }} />
        </label>
        <label class="field">1セットのサーブミスがこの数以上（本）
          <input inputMode="numeric" value={serveErr} onInput={(e) => { setServeErr(e.currentTarget.value); setSaved(false); }} />
        </label>
      </section>
      <section class="card">
        <h2>タイムアウト</h2>
        <label class="field">タイムアウトの長さ（秒・10〜120。6人制は30秒）
          <input inputMode="numeric" value={toSec} onInput={(e) => { setToSec(e.currentTarget.value); setSaved(false); }} />
        </label>
        <label class="check-field">
          <input type="checkbox" checked={toSound} onChange={(e) => { setToSound(e.currentTarget.checked); setSaved(false); }} />
          タイムアウト終了を音で知らせる
        </label>
      </section>
      {/* 1つのボタンで上の2つのカードをまとめて保存する */}
      {error && <p class="error" role="alert">{error}</p>}
      {saved && <p class="ok">保存しました</p>}
      <button class="primary" onClick={save}>設定をすべて保存</button>
      {store.mode === 'cloud' && store.role() === 'admin' && teamId && <ChangeCodes teamId={teamId} />}
    </div>
  );
}

function ChangeCodes({ teamId }: { teamId: string }) {
  const [memberCode, setMemberCode] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setError(''); setMsg('');
    try {
      await changeCodes(teamId, memberCode, adminCode);
      setMsg('コードを変更しました。旧コードの端末は新しいコードで参加し直してください。');
      setMemberCode(''); setAdminCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <section class="card">
      <h2>コード変更（監督のみ）</h2>
      <label class="field">新しい生徒用コード（8文字以上）
        <input value={memberCode} onInput={(e) => setMemberCode(e.currentTarget.value.trim())} autocomplete="off" />
      </label>
      <label class="field">新しい監督用コード（8文字以上）
        <input value={adminCode} onInput={(e) => setAdminCode(e.currentTarget.value.trim())} autocomplete="off" />
      </label>
      {error && <p class="error" role="alert">{error}</p>}
      {msg && <p class="ok">{msg}</p>}
      <button class="primary" disabled={busy || !memberCode || !adminCode} onClick={run}>コードを変更する</button>
    </section>
  );
}
