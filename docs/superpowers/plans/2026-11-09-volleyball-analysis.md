# バレーボール記録・分析アプリ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 試合中にコート型画面で記録し、別端末へリアルタイム共有し、試合後にレシーブ判定を追加して選手別・ローテ別・相手別に分析できるWebアプリ（PWA）を作る。

**Architecture:** 試合は「イベントの追記ログ」として保存し、点数・ローテ・成績はすべて純粋関数 `replay()` でイベントから計算する。保存先は `Store` インターフェースで抽象化し、Firebase 未設定時は localStorage 版（お試しモード）、設定済みなら Firestore 版を使う。UI は Preact。

**Tech Stack:** Vite 6 + Preact 10 + TypeScript 5 + vite-plugin-pwa + Vitest 3（ダーツアプリ `雑用\ダーツ` と同じ版）、firebase（JS SDK v11）、ルールのテストは firebase-tools + @firebase/rules-unit-testing（CI のみで実行）。

**Spec:** `docs/superpowers/specs/2026-11-09-volleyball-analysis-design.md`

**プロジェクトルート:** `C:\Users\猪原大輝\OneDrive - 株式会社ケイティーエス\ドキュメント\021.Claude\雑用\バレーボール`（以下のパスはすべてここからの相対）

## Global Constraints

- 端末はタブレット横向き（1024×768 以上）がメイン、PC でも使える。タップ対象は最小 48px 角。
- 試合中の入力に確認ダイアログを出さない。間違いは「1つ戻す」で直す。
- 1ラリーの記録は「選手 → プレー → ゾーン」の3タップ以内（ゾーンはサーブ系では省略可）。
- 6人制ルール: 1セット25点、bestOf 形式の最終セットは15点、2点差がつくまで続行。fixed 形式（セット数固定）は勝敗が決まっても全セット行い、全セット25点。
- 交代は1セット6回まで。超えたら警告のみ、操作は止めない。リベロの入れ替えは交代回数に数えない。
- 調子が悪い初期基準: 「試合通算でスパイク5本以上かつ決定率30%未満」または「そのセットのサーブミス2本以上」。設定画面で変更可。
- レシーブ判定 A/B/C/D の定義文（画面に表示する）:
  - A: セッターが動かずにトスでき、どの攻撃も使える返球
  - B: セッターが少し動く。攻撃の選択肢がやや減る
  - C: セッターが大きく動く、または二段トス。速攻は使えない
  - D: 返球できない（サービスエースを取られた、またはダイレクトで相手コートに返った）
- ローテ番号はセッター基準（セッターがポジション p にいるとき S{p}）。
- 選手名などのデータはリポジトリに置かない（Firestore または端末の localStorage のみ）。
- UI の文言はすべて日本語。
- 公開: GitHub Pages、リポジトリ `taiki-iha/volley-scout`、base `/volley-scout/`。push はユーザーの確認を取ってから、`gh auth switch -u taiki-iha` で行い、終わったら `gh auth switch -u IharaTaiki` に戻す。コミット作者はローカル設定で `taiki-iha <taiki-iha@users.noreply.github.com>`。

## Review Focus

1. **セットの途中でアプリを閉じて開き直す / 別端末で途中から開く** — イベントから再計算するので、点数・ローテ・交代状況が完全に復元されること（Task 3 の `replay` 復元テスト）。
2. **「1つ戻す」を連打する（セット終了直後や交代直後を含む）** — 1回ごとに直前のイベントが1つずつ消え、セット終了も取り消されること。`set_start` まで戻したらそのセットの開始自体も取り消せること（Task 3 と Task 9）。
3. **リベロが入っている状態で交代・ローテ・サーブ** — リベロが前衛に回ったら警告、リベロがサーブ位置に来ても server として扱われ表示されること、交代回数に数えないこと（Task 3）。
4. **電波が切れた状態での入力** — 入力は端末に残り、再接続後に同じ順番で送られること。順番は `seq` で決まり、受信順に左右されないこと（Task 7 の並び順テスト、Firestore のオフライン永続化）。
5. **相手選手が未登録 / 背番号だけ分かる状態** — 試合中に相手の背番号を追加でき、名前なしでも全画面で番号表示されること（Task 8・9）。

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
firebase.json, firestore.rules, firestore.indexes.json
.github/workflows/deploy.yml
SETUP.md                         Firebase の作り方（ユーザー向け、日本語）
public/icons/                    PWA アイコン
src/main.tsx
src/core/types.ts                型定義（全タスク共通）
src/core/rotation.ts             ローテ操作の純粋関数
src/core/rules.ts                セット・試合の勝敗
src/core/replay.ts               イベント → 試合状態
src/core/condition.ts            調子判定
src/stats/player.ts              選手別成績
src/stats/rotation.ts            ローテ別成績
src/stats/opponent.ts            相手別成績・レシーブ集計
src/stats/csv.ts                 CSV 出力
src/data/store.ts                Store インターフェース
src/data/memoryStore.ts          localStorage / メモリ版
src/data/firestoreStore.ts       Firestore 版
src/data/auth.ts                 チームコード参加・管理者
src/data/StoreContext.tsx        Store の提供
src/ui/App.tsx                   画面切替（ハッシュルーティング）
src/ui/screens/Join.tsx, Home.tsx, Roster.tsx, Opponents.tsx, MatchSetup.tsx,
               SetStart.tsx, Live.tsx, Reception.tsx, EventEdit.tsx,
               Analysis.tsx, Settings.tsx
