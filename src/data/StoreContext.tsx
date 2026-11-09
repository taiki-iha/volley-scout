import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { Store, Unsub } from './store';

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children?: ComponentChildren }) {
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}

export function useWatch<T>(subscribe: (cb: (v: T) => void) => Unsub, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    setValue(undefined);
    return subscribe((v) => setValue(() => v));
  }, deps);
  return value;
}
