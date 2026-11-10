# バレー記録（volley-scout）

バレーボールの試合をタブレットでリアルタイムに記録し、レシーブ・サーブ・アタックなどを分析する PWA です。タブレット横向き（1024×768）と PC を想定しています。

## 使い方のモード

- **お試しモード**: Firebase の設定なしで動きます。データはその端末のブラウザ内だけに保存されます。
- **クラウド**: Firebase（Firestore）を設定すると、チームコードで複数端末から同じ試合をリアルタイムに共有できます。設定手順は [SETUP.md](SETUP.md) を参照してください。

## 開発コマンド

```
npm install      # 依存パッケージのインストール
npm run dev      # 開発サーバー
npm test         # テスト（Vitest）
npm run build    # 型チェック + 本番ビルド（dist/）
```

アイコンは `public/icons/icon.svg` を元に `node scripts/gen-icons.mjs` で再生成できます。

## ドキュメント

設計書（spec）と実装計画は `docs/superpowers/specs/` と `docs/superpowers/plans/` にあります。
