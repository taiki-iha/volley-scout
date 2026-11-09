import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth, signInAnonymously } from 'firebase/auth';
import { type Firestore, collection, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from '../firebaseConfig';
import { openFirestore } from './firestoreStore';

// チームコードによる参加（匿名認証）。
// - チームを作ると「選手用コード（member）」と「監督用コード（admin）」の2つができる。
// - 端末のデータが消えても、監督用コードで参加し直せば監督に戻れる。
// - 監督がコードを変更すると、旧コードで参加していた端末は読めなくなる（codeVersion）。

export type Role = 'admin' | 'member';
export interface Membership { teamId: string; role: Role; }

const MEMBERSHIP_KEY = 'volley-scout:membership';

export function isCloudConfigured(): boolean {
  return firebaseConfig !== null;
}

/** Firebase アプリ・認証・Firestore を返す（初回に初期化）。firebaseConfig が null なら例外。 */
export function getFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!firebaseConfig) throw new Error('Firebase が設定されていません（お試しモード）');
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return { app, auth: getAuth(app), db: openFirestore(app) };
}

async function ensureSignedIn(): Promise<{ uid: string; db: Firestore }> {
  const { auth, db } = getFirebase();
  await auth.authStateReady();
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  return { uid: user.uid, db };
}

/** コードの形式チェック（8 文字以上。Firestore のドキュメントID に使えない文字は不可） */
export function validateCode(code: string): void {
  if (code.length < 8) throw new Error('コードは8文字以上にしてください');
  if (code.length > 64) throw new Error('コードは64文字以内にしてください');
  if (/[/\s]/.test(code) || /^__.*__$/.test(code) || code === '.' || code === '..') {
    throw new Error('コードに空白や「/」は使えません');
  }
}
function validateCodePair(memberCode: string, adminCode: string): void {
  validateCode(memberCode);
  validateCode(adminCode);
  if (memberCode === adminCode) throw new Error('選手用と監督用は別のコードにしてください');
}

function saveMembership(m: Membership | null): void {
  try {
    if (m) localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(m));
    else localStorage.removeItem(MEMBERSHIP_KEY);
  } catch { /* 保存できなくても続行 */ }
}
function loadMembership(): Membership | null {
  try {
    const raw = localStorage.getItem(MEMBERSHIP_KEY);
    return raw ? (JSON.parse(raw) as Membership) : null;
  } catch {
    return null;
  }
}

const codeTaken = (e: unknown) =>
  (e as { code?: string })?.code === 'permission-denied'
    ? new Error('このコードは使えません。別のコードにしてください')
    : e;

/** チームを作る。作った端末は監督として参加する。ネット接続が必要。 */
export async function createTeam(name: string, memberCode: string, adminCode: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('チーム名を入れてください');
  if (trimmed.length > 50) throw new Error('チーム名は50文字以内にしてください');
  validateCodePair(memberCode, adminCode);
  const { uid, db } = await ensureSignedIn();
  // 既に使われているコードは上書きできない（ルールで拒否される）ので、先に確認して分かりやすく伝える
  for (const c of [memberCode, adminCode]) {
    if ((await getDoc(doc(db, 'joinCodes', c))).exists()) throw new Error('このコードは使えません。別のコードにしてください');
  }
  const teamRef = doc(collection(db, 'teams')); // 自動ID（英数字20文字）
  const teamId = teamRef.id;
  const b = writeBatch(db);
  b.set(teamRef, { name: trimmed, codeVersion: 1 });
  b.set(doc(db, 'joinCodes', memberCode), { teamId, role: 'member', codeVersion: 1 });
  b.set(doc(db, 'joinCodes', adminCode), { teamId, role: 'admin', codeVersion: 1 });
  b.set(doc(db, 'teams', teamId, 'members', uid), { role: 'admin', codeVersion: 1, code: adminCode });
  try {
    await b.commit();
  } catch (e) {
    throw codeTaken(e);
  }
  saveMembership({ teamId, role: 'admin' });
  return teamId;
}

/** コードでチームに参加する。ネット接続が必要。 */
export async function joinTeam(code: string): Promise<Membership> {
  validateCode(code);
  const { uid, db } = await ensureSignedIn();
  const snap = await getDoc(doc(db, 'joinCodes', code));
  if (!snap.exists()) throw new Error('コードが違います');
  const { teamId, role, codeVersion } = snap.data() as { teamId: string; role: Role; codeVersion: number };
  try {
    await setDoc(doc(db, 'teams', teamId, 'members', uid), { role, codeVersion, code });
  } catch (e) {
    // 古いコード（監督が変更済み）だとルールで拒否される
    if ((e as { code?: string })?.code === 'permission-denied') throw new Error('このコードは使えなくなっています。監督に新しいコードを聞いてください');
    throw e;
  }
  const m = { teamId, role };
  saveMembership(m);
  return m;
}

/** 参加コードを変更する（監督のみ）。旧コードで参加していた端末は新しいコードで参加し直す必要がある。 */
export async function changeCodes(teamId: string, newMemberCode: string, newAdminCode: string): Promise<void> {
  validateCodePair(newMemberCode, newAdminCode);
  const { uid, db } = await ensureSignedIn();
  for (const c of [newMemberCode, newAdminCode]) {
    if ((await getDoc(doc(db, 'joinCodes', c))).exists()) throw new Error('このコードは使えません。別のコードにしてください');
  }
  const teamRef = doc(db, 'teams', teamId);
  const team = await getDoc(teamRef);
  if (!team.exists()) throw new Error('チームが見つかりません');
  const v = (team.data().codeVersion as number) + 1;
  const b = writeBatch(db);
  b.update(teamRef, { codeVersion: v });
  b.set(doc(db, 'joinCodes', newMemberCode), { teamId, role: 'member', codeVersion: v });
  b.set(doc(db, 'joinCodes', newAdminCode), { teamId, role: 'admin', codeVersion: v });
  b.set(doc(db, 'teams', teamId, 'members', uid), { role: 'admin', codeVersion: v, code: newAdminCode });
  try {
    await b.commit();
  } catch (e) {
    throw codeTaken(e);
  }
  saveMembership({ teamId, role: 'admin' });
}

/**
 * この端末の参加状況。未参加・コード変更で無効になった場合は null。
 * オフラインでサーバーに確認できないときは、前回の参加状況をそのまま返す（オフラインでも記録できるように）。
 */
export async function currentMembership(): Promise<Membership | null> {
  if (!isCloudConfigured()) return null;
  const saved = loadMembership();
  if (!saved) return null;
  const { auth, db } = getFirebase();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) { saveMembership(null); return null; }
  try {
    const [member, team] = await Promise.all([
      getDoc(doc(db, 'teams', saved.teamId, 'members', user.uid)),
      getDoc(doc(db, 'teams', saved.teamId)),
    ]);
    if (!member.exists() || !team.exists() || member.data().codeVersion !== team.data().codeVersion) {
      saveMembership(null);
      return null;
    }
    const m = { teamId: saved.teamId, role: member.data().role as Role };
    saveMembership(m);
    return m;
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') { saveMembership(null); return null; }
    return saved; // オフラインなど
  }
}
