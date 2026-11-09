# クラウド同期（Firebase）の設定手順

`src/firebaseConfig.ts` が `null` のままだと、データはこの端末の中だけに保存される「お試しモード」で動きます。
チームの複数の端末で記録を共有するには、以下の手順で Firebase を設定してください（無料枠で使えます）。

## 0. 準備（最初に1回）

このフォルダ（`バレーボール`）でターミナルを開き、次を実行して必要な道具を入れておく。
以降の `npx firebase ...` はこれを済ませてから実行します。

```sh
npm install
```

## 1. Firebase プロジェクトを作る

1. 個人の Google アカウントで <https://console.firebase.google.com/> を開く。
2. 「プロジェクトを作成」→ 名前（例: `volley-scout`）を入れて作成する。Google アナリティクスは不要なのでオフでよい。

## 2. Firestore（データベース）を作る

1. 左メニュー「構築」→「Firestore Database」→「データベースを作成」。
   - エディション（「Standard」「Enterprise」など）を選ぶ画面が出たら **Standard** を選ぶ。
   - データベース ID は既定の `(default)` のままにする。
2. ロケーションは **東京（asia-northeast1）** を選ぶ（後から変更できません）。
3. 「本番環境モード」で開始する（ルールは手順 6 で反映します）。

## 3. 匿名認証を有効にする

1. 左メニュー「構築」→「Authentication」→「始める」。
2. 「Sign-in method」タブで「匿名」を選び、有効にして保存する。

## 4. Web アプリを追加して設定を貼る

1. プロジェクトの概要（歯車）→「プロジェクトの設定」→「マイアプリ」で Web（`</>`）を選ぶ。
2. アプリのニックネームを入れて登録する（Firebase Hosting は不要）。
3. 表示される `firebaseConfig` の中身を `src/firebaseConfig.ts` に貼る。

```ts
import type { FirebaseOptions } from 'firebase/app';

export const firebaseConfig: FirebaseOptions | null = {
  apiKey: '...',
  authDomain: '....firebaseapp.com',
  projectId: '...',
  storageBucket: '....firebasestorage.app',
  messagingSenderId: '...',
  appId: '...',
};
```

※ この値は公開されても問題ない設定値です（データはセキュリティルールで守られます）。

4. 貼り付けたら、変更をコミットして GitHub の `main` に push する。push すると自動でビルドされ、
   `https://taiki-iha.github.io/volley-scout/` に反映されます（数分かかります）。
   自分で操作するのが難しければ「firebaseConfig.ts を貼ったので反映して」と **Claude に頼めば反映します**。

## 5. 承認済みドメインを追加する

1. 「Authentication」→「設定」タブ →「承認済みドメイン」。
2. 「ドメインの追加」で `taiki-iha.github.io` を追加する。

## 6. セキュリティルールを反映する

このフォルダでターミナルを開き、次を実行する（初回は Google アカウントでのログインを求められます）。

```sh
npx firebase login
npx firebase deploy --only firestore:rules --project <プロジェクトID>
```

`<プロジェクトID>` は手順 4 の `projectId` の値です。
ルール（`firestore.rules`）を変更したときも、同じコマンドで反映します。

## 使い方（チームコード）

- 最初に 1 台で「チームを作る」と、**選手用コード** と **監督用コード** を決めます（どちらも 8 文字以上、別々のコード）。
  - コードを知っている人は誰でも参加できるので、推測されにくいものにしてください。
    **8 文字以上で、単語や名前・誕生日ではない、英字と数字を混ぜたもの**（例: `k7m2q9xa` のような並び）がおすすめです。
  - 特に監督用コードは選手に教えないでください。
- 他の端末は、選手用コードで参加すると記録の入力・閲覧ができます。
- 監督用コードで参加した端末は、試合・選手・相手チームの削除と、コードの変更ができます。
  端末を替えたりデータが消えたりしても、監督用コードで参加し直せば監督に戻れます。
- コードを変更すると、古いコードで参加していた端末はデータを読めなくなります（卒業生の端末などを外すとき）。
  続けて使う端末は新しいコードで参加し直してください。一度使ったコードは再利用できません。
- コードを知っていれば誰でも参加できるので、コードは部員と保護者以外に教えないでください。
