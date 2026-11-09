import type { FirebaseApp } from 'firebase/app';
import {
  type CollectionReference, type DocumentData, type DocumentReference, type Firestore, type Query,
  collection, deleteDoc, doc, getDoc, getDocFromCache, getDocs, getDocsFromCache, initializeFirestore,
  onSnapshot, orderBy, persistentLocalCache, persistentMultipleTabManager, query, setDoc, writeBatch,
} from 'firebase/firestore';
import { DEFAULT_THRESHOLDS } from '../core/condition';
import type { Match, MatchEvent, OpponentTeam, Player, Reception } from '../core/types';
import { applyEventPatch, buildNextEvent, lastEvent } from './eventPatch';
import type { Settings, Store, Unsub } from './store';

const dbs = new WeakMap<FirebaseApp, Firestore>();

/** オフライン保存（IndexedDB の永続キャッシュ、複数タブ対応）を有効にした Firestore を返す。アプリごとに1回だけ初期化する。 */
export function openFirestore(app: FirebaseApp): Firestore {
  let db = dbs.get(app);
  if (!db) {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
    dbs.set(app, db);
  }
  return db;
}

/** キャッシュにあればキャッシュから、なければサーバーから読む */
async function readDocs(q: Query): Promise<DocumentData[]> {
  try {
    const snap = await getDocsFromCache(q);
    if (!snap.empty) return snap.docs.map((d) => d.data());
  } catch { /* キャッシュなし */ }
  return (await getDocs(q)).docs.map((d) => d.data());
}

/**
 * Firestore 版 Store。パスは teams/{teamId}/... 。
 *
 * 書き込みとオフライン: 永続キャッシュ上では書き込みは即座にローカルへ反映され、watch* にも
 * すぐ通知されるが、setDoc などの Promise はサーバーが受け付けるまで（＝オフライン中はずっと）解決しない。
 * そこで書き込み系メソッドはサーバー確認を待たずに、書き込みを発行した時点で解決する。
 * サーバー側で拒否された（権限など）エラーは onError に渡す。UI は await しても止まらない。
 *
 * appendEvent の seq は、この端末が受け取り済みの最大 seq + 1（watchEvents の最新スナップショットと
 * この端末で発行済みの書き込みから計算）。別端末との同時入力は後勝ちで許容する（spec どおり）。
 */
