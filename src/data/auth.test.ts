import { describe, it, expect } from 'vitest';
import { isCloudConfigured, validateCode } from './auth';

describe('auth', () => {
  it('validateCode: 6文字以上、空白や / は不可', () => {
    expect(() => validateCode('abc12')).toThrow('6文字以上');
    expect(() => validateCode('abc 123')).toThrow();
    expect(() => validateCode('abc/123')).toThrow();
    expect(() => validateCode('__abc__')).toThrow();
    expect(() => validateCode('x'.repeat(65))).toThrow();
    expect(() => validateCode('abc123')).not.toThrow();
    expect(() => validateCode('バレー部2026')).not.toThrow();
  });
  it('firebaseConfig が null の間はお試しモード', () => {
    expect(isCloudConfigured()).toBe(false);
  });
});