src/ui/components/Court.tsx, Scoreboard.tsx, PlayPanel.tsx, ConditionList.tsx,
                  SubDialog.tsx, StatTable.tsx, BarChart.tsx
src/styles/app.css
tests/rules/firestore.rules.test.ts   CI のみ
```

テストは `src/**/*.test.ts(x)` に置く（ダーツアプリと同じ）。

---

### Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/ui/App.tsx`, `src/styles/app.css`, `public/icons/*`, `src/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`（vitest run）, `npm run build`（tsc --noEmit && vite build）, `npm run dev`

- [ ] **Step 1:** `git init`、`git config user.name taiki-iha`、`git config user.email taiki-iha@users.noreply.github.com`。`.gitignore` に `node_modules dist .superpowers .firebase *.log` を入れる。
- [ ] **Step 2:** `package.json` をダーツアプリの `雑用\ダーツ\package.json` をもとに作る（name `volley-scout`、`idb` と `fake-indexeddb` は不要、`firebase` を dependencies に追加）。`vite.config.ts` はダーツアプリと同じ構成で `BASE='/volley-scout/'`、manifest は name `バレー記録`、short_name `バレー記録`、orientation `landscape`、theme/background `#1f2a44`。`npm install`。
- [ ] **Step 3:** `src/smoke.test.ts` に `expect(1+1).toBe(2)` を書き、`npm test` が PASS することを確認。
- [ ] **Step 4:** `App.tsx` は「バレー記録」と表示するだけ。`npm run build` が成功することを確認。
- [ ] **Step 5:** `.claude/launch.json` に `{name:"volley", runtimeExecutable:"npm", runtimeArgs:["run","dev"], port:5173}` を作る。
- [ ] **Step 6:** Commit `chore: プロジェクトの土台`

---

### Task 2: 型とローテ操作・勝敗ルール

**Files:**
- Create: `src/core/types.ts`, `src/core/rotation.ts`, `src/core/rules.ts`
- Test: `src/core/rotation.test.ts`, `src/core/rules.test.ts`

**Interfaces:**
- Produces（`src/core/types.ts`）:

```ts
export type Side = 'us' | 'them';
export type Position = 'S' | 'OH' | 'MB' | 'OP' | 'L';
export interface Player { no: number; name: string; position: Position; }
export interface OpponentPlayer { no: number; name: string; position: Position | null; } // 名前は '' 可、ポジション不明は null
export interface OpponentTeam { id: string; name: string; players: OpponentPlayer[]; }
export type Lineup = [number, number, number, number, number, number]; // index0=ポジション1 … index5=ポジション6（背番号）
export interface MatchConfig { format: 'bestOf' | 'fixed'; sets: number; points: number; finalSetPoints: number; }
export interface Match { id: string; date: string; kind: 'practice' | 'official'; opponentId: string; tournament: string; config: MatchConfig; createdAt: number; }

export type PlayKind =
  | 'spike_kill' | 'spike_error' | 'spike_blocked' | 'serve_ace' | 'serve_error'
  | 'block_point' | 'other_point' | 'other_error';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;

interface Base { id: string; seq: number; set: number; at: number; }
export type MatchEvent =
  | (Base & { t: 'set_start'; lineups: Record<Side, Lineup>; setters: Record<Side, number | null>; liberos: Record<Side, number[]>; firstServe: Side })
  | (Base & { t: 'rally'; side: Side | null; player: number | null; play: PlayKind; zone: Zone | null; blocker: number | null; pointTo: Side })
  | (Base & { t: 'attempt'; side: Side; player: number; zone: Zone | null })      // スパイク（継続）
  | (Base & { t: 'sub'; side: Side; out: number; in: number })
  | (Base & { t: 'libero'; side: Side; out: number; in: number })
  | (Base & { t: 'timeout'; side: Side });

export type Grade = 'A' | 'B' | 'C' | 'D';
export interface Reception { rallyId: string; receiver: number | null; grade: Grade; }
export interface ConditionThresholds { minSpikes: number; maxKillRate: number; maxServeErrorsPerSet: number; } // 既定 5 / 0.3 / 2
```