export function createFirestoreStore(
  db: Firestore,
  teamId: string,
  role: 'admin' | 'member',
  onError: (e: unknown) => void = (e) => console.error('Firestore への保存に失敗しました', e),
): Store {
  const team = (...path: string[]) => [`teams/${teamId}`, ...path].join('/');
  const col = (...path: string[]) => collection(db, team(...path)) as CollectionReference<DocumentData>;
  const ref = (...path: string[]) => doc(db, team(...path));
  const eventsCol = (matchId: string) => col('matches', matchId, 'events');
  const eventsQuery = (matchId: string) => query(eventsCol(matchId), orderBy('seq'));

  /** サーバー確認を待たない書き込み（上のコメント参照） */
  const fire = (p: Promise<unknown>): void => { p.catch(onError); };

  // 試合ごとの「この端末から見た」最新イベント一覧。スナップショット受信と自分の書き込みで更新する。
  const localEvents = new Map<string, MatchEvent[]>();
  const listenCount = new Map<string, number>();

  async function currentEvents(matchId: string): Promise<MatchEvent[]> {
    const cached = localEvents.get(matchId);
    if (cached) return cached;
    const list = (await readDocs(eventsQuery(matchId))) as MatchEvent[];
    return localEvents.get(matchId) ?? list;
  }
  const setLocal = (matchId: string, list: MatchEvent[]) => {
    // 監視していない試合の一覧は保持し続けない（次回は読み直す）
    if (listenCount.get(matchId)) localEvents.set(matchId, list);
  };

  function watchList<T>(q: Query, cb: (v: T[]) => void): Unsub {
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as T)), onError);
  }

  /** まとめて削除（1バッチ 500 件の上限があるので 400 件ずつ）。確定は待たない。 */
  function deleteAll(refs: DocumentReference[]): void {
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => b.delete(r));
      fire(b.commit());
    }
  }

  return {
    mode: 'cloud',
    role: () => role,

    watchPlayers: (cb) => watchList<Player>(query(col('players'), orderBy('no')), cb),
    async savePlayer(p) { fire(setDoc(ref('players', String(p.no)), p)); },
    async deletePlayer(no) { fire(deleteDoc(ref('players', String(no)))); },

    watchOpponents: (cb) => watchList<OpponentTeam>(col('opponents'), cb),
    async saveOpponent(o) { fire(setDoc(ref('opponents', o.id), o)); },
    async deleteOpponent(id) { fire(deleteDoc(ref('opponents', id))); },

    watchMatches: (cb) => watchList<Match>(query(col('matches'), orderBy('createdAt')), cb),
    async createMatch(m) {
      const r = doc(col('matches'));
      fire(setDoc(r, { ...m, id: r.id, createdAt: Date.now() }));
      return r.id;
    },
    async deleteMatch(id) {
      // 子コレクション（events / receptions）も消す。一覧の読み取りは待つが、削除の確定は待たない。
      const [evs, recs] = await Promise.all([
        getDocs(col('matches', id, 'events')),
        getDocs(col('matches', id, 'receptions')),
      ]);
      deleteAll([...evs.docs, ...recs.docs].map((d) => d.ref));
      localEvents.delete(id);
      fire(deleteDoc(ref('matches', id)));
    },

    watchEvents(matchId, cb) {
      listenCount.set(matchId, (listenCount.get(matchId) ?? 0) + 1);
      const unsub = onSnapshot(
        eventsQuery(matchId),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as MatchEvent);
          localEvents.set(matchId, list);
          cb(list);
        },
        onError,
      );
      return () => {
        unsub();
        const n = (listenCount.get(matchId) ?? 1) - 1;
        if (n > 0) listenCount.set(matchId, n);
        else { listenCount.delete(matchId); localEvents.delete(matchId); }
      };
    },
    async appendEvent(matchId, e) {
      const list = await currentEvents(matchId);
      const ev = buildNextEvent(list, e, Date.now());
      // スナップショットが届く前に続けて入力されても seq が重ならないよう、先に手元へ反映する
      setLocal(matchId, [...list, ev]);
      fire(setDoc(doc(eventsCol(matchId), ev.id), ev));
    },
    async undoLast(matchId) {
      const list = await currentEvents(matchId);
      const last = lastEvent(list);
      if (!last) return;
      setLocal(matchId, list.filter((x) => x.seq !== last.seq));
      fire(deleteDoc(doc(eventsCol(matchId), last.id)));
    },
    async updateEvent(matchId, id, patch) {
      let cur = (await currentEvents(matchId)).find((x) => x.id === id);
      if (!cur) {
        const r = doc(eventsCol(matchId), id);
        const snap = await getDocFromCache(r).catch(() => getDoc(r));
        cur = snap.exists() ? (snap.data() as MatchEvent) : undefined;
      }
      if (!cur) throw new Error('対象のイベントが見つかりません');
      const next = applyEventPatch(cur, patch);
      const list = localEvents.get(matchId);
      if (list) setLocal(matchId, list.map((x) => (x.id === id ? next : x)));
      fire(setDoc(doc(eventsCol(matchId), id), next));
    },

    watchReceptions: (matchId, cb) => watchList<Reception>(col('matches', matchId, 'receptions'), cb),
    async saveReception(matchId, r) { fire(setDoc(doc(col('matches', matchId, 'receptions'), r.rallyId), r)); },

    watchSettings(cb) {
      return onSnapshot(
        ref('settings', 'main'),
        (snap) => cb(snap.exists() ? (snap.data() as Settings) : { thresholds: DEFAULT_THRESHOLDS }),
        onError,
      );
    },
    async saveSettings(s) { fire(setDoc(ref('settings', 'main'), s)); },
  };
}
