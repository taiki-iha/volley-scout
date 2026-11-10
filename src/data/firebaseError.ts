// Firebase（Firestore / Auth）のエラーを短い日本語にする（純粋関数）

/** Firebase のエラーコード（FirebaseError.code。'firestore/' などの接頭辞は外す）。なければ undefined */
export function errorCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && c ? c.replace(/^[a-z]+\//, '') : undefined;
}

export const isPermissionDenied = (e: unknown): boolean => errorCode(e) === 'permission-denied';

const JA: Record<string, string> = {
  'permission-denied': '権限がありません',
  unavailable: 'サーバーにつながりません。電波の良い所でもう一度試してください',
  'deadline-exceeded': '時間内に応答がありませんでした',
  'resource-exhausted': '利用量の上限に達しました。しばらくしてから試してください',
  unauthenticated: 'ログイン状態が切れています。アプリを開き直してください',
  'not-found': 'データが見つかりません',
  'already-exists': '同じデータがすでにあります',
  'failed-precondition': 'この操作は今の状態ではできません',
  aborted: '他の操作とぶつかりました。もう一度試してください',
  cancelled: '操作が取り消されました',
  internal: 'サーバーでエラーが起きました',
  unknown: '不明なエラーが起きました',
  'invalid-argument': 'データの形が正しくありません',
  'network-request-failed': 'ネットに接続できません',
  'too-many-requests': '操作が多すぎます。しばらくしてから試してください',
};

/**
 * 画面に出すエラー文。Firebase のエラーコードが分かれば「日本語（コード）」、
 * それ以外の Error はメッセージ（アプリ内の日本語エラーはそのまま）、その他は文字列化。
 */
export function errorText(e: unknown): string {
  const code = errorCode(e);
  if (code && JA[code]) return `${JA[code]}（${code}）`;
  if (e instanceof Error) return e.message;
  return String(e);
}