- Produces（`rotation.ts`）: `rotate(l: Lineup): Lineup`（時計回り: 新[i] = 旧[(i+1)%6]）, `server(l: Lineup): number`（= l[0]）, `isFrontRow(l: Lineup, no: number): boolean`（ポジション2,3,4）, `replacePlayer(l: Lineup, out: number, inNo: number): Lineup`, `setterRotation(l: Lineup, setter: number | null): number | null`（セッターのポジション番号 1〜6、不在なら null）
- Produces（`rules.ts`）: `pointWinner(side: Side | null, play: PlayKind): Side`（`side` のチームのプレーとして、得点系 `spike_kill/serve_ace/block_point/other_point` は side、ミス系はもう一方。side が null のときは呼び出し側で `pointTo` を直接指定するのでこの関数は使わない）, `targetPoints(cfg: MatchConfig, set: number): number`, `isSetOver(cfg, set, us: number, them: number): boolean`, `setsToWin(cfg): number | null`（fixed は null）, `isMatchOver(cfg, setsWon: Record<Side, number>, setsPlayed: number): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// rotation.test.ts
const L: Lineup = [1, 2, 3, 4, 5, 6];
expect(rotate(L)).toEqual([2, 3, 4, 5, 6, 1]);
expect(server(rotate(L))).toBe(2);
expect(isFrontRow(L, 3)).toBe(true); expect(isFrontRow(L, 6)).toBe(false);
expect(replacePlayer(L, 4, 12)).toEqual([1, 2, 3, 12, 5, 6]);
expect(setterRotation(L, 1)).toBe(1); expect(setterRotation(rotate(L), 1)).toBe(6); expect(setterRotation(L, 99)).toBeNull();
// rules.test.ts
const bo3: MatchConfig = { format: 'bestOf', sets: 3, points: 25, finalSetPoints: 15 };
const fx3: MatchConfig = { format: 'fixed', sets: 3, points: 25, finalSetPoints: 15 };
expect(pointWinner('us', 'spike_kill')).toBe('us'); expect(pointWinner('us', 'spike_blocked')).toBe('them');
expect(pointWinner('them', 'serve_error')).toBe('us');
expect(targetPoints(bo3, 3)).toBe(15); expect(targetPoints(fx3, 3)).toBe(25);
expect(isSetOver(bo3, 1, 25, 23)).toBe(true); expect(isSetOver(bo3, 1, 25, 24)).toBe(false); expect(isSetOver(bo3, 1, 27, 25)).toBe(true);
expect(isSetOver(bo3, 3, 15, 13)).toBe(true);
expect(isMatchOver(bo3, { us: 2, them: 0 }, 2)).toBe(true); expect(isMatchOver(fx3, { us: 2, them: 0 }, 2)).toBe(false); expect(isMatchOver(fx3, { us: 2, them: 1 }, 3)).toBe(true);
```

- [ ] **Step 2:** `npm test` → FAIL（未定義）を確認。
- [ ] **Step 3:** 上の Interfaces どおりに実装。
- [ ] **Step 4:** `npm test` → PASS。
- [ ] **Step 5:** Commit `feat: ローテ操作と勝敗ルール`

---

### Task 3: replay（イベント → 試合状態）

試合ロジックの中心。すべての画面と分析がこれを使う。

**Files:**
- Create: `src/core/replay.ts`
- Test: `src/core/replay.test.ts`

**Interfaces:**
- Consumes: Task 2 のすべて
- Produces:

```ts
export interface SetState {
  set: number; score: Record<Side, number>; serving: Side;
  lineups: Record<Side, Lineup>; setters: Record<Side, number | null>; liberos: Record<Side, number[]>;
  subsUsed: Record<Side, number>; timeouts: Record<Side, number>;
  over: boolean; winner: Side | null;
}
export interface RallyContext {           // 各 rally イベント時点（得点前）の状況。分析で使う
  eventId: string; set: number; serving: Side; server: number;
  usRotation: number | null; themRotation: number | null;  // setterRotation の値
  usLineup: Lineup; themLineup: Lineup; scoreBefore: Record<Side, number>;
}
export interface MatchState {
  sets: SetState[]; current: SetState | null; setsWon: Record<Side, number>; matchOver: boolean;
  rallies: RallyContext[]; warnings: string[];  // 現在セットの警告（日本語文）
}
export function replay(cfg: MatchConfig, events: MatchEvent[]): MatchState; // events は seq 昇順を前提にせず、内部で seq ソートする
```

振る舞い（テストで固定する）:
- `rally`: `pointTo` 側に1点。受け側（serving でない側）が取ったら、そのチームを `rotate` してから serving にする（サイドアウト）。
- `set_start` の `firstServe` 側が最初のサーバー。セット開始時はローテしない。
- `sub`: `replacePlayer`、`subsUsed[side]++`。`out` がセッターなら `setters[side] = in`。
- `libero`: `replacePlayer` のみ（回数に数えない）。
- `isSetOver` 成立で `over=true`、`setsWon` 加算。over 後の rally は無視（警告に追加しない）。
- 警告（`warnings`、現在セットについてのみ）: `subsUsed >= 7` → `'自チームの交代が6回を超えています'`（相手は `'相手チームの…'`）。自チームのリベロが前衛（`isFrontRow`）→ `'リベロ #<no> が前衛にいます'`。

