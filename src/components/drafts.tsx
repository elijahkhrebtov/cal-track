"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const DraftContext = createContext<Map<string, unknown> | null>(null);

// Drafts live only in this signed-in workspace. History navigation can unmount
// a page without losing its form; signing out or reloading clears the workspace.
export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, unknown>());
  return (
    <DraftContext.Provider value={drafts}>{children}</DraftContext.Provider>
  );
}

export function useDraftStore() {
  const store = useContext(DraftContext);
  if (!store) throw new Error("Draft pages must be inside the workspace.");
  return store;
}

export function usePageDraft<T>(key: string, initial: () => T) {
  const store = useDraftStore();
  const [value, setValue] = useState<T>(() =>
    store.has(key) ? (store.get(key) as T) : initial(),
  );
  useEffect(() => {
    store.set(key, value);
  }, [store, key, value]);
  return [value, setValue] as const;
}

export function discardDrafts(store: Map<string, unknown>, prefix: string) {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(`${prefix}/`)) store.delete(key);
  }
}
