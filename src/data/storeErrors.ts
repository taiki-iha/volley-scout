// クラウド版ストアの読み書きエラーの扱い（main.tsx から使う。依存を引数で受け取ってテストする）
import { isPermissionDenied } from './firebaseError';
import type { Membership } from './auth';

export const REVOKED_MESSAGE = 'チームコードが変更されました。新しいコードで参加してください';

export interface StoreErrorDeps {
  /** サーバーで参加状況を確かめる（無効なら null を返し、保存も消す） */
  verify: () => Promise<Membership | null>;
  /** 締め出されたとき: 保存済みの参加状況を消し、メッセージを出して参加画面へ（再読み込み） */
  onRevoked: () => void;
  /** それ以外のエラーを画面に出す */
  onOther: (e: unknown) => void;
}

/**
 * 監督がコードを変更すると、他の端末の監視は permission-denied で失敗する。
 * permission-denied のときはサーバーで参加状況を確かめ、無効になっていれば参加画面へ戻す
 * （ルールのデータ検査など、参加は有効なまま拒否された書き込みは通常のエラーとして出す）。
 * 監視は複数同時に失敗するので、確認と画面移動は1回だけ行う。
 */
export function createStoreErrorHandler(deps: StoreErrorDeps): (e: unknown) => void {
  let checking: Promise<void> | null = null;
  let revoked = false;
  return (e) => {
    if (revoked) return;
    if (!isPermissionDenied(e)) { deps.onOther(e); return; }
    if (checking) return;
    checking = deps.verify().then(
      (m) => {
        if (m === null) { revoked = true; deps.onRevoked(); } else deps.onOther(e);
      },
      () => deps.onOther(e),
    ).finally(() => { checking = null; });
  };
}