- [ ] **Step 1: 失敗するテストを書く** — テスト用ヘルパー `ev(seq, partial)` を作り、次を検証:
  - サイドアウト: 自チームサーブで開始 → `pointTo:'them'` → them がローテして serving='them'、them の lineup が `rotate` 済み、us の lineup は不変。
  - ブレイク: 自チームサーブで `pointTo:'us'` → ローテなし、server 不変。
  - 25-23 でセット終了、`setsWon.us===1`、その後の rally は点数に影響しない。
  - 交代: `sub` でセッター交代 → `setters.us` が新選手。7回目で警告文が入る。リベロ入れ替えは `subsUsed` 不変。
  - リベロ前衛警告: リベロが入った後に3回サイドアウトしてポジション4に来たら警告。
  - **復元**: 同じイベント配列をシャッフルして渡しても、結果が同一（`toEqual`）。
  - **1つ戻す**: イベント配列の最後を1つ削った配列の replay が、セット終了直後でも「終了前」の状態になる。
  - `rallies[i]` に得点前の `serving`, `server`, `usRotation`, `scoreBefore` が入る。
- [ ] **Step 2:** `npm test` → FAIL を確認。
- [ ] **Step 3:** `replay` を実装（seq ソート → 順に適用。状態はイミュータブルにコピー）。
- [ ] **Step 4:** `npm test` → PASS。
- [ ] **Step 5:** Commit `feat: イベントから試合状態を再計算する replay`

---

### Task 4: 選手別成績と調子判定

**Files:**
- Create: `src/stats/player.ts`, `src/core/condition.ts`
- Test: `src/stats/player.test.ts`, `src/core/condition.test.ts`

**Interfaces:**
- Consumes: `MatchEvent`, `Reception`, `ConditionThresholds`, `replay`
- Produces:

```ts
export interface PlayerStats {
  side: Side; no: number;
  spike: { attempts: number; kills: number; errors: number; blocked: number; killRate: number | null; efficiency: number | null; killsByZone: Record<Zone, number> };
  serve: { total: number; aces: number; errors: number; errorRate: number | null };
  blockPoints: number;
  reception: { total: number; A: number; B: number; C: number; D: number; passRate: number | null; perfectRate: number | null };
}
export function playerStats(events: MatchEvent[], receptions: Reception[], filter?: { set?: number }): PlayerStats[];
// 複数試合の通算: 各試合の events を結合して渡せばよい（id が衝突しない前提）
export function badCondition(stats: PlayerStats, serveErrorsThisSet: number, th: ConditionThresholds): boolean;
export const DEFAULT_THRESHOLDS: ConditionThresholds; // {minSpikes:5, maxKillRate:0.3, maxServeErrorsPerSet:2}
```

定義（テストで固定）:
- spike.attempts = `spike_kill + spike_error + spike_blocked + attempt` イベント数。errors = `spike_error + spike_blocked`。killRate = kills/attempts、efficiency = (kills − errors)/attempts、attempts=0 なら null。
- serve.total = 自分がサーバーだった rally 数（`replay().rallies` の server から求める）。aces=`serve_ace`、errors=`serve_error`。
- blockPoints = `block_point`。相手選手の `spike_blocked` で `blocker` が入っていれば、その自チーム選手（blocker は反対側の背番号）にも +1。
- reception: `receptions` を receiver で集計。passRate=(A+B)/total、perfectRate=A/total。
- badCondition: `(attempts >= minSpikes && killRate < maxKillRate) || serveErrorsThisSet >= maxServeErrorsPerSet`。

- [ ] **Step 1:** 上の定義をそれぞれ検証するテストを書く（例: 決定2・ミス1・被ブロック1・継続5 → attempts 9, killRate 2/9, efficiency 0/9。スパイク5本で決定1 → bad=true、4本で決定0 → bad=false、サーブミス2 → bad=true）。
- [ ] **Step 2:** FAIL を確認。 - [ ] **Step 3:** 実装。 - [ ] **Step 4:** PASS を確認。
- [ ] **Step 5:** Commit `feat: 選手別成績と調子判定`

---

### Task 5: ローテ別・相手別成績と CSV

**Files:**
- Create: `src/stats/rotation.ts`, `src/stats/opponent.ts`, `src/stats/csv.ts`
- Test: `src/stats/rotation.test.ts`, `src/stats/opponent.test.ts`, `src/stats/csv.test.ts`

**Interfaces:**
- Consumes: `replay`（`rallies`）、`MatchEvent`, `Reception`
- Produces:

```ts
export interface RotationStats { rotation: number; pointsWon: number; pointsLost: number; receiveRallies: number; sideouts: number; sideoutRate: number | null; serveRallies: number; breaks: number; breakRate: number | null; }
export function rotationStats(cfg: MatchConfig, events: MatchEvent[]): RotationStats[]; // rotation 1..6 の6行。usRotation=null のラリーは除外

export interface OpponentScorer { no: number; points: number; byZone: Record<Zone, number>; byPlay: Partial<Record<PlayKind, number>>; }
export function opponentScorers(events: MatchEvent[]): OpponentScorer[];       // side='them' かつ pointTo='them' の rally
export interface ServerReception { server: number; total: number; A: number; B: number; C: number; D: number; passRate: number | null; }
export function receptionByOpponentServer(cfg: MatchConfig, events: MatchEvent[], receptions: Reception[]): ServerReception[];

export interface ReceptionRow { rallyId: string; set: number; scoreBefore: Record<Side, number>; server: number; usRotation: number | null; preset: Grade | null; }
export function receptionRows(cfg: MatchConfig, events: MatchEvent[]): ReceptionRow[];
// 相手サーブの rally のうち play!=='serve_error' のもの、時系列順。相手の serve_ace は preset 'D'

export function toCsv(rows: Record<string, string | number | null>[]): string; // ヘッダー行あり、BOM 付き（Excel で文字化けしないように）、null は空欄、カンマ・改行・" はダブルクォートで囲む
```

- サイドアウト率 = 相手サーブのラリーで自チームが取った数 / 相手サーブのラリー数。ブレイク率 = 自チームサーブで取った数 / 自チームサーブのラリー数。

- [ ] **Step 1:** テストを書く（相手サーブ4本中3本取得 → sideoutRate 0.75。相手 #7 が zone 4 から2本決定 → byZone[4]===2。相手サーブミスの rally は `receptionRows` に出ない、相手サーブエースは preset 'D'。`toCsv` が `\uFEFF` で始まり `"a,b"` をクォートする）。
- [ ] **Step 2:** FAIL。 - [ ] **Step 3:** 実装。 - [ ] **Step 4:** PASS。
- [ ] **Step 5:** Commit `feat: ローテ別・相手別成績とCSV出力`

---

### Task 6: Store インターフェースとお試しモード（localStorage）

**Files:**
- Create: `src/data/store.ts`, `src/data/memoryStore.ts`, `src/data/StoreContext.tsx`
- Test: `src/data/memoryStore.test.ts`

**Interfaces:**
- Produces:

```ts
export type Unsub = () => void;
export interface Settings { thresholds: ConditionThresholds; }
export type NewEvent = DistributiveOmit<MatchEvent, 'id' | 'seq' | 'at'>;
export interface Store {
  readonly mode: 'local' | 'cloud';
  role(): 'admin' | 'member';
  watchPlayers(cb: (p: Player[]) => void): Unsub; savePlayer(p: Player): Promise<void>; deletePlayer(no: number): Promise<void>;
  watchOpponents(cb: (o: OpponentTeam[]) => void): Unsub; saveOpponent(o: OpponentTeam): Promise<void>; deleteOpponent(id: string): Promise<void>;
  watchMatches(cb: (m: Match[]) => void): Unsub; createMatch(m: Omit<Match, 'id' | 'createdAt'>): Promise<string>; deleteMatch(id: string): Promise<void>;
  watchEvents(matchId: string, cb: (e: MatchEvent[]) => void): Unsub;   // seq 昇順で渡す
  appendEvent(matchId: string, e: NewEvent): Promise<void>;             // seq = 現在の最大 seq + 1、id = seq を10桁ゼロ埋め
  undoLast(matchId: string): Promise<void>;                             // 最大 seq のイベントを削除
  updateEvent(matchId: string, id: string, patch: Partial<Pick<Extract<MatchEvent,{t:'rally'}>, 'player'|'play'|'zone'|'blocker'>>): Promise<void>;
  watchReceptions(matchId: string, cb: (r: Reception[]) => void): Unsub; saveReception(matchId: string, r: Reception): Promise<void>;
  watchSettings(cb: (s: Settings) => void): Unsub; saveSettings(s: Settings): Promise<void>;
}
export function createMemoryStore(storage?: Storage): Store; // storage 未指定ならメモリのみ（テスト用）。指定時はキー 'volley-scout:v1' に JSON 保存
```
- `updateEvent` は `pointTo` を変えない（spec 4.7: 点数が変わる修正は対象外）。`play` を得点系↔ミス系に跨いで変えようとしたら reject（`Error('点数が変わる修正はできません')`）。
- お試しモードでは `role()` は常に `'admin'`。
- `StoreContext.tsx`: `<StoreProvider store>` と `useStore(): Store`、および `useWatch<T>(subscribe: (cb) => Unsub, deps): T | undefined`。

