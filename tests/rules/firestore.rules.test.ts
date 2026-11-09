// Firestore セキュリティルールのテスト。エミュレーターが必要（Java 21）。
// 実行: npm run test:rules （firebase emulators:exec が FIRESTORE_EMULATOR_HOST を設定する）
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  type Firestore, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

const T = 'team1';
const MEMBER = 'member01';
const ADMIN = 'admin001';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-volley-scout',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'teams', T), { name: 'テスト中学', codeVersion: 1 });
    await setDoc(doc(db, 'joinCodes', MEMBER), { teamId: T, role: 'member', codeVersion: 1 });
    await setDoc(doc(db, 'joinCodes', ADMIN), { teamId: T, role: 'admin', codeVersion: 1 });
    await setDoc(doc(db, 'teams', T, 'players', '4'), { no: 4, name: '山田', position: 'OH' });
    await setDoc(doc(db, 'teams', T, 'matches', 'm1'), { id: 'm1', createdAt: 1 });
    await setDoc(doc(db, 'teams', T, 'matches', 'm1', 'events', '0000000001'), { id: '0000000001', seq: 1 });
  });
});

const dbOf = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;
const join = (uid: string, code: string, role: 'admin' | 'member', codeVersion = 1) =>
  setDoc(doc(dbOf(uid), 'teams', T, 'members', uid), { role, codeVersion, code });

