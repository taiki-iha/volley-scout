import { describe, it, expect } from 'vitest';
import { createMemoryStore } from './memoryStore';
import { DEFAULT_SETTINGS, normalizeSettings } from './store';
import { DEFAULT_THRESHOLDS } from '../core/condition';
import type { MatchEvent } from '../core/types';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}
const cfg = { format: 'bestOf' as const, sets: 3, points: 25, finalSetPoints: 15 };
const matchInput = { date: '2026-11-09', kind: 'practice' as const, opponentId: 'o1', tournament: '', config: cfg };
const rally = (play: 'spike_kill' | 'spike_error', zone: 1 | 2 | 3 | 4 | 5 | 6 | null = 4) =>
  ({ t: 'rally', set: 1, side: 'us', player: 7, play, zone, land: null, blocker: null, pointTo: play === 'spike_kill' ? 'us' : 'them' }) as const;

describe('memoryStore', () => {
  it('appendEvent は seq 昇順・10桁ゼロ埋め id で通知し、undoLast で最大 seq を削除', async () => {
    const s = createMemoryStore();
    const id = await s.createMatch(matchInput);
    let got: MatchEvent[] = [];
    s.watchEvents(id, (e) => { got = e; });
    expect(got).toEqual([]);
    await s.appendEvent(id, rally('spike_kill'));
    await s.appendEvent(id, rally('spike_kill'));
    await s.appendEvent(id, rally('spike_error'));
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(got[2].id).toBe('0000000003');
    await s.undoLast(id);
    expect(got.map((e) => e.seq)).toEqual([1, 2]);
    await s.appendEvent(id, rally('spike_kill'));
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('updateEvent: 得点↔ミス跨ぎは reject、zone は反映、pointTo 不変', async () => {
    const s = createMemoryStore();
    const id = await s.createMatch(matchInput);
    let got: MatchEvent[] = [];
    s.watchEvents(id, (e) => { got = e; });
    await s.appendEvent(id, rally('spike_kill'));
    await expect(s.updateEvent(id, '0000000001', { play: 'spike_error' })).rejects.toThrow('点数が変わる修正はできません');
    await s.updateEvent(id, '0000000001', { zone: 2 });
    const e = got[0];
    expect(e.t === 'rally' && e.zone).toBe(2);
    expect(e.t === 'rally' && e.pointTo).toBe('us');
  });

  it('storage に保存し、新しい store で読み直せる', async () => {
    const st = fakeStorage();
    const a = createMemoryStore(st);
    await a.savePlayer({ no: 7, name: '山田', position: 'OH' });
    const id = await a.createMatch(matchInput);
    await a.appendEvent(id, rally('spike_kill'));
    await a.saveReception(id, { rallyId: '0000000001', receiver: 7, grade: 'A' });
    await a.saveSettings({ ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_THRESHOLDS, minSpikes: 9 }, timeoutSec: 45, timeoutSound: false });
    const b = createMemoryStore(st);
    let players: unknown[] = [], events: MatchEvent[] = [], recs: unknown[] = [], matches: unknown[] = [];
    let settings: any;
    b.watchPlayers((p) => { players = p; });
    b.watchMatches((m) => { matches = m; });
    b.watchEvents(id, (e) => { events = e; });
    b.watchReceptions(id, (r) => { recs = r; });
    b.watchSettings((x) => { settings = x; });
    expect(players).toHaveLength(1);
    expect(matches).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(recs).toHaveLength(1);
    expect(settings.thresholds.minSpikes).toBe(9);
    expect(settings.timeoutSec).toBe(45);
    expect(settings.timeoutSound).toBe(false);
    expect(b.role()).toBe('admin');
    expect(b.mode).toBe('local');
  });

  it('設定の既定値は DEFAULT_THRESHOLDS・タイムアウト30秒・音あり', () => {
    const s = createMemoryStore();
    let settings: any;
    s.watchSettings((x) => { settings = x; });
    expect(settings).toEqual({ thresholds: DEFAULT_THRESHOLDS, timeoutSec: 30, timeoutSound: true });
  });

  it('タイムアウト設定のない古い保存データも、既定値を補って読める', () => {
    const st = fakeStorage();
    st.setItem('volley-scout:v1', JSON.stringify({ settings: { thresholds: { minSpikes: 8, maxKillRate: 0.25, maxServeErrorsPerSet: 3 } } }));
    const s = createMemoryStore(st);
    let settings: any;
    s.watchSettings((x) => { settings = x; });
    expect(settings).toEqual({ thresholds: { minSpikes: 8, maxKillRate: 0.25, maxServeErrorsPerSet: 3 }, timeoutSec: 30, timeoutSound: true });
  });

  it('別 store の書き込みを _reloadFromStorage で取り込み、watcher に再通知', async () => {
    const st = fakeStorage();
    const a = createMemoryStore(st);
    const b = createMemoryStore(st);
    let players: unknown[] = [];
    let calls = 0;
    b.watchPlayers((p) => { players = p; calls++; });
    expect(calls).toBe(1);
    await a.savePlayer({ no: 1, name: 'A', position: 'S' });
    expect(players).toHaveLength(0);
    b._reloadFromStorage();
    expect(players).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('delete 系と unsubscribe', async () => {
    const s = createMemoryStore();
    let n = 0;
    const un = s.watchPlayers(() => { n++; });
    await s.savePlayer({ no: 1, name: 'A', position: 'S' });
    un();
    await s.deletePlayer(1);
    expect(n).toBe(2);
  });

  it('attempt の zone/player を修正でき、play キーは reject', async () => {
    const s = createMemoryStore();
    const id = await s.createMatch(matchInput);
    let got: MatchEvent[] = [];
    s.watchEvents(id, (e) => { got = e; });
    await s.appendEvent(id, { t: 'attempt', set: 1, side: 'us', player: 7, zone: 4 });
    await s.updateEvent(id, '0000000001', { zone: 2, player: 9 });
    const e = got[0];
    expect(e.t === 'attempt' && e.zone).toBe(2);
    expect(e.t === 'attempt' && e.player).toBe(9);
    await s.updateEvent(id, '0000000001', { zone: undefined });
    expect(got[0].t === 'attempt' && (got[0] as { zone: number }).zone).toBe(2);
    await expect(s.updateEvent(id, '0000000001', { play: 'spike_kill' } as never)).rejects.toThrow();
  });

  it('setItem が throw しても watcher には通知され、promise は reject', async () => {
    const st = fakeStorage();
    const s = createMemoryStore(st);
    const id = await s.createMatch(matchInput);
    let got: MatchEvent[] = [];
    s.watchEvents(id, (e) => { got = e; });
    st.setItem = () => { throw new Error('quota'); };
    await expect(s.appendEvent(id, rally('spike_kill'))).rejects.toThrow('quota');
    expect(got).toHaveLength(1);
  });
  it('相手チーム一覧は名前順で通知する', async () => {
    const s = createMemoryStore();
    await s.saveOpponent({ id: 'b', name: '西高', players: [] });
    await s.saveOpponent({ id: 'a', name: 'A中', players: [] });
    await s.saveOpponent({ id: 'c', name: 'あおば', players: [] });
    let names: string[] = [];
    s.watchOpponents((o) => { names = o.map((x) => x.name); });
    expect(names).toEqual(['A中', 'あおば', '西高']);
  });
});

describe('normalizeSettings', () => {
  it('null・壊れた値は既定値', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ thresholds: { minSpikes: 'a' } })).toEqual(DEFAULT_SETTINGS);
  });
  it('範囲外・整数でないタイムアウト秒は既定の30秒', () => {
    expect(normalizeSettings({ timeoutSec: 5 }).timeoutSec).toBe(30);
    expect(normalizeSettings({ timeoutSec: 121 }).timeoutSec).toBe(30);
    expect(normalizeSettings({ timeoutSec: 30.5 }).timeoutSec).toBe(30);
    expect(normalizeSettings({ timeoutSec: 10 }).timeoutSec).toBe(10);
    expect(normalizeSettings({ timeoutSec: 120 }).timeoutSec).toBe(120);
  });
  it('音の設定は boolean のときだけ使う', () => {
    expect(normalizeSettings({ timeoutSound: false }).timeoutSound).toBe(false);
    expect(normalizeSettings({ timeoutSound: 'no' }).timeoutSound).toBe(true);
  });
});
