import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../data/store';
import { StoreProvider } from '../data/StoreContext';
import { Home } from './screens/Home';
import { Analysis } from './screens/Analysis';
import { Join } from './screens/Join';
import { EventEdit } from './screens/EventEdit';
import { Live } from './screens/Live';
import { ReceptionScreen } from './screens/Reception';
import { MatchSetup } from './screens/MatchSetup';
import { Opponents } from './screens/Opponents';
import { Roster } from './screens/Roster';
import { Settings } from './screens/Settings';
import { clearError, onMessage } from './notify';
import { navigate, useRoute } from './router';

function Banner() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => onMessage(setMsg), []);
  if (!msg) return null;
  return (
    <div class="banner error-banner" role="alert">
      <span class="grow">{msg}</span>
      <button onClick={clearError}>閉じる</button>
    </div>
  );
}

function Placeholder() {
  return (
    <div class="screen">
      <h1>準備中</h1>
      <p class="muted">この画面はまだ作られていません。</p>
    </div>
  );
}

export function App({ store, teamId }: { store: Store | null; teamId: string | null }) {
  const route = useRoute();

  // クラウド設定済みで未参加（store なし）のときは参加画面のみ
  if (!store) {
    return (
      <>
        <Banner />
        <Join />
      </>
    );
  }

  let screen;
  switch (route.name) {
    case 'home': screen = <Home />; break;
    case 'join': screen = <Join />; break;
    case 'analysis': screen = <Analysis />; break;
    case 'roster': screen = <Roster />; break;
    case 'opponents': screen = <Opponents />; break;
    case 'settings': screen = <Settings teamId={teamId} />; break;
    case 'matchNew': screen = <MatchSetup />; break;
    case 'matchLive': screen = <Live key={`live:${route.id}`} id={route.id} readonly={false} />; break;
    case 'matchView': screen = <Live key={`view:${route.id}`} id={route.id} readonly />; break;
    case 'matchReception': screen = <ReceptionScreen key={`rc:${route.id}`} id={route.id} />; break;
    case 'matchEdit': screen = <EventEdit key={`ed:${route.id}`} id={route.id} />; break;
    default: screen = <Placeholder />;
  }

  return (
    <StoreProvider store={store}>
      {store.mode === 'local' && <div class="banner local-banner">お試しモード（この端末だけに保存）</div>}
      <Banner />
      {route.name !== 'home' && (
        <nav class="topnav"><button onClick={() => navigate('/')}>← ホーム</button></nav>
      )}
      {screen}
    </StoreProvider>
  );
}