describe('firestore.rules', () => {
  it('非メンバーは players を読めない（未ログインも不可）', async () => {
    await assertFails(getDoc(doc(dbOf('eve'), 'teams', T, 'players', '4')));
    await assertFails(getDocs(collection(dbOf('eve'), 'teams', T, 'players')));
    await assertFails(getDoc(doc(dbOf('eve'), 'teams', T)));
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, 'teams', T, 'players', '4')));
    await assertFails(getDoc(doc(anon, 'joinCodes', MEMBER)));
  });

  it('非メンバー・未ログインは書き込めない', async () => {
    const eve = dbOf('eve');
    await assertFails(setDoc(doc(eve, 'teams', T, 'players', '7'), { no: 7, name: '侵入', position: 'S' }));
    await assertFails(setDoc(doc(eve, 'teams', T, 'matches', 'm2'), { id: 'm2', createdAt: 2 }));
    await assertFails(setDoc(doc(eve, 'teams', T, 'matches', 'm1', 'events', '0000000002-x'), { id: '0000000002-x', seq: 2 }));
    await assertFails(deleteDoc(doc(eve, 'teams', T, 'matches', 'm1', 'events', '0000000001')));
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(setDoc(doc(anon, 'teams', T, 'players', '7'), { no: 7, name: '侵入', position: 'S' }));
    await assertFails(setDoc(doc(anon, 'teams', T, 'matches', 'm1', 'events', '0000000002-x'), { id: '0000000002-x', seq: 2 }));
    await assertFails(setDoc(doc(anon, 'teams', 'team9'), { name: '匿名', codeVersion: 1 }));
  });

  it('member が選手用コードのまま自分の members を role:admin に書き換えることはできない', async () => {
    await join('alice', MEMBER, 'member');
    await assertFails(setDoc(doc(dbOf('alice'), 'teams', T, 'members', 'alice'), { role: 'admin', codeVersion: 1, code: MEMBER }));
    await assertFails(updateDoc(doc(dbOf('alice'), 'teams', T, 'members', 'alice'), { role: 'admin' }));
    await assertFails(deleteDoc(doc(dbOf('alice'), 'teams', T, 'matches', 'm1')));
  });

  it('正しい member コードで参加すると読み書きできる', async () => {
    await assertSucceeds(join('alice', MEMBER, 'member'));
    const db = dbOf('alice');
    await assertSucceeds(getDoc(doc(db, 'teams', T, 'players', '4')));
    await assertSucceeds(getDocs(collection(db, 'teams', T, 'players')));
    await assertSucceeds(setDoc(doc(db, 'teams', T, 'matches', 'm1', 'events', '0000000002'), { id: '0000000002', seq: 2 }));
    // 1つ戻す（events の削除）はメンバーもできる
    await assertSucceeds(deleteDoc(doc(db, 'teams', T, 'matches', 'm1', 'events', '0000000002')));
  });

  it('間違ったコード・役割の詐称・他人の uid では members を作れない', async () => {
    await assertFails(join('bob', 'wrong123', 'member'));
    await assertFails(join('bob', MEMBER, 'admin')); // 選手用コードで監督を名乗る
    await assertFails(join('bob', MEMBER, 'member', 2)); // codeVersion の詐称
    await assertFails(setDoc(doc(dbOf('bob'), 'teams', T, 'members', 'carol'), { role: 'member', codeVersion: 1, code: MEMBER }));
    await assertFails(getDoc(doc(dbOf('bob'), 'teams', T, 'players', '4')));
  });

  it('member は match を削除できない、admin はできる', async () => {
    await join('alice', MEMBER, 'member');
    await join('boss', ADMIN, 'admin');
    await assertFails(deleteDoc(doc(dbOf('alice'), 'teams', T, 'matches', 'm1')));
    await assertFails(deleteDoc(doc(dbOf('alice'), 'teams', T, 'players', '4')));
    await assertSucceeds(deleteDoc(doc(dbOf('boss'), 'teams', T, 'matches', 'm1')));
    await assertSucceeds(deleteDoc(doc(dbOf('boss'), 'teams', T, 'players', '4')));
  });

  it('codeVersion を上げると旧メンバーは読めなくなり、旧コードでは参加し直せない', async () => {
    await join('alice', MEMBER, 'member');
    await join('boss', ADMIN, 'admin');
    await assertFails(updateDoc(doc(dbOf('alice'), 'teams', T), { codeVersion: 2 })); // member はコード変更不可
    const db = dbOf('boss');
    const b = writeBatch(db);
    b.update(doc(db, 'teams', T), { codeVersion: 2 });
    b.set(doc(db, 'joinCodes', 'member02'), { teamId: T, role: 'member', codeVersion: 2 });
    b.set(doc(db, 'joinCodes', 'admin002'), { teamId: T, role: 'admin', codeVersion: 2 });
    b.set(doc(db, 'teams', T, 'members', 'boss'), { role: 'admin', codeVersion: 2, code: 'admin002' });
    await assertSucceeds(b.commit());

    await assertFails(getDoc(doc(dbOf('alice'), 'teams', T, 'players', '4')));
    // 旧メンバーは書き込みもできない
    await assertFails(setDoc(doc(dbOf('alice'), 'teams', T, 'players', '7'), { no: 7, name: '旧', position: 'S' }));
    await assertFails(setDoc(doc(dbOf('alice'), 'teams', T, 'matches', 'm1', 'events', '0000000002-x'), { id: '0000000002-x', seq: 2 }));
    await assertFails(deleteDoc(doc(dbOf('alice'), 'teams', T, 'matches', 'm1', 'events', '0000000001')));
    await assertFails(join('alice', MEMBER, 'member', 1));
    await assertSucceeds(getDoc(doc(dbOf('boss'), 'teams', T, 'players', '4')));
    await assertSucceeds(join('alice', 'member02', 'member', 2));
    await assertSucceeds(getDoc(doc(dbOf('alice'), 'teams', T, 'players', '4')));
  });

  it('joinCodes は list できない（get はできる）、上書きもできない', async () => {
    await assertFails(getDocs(collection(dbOf('eve'), 'joinCodes')));
    await assertSucceeds(getDoc(doc(dbOf('eve'), 'joinCodes', MEMBER)));
    await join('boss', ADMIN, 'admin');
    await assertFails(setDoc(doc(dbOf('boss'), 'joinCodes', MEMBER), { teamId: T, role: 'admin', codeVersion: 1 }));
  });

  it('既存チームを指す joinCode を部外者・member は作れない（監督のなりすまし防止）', async () => {
    await assertFails(setDoc(doc(dbOf('eve'), 'joinCodes', 'evil0001'), { teamId: T, role: 'admin', codeVersion: 1 }));
    await join('alice', MEMBER, 'member');
    await assertFails(setDoc(doc(dbOf('alice'), 'joinCodes', 'evil0002'), { teamId: T, role: 'admin', codeVersion: 1 }));
    // 新しいチームを作るバッチに紛れ込ませて、既存チームを指すコードを作ることもできない
    const db = dbOf('eve');
    const b = writeBatch(db);
    b.set(doc(db, 'teams', 'eveteam'), { name: '偽チーム', codeVersion: 1 });
    b.set(doc(db, 'joinCodes', 'evil0003'), { teamId: T, role: 'admin', codeVersion: 1 });
    await assertFails(b.commit());
    await assertFails(join('eve', 'evil0003', 'admin'));
  });

  it('他人の members ドキュメント（監督コード入り）は読めない', async () => {
    await join('alice', MEMBER, 'member');
    await join('boss', ADMIN, 'admin');
    await assertFails(getDoc(doc(dbOf('alice'), 'teams', T, 'members', 'boss')));
    await assertFails(getDocs(collection(dbOf('alice'), 'teams', T, 'members')));
    await assertSucceeds(getDoc(doc(dbOf('alice'), 'teams', T, 'members', 'alice')));
  });

  it('チーム作成（teams・joinCodes・members を1バッチ）は認証済みなら誰でもできる', async () => {
    const db = dbOf('newcoach');
    const b = writeBatch(db);
    b.set(doc(db, 'teams', 'team2'), { name: '新チーム', codeVersion: 1 });
    b.set(doc(db, 'joinCodes', 'tm2member'), { teamId: 'team2', role: 'member', codeVersion: 1 });
    b.set(doc(db, 'joinCodes', 'tm2admin'), { teamId: 'team2', role: 'admin', codeVersion: 1 });
    b.set(doc(db, 'teams', 'team2', 'members', 'newcoach'), { role: 'admin', codeVersion: 1, code: 'tm2admin' });
    await assertSucceeds(b.commit());
    await assertSucceeds(getDoc(doc(db, 'teams', 'team2')));
    // 既存のコードを使ったチーム作成は失敗する
    const b2 = writeBatch(db);
    b2.set(doc(db, 'teams', 'team3'), { name: '別チーム', codeVersion: 1 });
    b2.set(doc(db, 'joinCodes', MEMBER), { teamId: 'team3', role: 'member', codeVersion: 1 });
    await assertFails(b2.commit());
  });
});
