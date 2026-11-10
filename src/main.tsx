import { render } from 'preact';
import { App } from './ui/App';
import { createMemoryStore } from './data/memoryStore';
import { createFirestoreStore } from './data/firestoreStore';
import { clearMembership, currentMembership, getFirebase, isCloudConfigured, verifyMembership } from './data/auth';
import { REVOKED_MESSAGE, createStoreErrorHandler } from './data/storeErrors';
import { showError, showMessage } from './ui/notify';
import type { Store } from './data/store';
import './styles/app.css';

// 再読み込みをまたいで出すメッセージ（締め出されて参加画面に戻ったときなど）
const FLASH_KEY = 'volley-scout:flash';

function revoked(): void {
  clearMembership();
  try { sessionStorage.setItem(FLASH_KEY, REVOKED_MESSAGE); } catch { /* 出せなくても続行 */ }
  location.hash = '#/join';
  location.reload();
}

const onStoreError = createStoreErrorHandler({
  verify: verifyMembership,
  onRevoked: revoked,
  onOther: (e) => showError(e, '通信エラー'),
});

async function boot() {
  const root = document.getElementById('app')!;
  // 電波が弱いとサーバー確認に時間がかかるので、まず起動中であることを出す
  root.textContent = '起動中…';
  let store: Store | null = null;
  let teamId: string | null = null;

  if (!isCloudConfigured()) {
    // お試しモード: この端末の localStorage だけに保存
    store = createMemoryStore(localStorage);
  } else {
    const m = await currentMembership();
    if (m) {
      store = createFirestoreStore(getFirebase().db, m.teamId, m.role, onStoreError);
      teamId = m.teamId;
    } else if (location.hash !== '#/join') {
      location.hash = '#/join';
    }
  }
  root.textContent = '';
  render(<App store={store} teamId={teamId} />, root);

  let flash: string | null = null;
  try {
    flash = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
  } catch { /* なし */ }
  if (flash) showMessage(flash);
}

boot().catch((e) => {
  document.getElementById('app')!.textContent = `起動できませんでした: ${e instanceof Error ? e.message : String(e)}`;
});
