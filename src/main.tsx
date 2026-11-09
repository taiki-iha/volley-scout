import { render } from 'preact';
import { App } from './ui/App';
import { createMemoryStore } from './data/memoryStore';
import { createFirestoreStore } from './data/firestoreStore';
import { currentMembership, getFirebase, isCloudConfigured } from './data/auth';
import { showError } from './ui/notify';
import type { Store } from './data/store';
import './styles/app.css';

async function boot() {
  const root = document.getElementById('app')!;
  let store: Store | null = null;
  let teamId: string | null = null;

  if (!isCloudConfigured()) {
    // お試しモード: この端末の localStorage だけに保存
    store = createMemoryStore(localStorage);
  } else {
    const m = await currentMembership();
    if (m) {
      store = createFirestoreStore(getFirebase().db, m.teamId, m.role, (e) => showError(e));
      teamId = m.teamId;
    } else if (location.hash !== '#/join') {
      location.hash = '#/join';
    }
  }
  render(<App store={store} teamId={teamId} />, root);
}

boot().catch((e) => {
  document.getElementById('app')!.textContent = `起動できませんでした: ${e instanceof Error ? e.message : String(e)}`;
});
