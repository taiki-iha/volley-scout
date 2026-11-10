import type { Match, MatchEvent, OpponentTeam, Player, Reception } from '../core/types';
import { applyEventPatch, buildNextEvent, lastEvent, sortOpponents } from './eventPatch';
import { normalizeSettings, type NewEvent, type Settings, type Store, type Unsub } from './store';

const KEY = 'volley-scout:v1';

interface State {
  players: Player[];
  opponents: OpponentTeam[];
  matches: Match[];
  events: Record<string, MatchEvent[]>;
  receptions: Record<string, Reception[]>;
  settings: Settings | null;
}
const emptyState = (): State => ({ players: [], opponents: [], matches: [], events: {}, receptions: {}, settings: null });

export type MemoryStore = Store & { _reloadFromStorage(): void };

function upsert<T>(list: T[], item: T, same: (a: T) => boolean): T[] {
  const i = list.findIndex(same);
  return i < 0 ? [...list, item] : list.map((x, j) => (j === i ? item : x));
}

export function createMemoryStore(storage?: Storage): MemoryStore {
  let state = emptyState();
  const watchers = new Set<() => void>();

  const load = () => {
    if (!storage) return;
    try {
      const raw = storage.getItem(KEY);
      state = raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
    } catch {
      state = emptyState();
    }
  };
  load();

  const notify = () => watchers.forEach((f) => f());
  const commit = () => {
    let err: unknown;
    let failed = false;
    if (storage) {
      try { storage.setItem(KEY, JSON.stringify(state)); } catch (e) { failed = true; err = e; }
    }
    notify();
    if (failed) throw err;
  };
  const reload = () => { load(); notify(); };

  if (storage && typeof window !== 'undefined') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) reload();
    });
  }

  function watch<T>(get: () => T, cb: (v: T) => void): Unsub {
    const f = () => cb(get());
    watchers.add(f);
    f();
    return () => { watchers.delete(f); };
  }
  const evs = (id: string) => state.events[id] ?? [];

  return {
    mode: 'local',
    role: () => 'admin',
    _reloadFromStorage: reload,

    watchPlayers: (cb) => watch(() => state.players, cb),
    async savePlayer(p) { state = { ...state, players: upsert(state.players, p, (x) => x.no === p.no) }; commit(); },
    async deletePlayer(no) { state = { ...state, players: state.players.filter((x) => x.no !== no) }; commit(); },

    watchOpponents: (cb) => watch(() => sortOpponents(state.opponents), cb),
    async saveOpponent(o) { state = { ...state, opponents: upsert(state.opponents, o, (x) => x.id === o.id) }; commit(); },
    async deleteOpponent(id) { state = { ...state, opponents: state.opponents.filter((x) => x.id !== id) }; commit(); },

    watchMatches: (cb) => watch(() => state.matches, cb),
    async createMatch(m) {
      const id = crypto.randomUUID();
      state = { ...state, matches: [...state.matches, { ...m, id, createdAt: Date.now() }] };
      commit();
      return id;
    },
    async deleteMatch(id) {
      const events = { ...state.events };
      const receptions = { ...state.receptions };
      delete events[id];
      delete receptions[id];
      state = { ...state, matches: state.matches.filter((x) => x.id !== id), events, receptions };
      commit();
    },

    watchEvents: (matchId, cb) => watch(() => evs(matchId), cb),
    async appendEvent(matchId, e: NewEvent) {
      const list = evs(matchId);
      const ev = buildNextEvent(list, e, Date.now());
      state = { ...state, events: { ...state.events, [matchId]: [...list, ev] } };
      commit();
    },
    async undoLast(matchId) {
      const list = evs(matchId);
      const last = lastEvent(list);
      if (!last) return;
      state = { ...state, events: { ...state.events, [matchId]: list.filter((x) => x !== last) } };
      commit();
    },
    async updateEvent(matchId, id, patch) {
      const list = evs(matchId);
      const cur = list.find((x) => x.id === id);
      if (!cur) throw new Error('対象のイベントが見つかりません');
      const next = applyEventPatch(cur, patch);
      state = { ...state, events: { ...state.events, [matchId]: list.map((x) => (x.id === id ? next : x)) } };
      commit();
    },

    watchReceptions: (matchId, cb) => watch(() => state.receptions[matchId] ?? [], cb),
    async saveReception(matchId, r) {
      const list = state.receptions[matchId] ?? [];
      state = { ...state, receptions: { ...state.receptions, [matchId]: upsert(list, r, (x) => x.rallyId === r.rallyId) } };
      commit();
    },

    watchSettings: (cb) => watch(() => normalizeSettings(state.settings), cb),
    async saveSettings(s) { state = { ...state, settings: s }; commit(); },
  };
}
