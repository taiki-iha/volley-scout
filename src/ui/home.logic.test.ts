import { describe, expect, it } from 'vitest';
import { deleteBlockedReason, isPastMatch, localDate } from './home.logic';

describe('home.logic', () => {
  it('localDate は現地時刻の YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 10, 10, 0, 0))).toBe('2026-11-10');
  });
  it('今日より前の試合だけ「終わった試合」', () => {
    expect(isPastMatch({ date: '2026-11-09' }, '2026-11-10')).toBe(true);
    expect(isPastMatch({ date: '2026-11-10' }, '2026-11-10')).toBe(false);
    expect(isPastMatch({ date: '2026-12-01' }, '2026-11-10')).toBe(false);
  });
  it('クラウドでオフラインなら削除できない', () => {
    expect(deleteBlockedReason('cloud', false)).toBe('オンラインのときに削除してください');
    expect(deleteBlockedReason('cloud', true)).toBeNull();
    expect(deleteBlockedReason('local', false)).toBeNull();
  });
});
