import { DEFAULT_THRESHOLDS } from '../core/condition';
import type { Match, MatchEvent, OpponentTeam, Player, PlayKind, Reception } from '../core/types';
import type { NewEvent, Settings, Store, Unsub } from './store';

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

const SCORING: PlayKind[] = ['spike_kill', 'serve_ace', 'block_point', 'other_point'];
const isScoring = (p: PlayKind) => SCORING.includes(p);

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
    if (storage) storage.setItem(KEY, JSON.stringify(state));
    notify();
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

    watchOpponents: (cb) => watch(() => state.opponents, cb),
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
      const seq = list.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
      const ev = { ...e, seq, id: String(seq).padStart(10, '0'), at: Date.now() } as MatchEvent;
      state = { ...state, events: { ...state.events, [matchId]: [...list, ev] } };
      commit();
    },
    async undoLast(matchId) {
      const list = evs(matchId);
      if (!list.length) return;
      const max = list.reduce((m, x) => Math.max(m, x.seq), 0);
      state = { ...state, events: { ...state.events, [matchId]: list.filter((x) => x.seq !== max) } };
      commit();
    },
    async updateEvent(matchId, id, patch) {
      const list = evs(matchId);
      const cur = list.find((x) => x.id === id);
      if (!cur || cur.t !== 'rally') throw new Error('対象のイベントが見つかりません');
      if (patch.play !== undefined && isScoring(patch.play) !== isScoring(cur.play)) {
        throw new Error('点数が変わる修正はできません');
      }
      const next: MatchEvent = { ...cur, ...patch, pointTo: cur.pointTo };
      state = { ...state, events: { ...state.events, [matchId]: list.map((x) => (x.id === id ? next : x)) } };
      commit();
    },

    watchReceptions: (matchId, cb) => watch(() => state.receptions[matchId] ?? [], cb),
    async saveReception(matchId, r) {
      const list = state.receptions[matchId] ?? [];
      state = { ...state, receptions: { ...state.receptions, [matchId]: upsert(list, r, (x) => x.rallyId === r.rallyId) } };
      commit();
    },

    watchSettings: (cb) => watch(() => state.settings ?? { thresholds: DEFAULT_THRESHOLDS }, cb),
    async saveSettings(s) { state = { ...state, settings: s }; commit(); },
  };
}