- [ ] **Step 1:** テスト: appendEvent 3回 → watchEvents が seq 1,2,3 順で通知。undoLast → 2件。updateEvent で `spike_kill`→`spike_error` は reject、zone の変更は反映。localStorage（簡易 Storage モック）に保存したものを新しい store で読み直せる。
- [ ] **Step 2:** FAIL。 - [ ] **Step 3:** 実装。 - [ ] **Step 4:** PASS。
- [ ] **Step 5:** Commit `feat: Store とお試しモード`

---

### Task 7: Firestore 版 Store・チームコード・セキュリティルール

**Files:**
- Create: `src/data/firestoreStore.ts`, `src/data/auth.ts`, `src/firebaseConfig.ts`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `tests/rules/firestore.rules.test.ts`, `SETUP.md`
- Modify: `package.json`（`test:rules` スクリプト、devDependencies に `firebase-tools`, `@firebase/rules-unit-testing`）、`vite.config.ts`（vitest の include から `tests/rules` を除外）

**Interfaces:**
- Consumes: `Store`（Task 6）
- Produces:
  - `firebaseConfig.ts`: `export const firebaseConfig: FirebaseOptions | null = null;`（ユーザーが SETUP.md に従って値を入れる。null の間はお試しモード）
  - `auth.ts`: `createTeam(name: string, memberCode: string, adminCode: string): Promise<string /*teamId*/>`, `joinTeam(code: string): Promise<{ teamId: string; role: 'admin' | 'member' }>`, `changeCodes(teamId, newMemberCode, newAdminCode): Promise<void>`（admin のみ）, `currentMembership(): Promise<{ teamId; role } | null>`
  - `createFirestoreStore(db: Firestore, teamId: string, role: 'admin'|'member'): Store`

Firestore の構造（設計者判断。spec 4.7 の「チームを作った端末が管理者」を、端末のデータが消えても困らないよう「監督コード」で実現する）:
```
joinCodes/{code}            { teamId, role: 'admin'|'member', codeVersion }   get のみ可（list 不可）
teams/{teamId}              { name, codeVersion }
teams/{teamId}/members/{uid}{ role, codeVersion }
teams/{teamId}/players/{no}, opponents/{id}, matches/{id}, settings/main
teams/{teamId}/matches/{id}/events/{id}, receptions/{rallyId}
```
ルール:
- 認証は匿名認証。`isMember(t)` = members/{uid} が存在し、その codeVersion == teams/{t}.codeVersion。
- members の create: `joinCodes/{request.resource.data.code}` が存在し、teamId と role と codeVersion が一致するときだけ（members ドキュメントに code フィールドを持たせて照合する）。
- チーム配下の read/create/update は isMember。players / opponents / matches の **delete** と teams の update（コード変更）は role=='admin' のみ。events の delete（1つ戻す）は isMember。
- チーム作成（teams と joinCodes の create）は認証済みなら誰でも可。ただし joinCodes は既存ドキュメントの上書き不可。
- コードは 6 文字以上（クライアントで検証）。

`firestoreStore` の注意:
- `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` でオフライン保存を有効にする。
- `watchEvents` は `orderBy('seq')`。`appendEvent` の seq はローカルで受け取り済みの最大 seq + 1（同時入力の競合は spec どおり後勝ちで許容）。

- [ ] **Step 1:** `tests/rules/firestore.rules.test.ts` を書く: 非メンバーは players を読めない / 正しい member コードで参加後は読める / 間違ったコードでは members を作れない / member は match を削除できない、admin はできる / codeVersion を上げると旧メンバーは読めない / joinCodes は list できない。
- [ ] **Step 2:** `firestore.rules` と `firestoreStore.ts`・`auth.ts` を実装。ローカルの Java が 8 のためエミュレーターは手元で動かない。`npm test`（rules 以外）と `npm run build` が通ることを確認。
- [ ] **Step 3:** `.github/workflows/deploy.yml` をダーツアプリの `雑用\ダーツ\.github\workflows\deploy.yml` をもとに作り、build ジョブの `npm test` の後に `actions/setup-java@v4`（java 21, temurin）と `npm run test:rules`（`firebase emulators:exec --only firestore "vitest run tests/rules"`）を追加。
- [ ] **Step 4:** `SETUP.md` に日本語で手順を書く: Firebase コンソールでプロジェクト作成（個人Googleアカウント）→ Firestore 作成（東京リージョン asia-northeast1）→ 匿名認証を有効化 → Web アプリ追加で表示される設定を `src/firebaseConfig.ts` に貼る → 承認済みドメインに `taiki-iha.github.io` 追加 → `npx firebase deploy --only firestore:rules` でルールを反映。
- [ ] **Step 5:** Commit `feat: Firestore 版とチームコード`

---

### Task 8: 参加・ホーム・選手登録・相手登録・設定画面

**Files:**
- Create: `src/ui/screens/Join.tsx`, `Home.tsx`, `Roster.tsx`, `Opponents.tsx`, `Settings.tsx`
- Modify: `src/ui/App.tsx`, `src/main.tsx`, `src/styles/app.css`

