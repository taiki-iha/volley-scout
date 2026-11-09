import { describe, it, expect } from 'vitest';
import { isCloudConfigured, validateCode } from './auth';

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
});
