import { describe, expect, it } from 'vitest';
import { errorCode, errorText, isPermissionDenied } from './firebaseError';

const fbErr = (code: string, message = 'Missing or insufficient permissions.') => Object.assign(new Error(message), { code });

describe('firebaseError', () => {
  it('コードを取り出す（接頭辞は外す）', () => {
    expect(errorCode(fbErr('permission-denied'))).toBe('permission-denied');
    expect(errorCode(fbErr('auth/network-request-failed'))).toBe('network-request-failed');
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
    expect(errorCode('text')).toBeUndefined();
  });
  it('permission-denied の判定', () => {
    expect(isPermissionDenied(fbErr('permission-denied'))).toBe(true);
    expect(isPermissionDenied(fbErr('unavailable'))).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
  });
  it('既知のコードは日本語（コード）、それ以外は元のメッセージ', () => {
    expect(errorText(fbErr('permission-denied'))).toBe('権限がありません（permission-denied）');
    expect(errorText(fbErr('unavailable', 'Failed to get document because the client is offline.'))).toBe('サーバーにつながりません。電波の良い所でもう一度試してください（unavailable）');
    expect(errorText(fbErr('some-new-code', 'English text'))).toBe('English text');
    expect(errorText(new Error('コードが違います'))).toBe('コードが違います');
    expect(errorText('quota')).toBe('quota');
  });
});