**Interfaces:**
- Consumes: `Store`, `auth.ts`, `firebaseConfig`
- Produces: ハッシュルート `#/join`, `#/`（ホーム）, `#/roster`, `#/opponents`, `#/settings`, `#/match/new`, `#/match/:id/live`, `#/match/:id/view`, `#/match/:id/reception`, `#/match/:id/edit`, `#/analysis`（後続タスクが画面を足す）

- [ ] **Step 1:** `main.tsx`: `firebaseConfig` が null ならお試しモード（`createMemoryStore(localStorage)`）で起動し、画面上部に「お試しモード（この端末だけに保存）」と表示。設定済みなら `currentMembership()` が null のとき `#/join` へ。
- [ ] **Step 2:** Join: 「チームコードを入力」と「新しいチームを作る（チーム名・生徒用コード・監督用コード）」。
- [ ] **Step 3:** Roster: 自チーム選手の一覧・追加・編集（背番号・名前・ポジション）。背番号の重複は保存させない。削除ボタンは admin のみ表示。
- [ ] **Step 4:** Opponents: 相手チームの一覧・追加。選手（`OpponentPlayer`）は背番号必須・名前任意・ポジション任意（null は画面で「?」表示）。
- [ ] **Step 5:** Settings: 調子の基準3項目の編集。admin のみ「コード変更」。
- [ ] **Step 6:** `npm run dev` をブラウザで開き、お試しモードで選手6人以上・相手チームを登録し、リロード後も残ることを確認。`npm test` と `npm run build` が通ること。
- [ ] **Step 7:** Commit `feat: 参加・選手登録・相手登録・設定画面`

---

### Task 9: 試合作成・セット開始・試合中の入力画面（コート型）

**Files:**
- Create: `src/ui/screens/MatchSetup.tsx`, `SetStart.tsx`, `Live.tsx`, `src/ui/components/Court.tsx`, `Scoreboard.tsx`, `PlayPanel.tsx`, `ConditionList.tsx`, `SubDialog.tsx`
- Test: `src/ui/live.logic.test.ts`（UI から切り出したロジック）

**Interfaces:**
- Consumes: `replay`, `playerStats`, `badCondition`, `pointWinner`, `Store`
- Produces: `src/ui/live.logic.ts`:
  - `buildRallyEvent(set: number, sel: { side: Side; player: number } | null, play: PlayKind, zone: Zone | null, blocker: number | null, noPlayerPointTo?: Side): NewEvent`（sel が null のときは `noPlayerPointTo` 必須）
  - `nextSetNeeded(state: MatchState, cfg: MatchConfig): boolean`（現在セット over かつ試合未終了）
  - `needsZone(play: PlayKind | 'attempt'): boolean`（`spike_kill`, `spike_error`, `spike_blocked`, `'attempt'` は true、それ以外は false）
  - `buildAttemptEvent(set: number, side: Side, player: number, zone: Zone | null): NewEvent`

画面仕様（モックアップ A 案。`.superpowers/brainstorm/*/content/live-layout.html` 参照）:
- MatchSetup: 種別・日付・相手・大会名・形式（3セットマッチ / 5セットマッチ / セット数固定 n）。作成後 SetStart へ。
- SetStart: 両チームのポジション1〜6に背番号を割り当て（タップで選手を選ぶ。相手の未登録背番号はその場で追加）、セッター（初期値は position 'S' の選手）、リベロ、最初のサーブ権。前セットの最終配置を初期値にする。
- Live（タブレット横向き）:
  - 上: `Scoreboard`（点数・セットカウント・サーブ権・`S{n}` 表示）。
  - 中央: `Court` を2面（左=相手、右=自チーム、ネットが中央）。各選手は丸ボタン（背番号＋役割）。サーバーに印。`badCondition` の自チーム選手は赤背景。リベロは色違い。
  - 右: `PlayPanel` — 選手選択後に自チームならプレー8種＋「スパイク（継続）」、相手なら同じ。ゾーンが必要なプレーはその後ゾーン 1〜6 ボタンを表示（コート図と同じ並び: 4 3 2 / 5 6 1）。`spike_blocked` の後は「ブロックした相手（任意）」の選択肢と「スキップ」。選手なし得点用に「相手のミスで得点」「自チームのミスで失点」ボタン。
  - その下: `ConditionList`（自チーム各選手のスパイク 決定/打数、そのセットのサーブミス数）、交代ボタン（`SubDialog`: コート選手 → ベンチ選手、リベロ入替タブ、相手チームタブ）、タイムアウト、**1つ戻す**、警告表示（`state.warnings`）。
  - セット終了で「次のセットへ」ボタン → SetStart。試合終了で「試合終了」表示と分析画面へのリンク。
- `#/match/:id/view`（閲覧モード）: 同じ Live コンポーネントを `readonly` で表示し、入力パネルを隠してコートと調子リストを大きくする。右上に「入力モードへ」。

