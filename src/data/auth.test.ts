import { describe, it, expect } from 'vitest';
import { isCloudConfigured, validateCode, withTimeout } from './auth';

describe('auth', () => {
  it('validateCode: 8文字以上、空白や / は不可', () => {
    expect(() => validateCode('abc1234')).toThrow('8文字以上');
    expect(() => validateCode('abc 1234')).toThrow();
    expect(() => validateCode('abc/1234')).toThrow();
    expect(() => validateCode('__abcd__')).toThrow();
    expect(() => validateCode('x'.repeat(65))).toThrow();
    expect(() => validateCode('abc12345')).not.toThrow();
    expect(() => validateCode('バレー部2026年度')).not.toThrow();
  });
  it('firebaseConfig が null の間はお試しモード', () => {
    expect(isCloudConfigured()).toBe(false);
  });
  it('withTimeout: 時間内なら結果、遅い・失敗なら fallback', async () => {
    expect(await withTimeout(Promise.resolve('server'), 50, 'saved')).toBe('server');
    expect(await withTimeout(new Promise<string>(() => {}), 10, 'saved')).toBe('saved');
    expect(await withTimeout(Promise.reject(new Error('x')), 50, 'saved')).toBe('saved');
  });
});
