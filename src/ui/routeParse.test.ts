import { describe, expect, it } from 'vitest';
import { parseRoute } from './routeParse';

describe('parseRoute', () => {
  it('固定ルート', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/join')).toEqual({ name: 'join' });
    expect(parseRoute('#/roster')).toEqual({ name: 'roster' });
    expect(parseRoute('#/opponents')).toEqual({ name: 'opponents' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/match/new')).toEqual({ name: 'matchNew' });
    expect(parseRoute('#/analysis')).toEqual({ name: 'analysis' });
  });
  it('試合ルート', () => {
    expect(parseRoute('#/match/m1/live')).toEqual({ name: 'matchLive', id: 'm1' });
    expect(parseRoute('#/match/m1/view')).toEqual({ name: 'matchView', id: 'm1' });
    expect(parseRoute('#/match/m1/reception')).toEqual({ name: 'matchReception', id: 'm1' });
    expect(parseRoute('#/match/m1/edit')).toEqual({ name: 'matchEdit', id: 'm1' });
  });
  it('末尾スラッシュ・クエリ・不明', () => {
    expect(parseRoute('#/roster/')).toEqual({ name: 'roster' });
    expect(parseRoute('#/roster?x=1')).toEqual({ name: 'roster' });
    expect(parseRoute('#/nope')).toEqual({ name: 'notFound' });
    expect(parseRoute('#/match/m1/zzz')).toEqual({ name: 'notFound' });
  });
});