- [ ] **Step 1:** `live.logic.test.ts` を書く（`buildRallyEvent(1,{side:'us',player:4},'spike_blocked',4,7)` → pointTo 'them'、blocker 7。sel=null で noPlayerPointTo='us' → side/player null、pointTo 'us'。`needsZone('serve_ace')===false`）。
- [ ] **Step 2:** FAIL。 - [ ] **Step 3:** `live.logic.ts` と各画面を実装。 - [ ] **Step 4:** `npm test` PASS。
- [ ] **Step 5:** ブラウザ（1024×768）で確認: 試合作成 → セット開始 → 25点まで入力しセット終了 → 1つ戻すでセット終了が取り消される → 交代7回で警告 → リベロが前衛で警告 → リロード後も状態が同じ → 別タブで `#/match/:id/view` を開き、入力が反映される（お試しモードでは `storage` イベントでタブ間反映すること）。スクリーンショットを残す。
- [ ] **Step 6:** Commit `feat: 試合中のコート型入力画面と閲覧モード`

---

### Task 10: 試合後のレシーブ入力と記録の修正画面

**Files:**
- Create: `src/ui/screens/Reception.tsx`, `src/ui/screens/EventEdit.tsx`

**Interfaces:**
- Consumes: `receptionRows`, `Store.saveReception`, `Store.updateEvent`

- [ ] **Step 1:** Reception: `receptionRows` を表で表示（セット・点数・相手サーバー・S番号）。各行で「レシーブした選手」（その時の自チーム後衛＋前衛6人から選ぶ。`RallyContext.usLineup` を使う）と A/B/C/D ボタン。判定を押したら保存して次の行へフォーカス。preset 'D' の行は D が入った状態。画面上部に A〜D の定義文（Global Constraints の文言そのまま）。
- [ ] **Step 2:** EventEdit: rally / attempt イベントの一覧。選手・プレー・ゾーン・ブロッカーを変更できる（得点系↔ミス系をまたぐ変更はボタンを無効化）。
- [ ] **Step 3:** ブラウザで確認: Task 9 で作った試合でレシーブを10本入力し、リロード後も残る。修正したゾーンが分析に反映されることは Task 11 で確認。`npm test`・`npm run build` が通る。
- [ ] **Step 4:** Commit `feat: レシーブ判定入力と記録修正`

---

### Task 11: 分析画面

**Files:**
- Create: `src/ui/screens/Analysis.tsx`, `src/ui/components/StatTable.tsx`, `src/ui/components/BarChart.tsx`

**Interfaces:**
- Consumes: `playerStats`, `rotationStats`, `opponentScorers`, `receptionByOpponentServer`, `toCsv`

- [ ] **Step 1:** 絞り込み: 試合1つ / 期間（開始日〜終了日）＋種別（すべて・練習試合・公式戦）。通算は対象試合の events と receptions を結合して各関数に渡す（ローテ別は試合ごとに計算して合算する。`rotationStats` は cfg が試合ごとに違うため）。
- [ ] **Step 2:** タブ: 選手別（スパイク・サーブ・ブロック・レシーブの表。率は % 小数1桁、null は「-」）／ローテ別（S1〜S6 の表と得失点の横棒グラフ）／相手（相手チームを選び、相手選手別の得点表とゾーン別、相手サーバー別のレシーブ成績）。
- [ ] **Step 3:** 各表に「CSV」ボタン（`toCsv` → Blob ダウンロード、ファイル名 `volley_<種類>_<日付>.csv`）。
- [ ] **Step 4:** ブラウザで確認: Task 9・10 の試合で、決定率・返球率・サイドアウト率が手計算と一致すること。CSV を Excel で開いて文字化けしないこと。
- [ ] **Step 5:** Commit `feat: 分析画面`

---

### Task 12: 仕上げと公開

**Files:**
- Modify: `README.md`（作成）、`src/styles/app.css`

- [ ] **Step 1:** タブレット横向き（1024×768）と PC（1440×900）でホーム → 試合入力 → 分析を一通り操作し、タップ対象が 48px 以上か、横スクロールが出ないかを確認して直す。
- [ ] **Step 2:** `npm test`・`npm run build` が通ることを確認。
- [ ] **Step 3:** **ユーザーに確認を取ってから**、`gh auth switch -u taiki-iha` → `gh repo create taiki-iha/volley-scout --public --source . --push` → リポジトリ設定で Pages のソースを GitHub Actions に → Actions の成功を確認 → `https://taiki-iha.github.io/volley-scout/` が開けることを確認 → `gh auth switch -u IharaTaiki`。
- [ ] **Step 4:** ユーザーが SETUP.md に従って Firebase を設定したら、`src/firebaseConfig.ts` に値を入れて push し、2台の端末（またはブラウザ2つ）で同じチームコードで参加してリアルタイム反映を確認。
