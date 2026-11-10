import { describe, expect, it, vi } from 'vitest';
import { createStoreErrorHandler } from './storeErrors';

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createStoreErrorHandler', () => {
  it('permission-denied で参加が無効なら1回だけ onRevoked（同時の失敗は無視）', async () => {
    const verify = vi.fn(async () => null);
    const onRevoked = vi.fn();
    const onOther = vi.fn();
    const h = createStoreErrorHandler({ verify, onRevoked, onOther });
    h(denied()); h(denied()); h(denied());
    await flush();
    h(denied());
    h(new Error('later'));
    await flush();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(onOther).not.toHaveBeenCalled();
  });
  it('参加が有効なままの permission-denied は通常のエラー', async () => {
    const onRevoked = vi.fn();
    const onOther = vi.fn();
    const h = createStoreErrorHandler({ verify: async () => ({ teamId: 't', role: 'member' }), onRevoked, onOther });
    const e = denied();
    h(e);
    await flush();
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onOther).toHaveBeenCalledWith(e);
  });
  it('permission-denied 以外はそのまま通常のエラー（確認しない）', () => {
    const verify = vi.fn(async () => null);
    const onOther = vi.fn();
    const h = createStoreErrorHandler({ verify, onRevoked: vi.fn(), onOther });
    const e = Object.assign(new Error('offline'), { code: 'unavailable' });
    h(e);
    expect(onOther).toHaveBeenCalledWith(e);
    expect(verify).not.toHaveBeenCalled();
  });
  it('確認自体が失敗したら通常のエラー', async () => {
    const onOther = vi.fn();
    const onRevoked = vi.fn();
    const h = createStoreErrorHandler({ verify: async () => { throw new Error('x'); }, onRevoked, onOther });
    h(denied());
    await flush();
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onOther).toHaveBeenCalledTimes(1);
  });
});
