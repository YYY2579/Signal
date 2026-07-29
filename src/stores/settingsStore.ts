import { create } from "zustand";

import { api } from "../lib/tauri";
import type { FilterConfig, LoginConfig } from "../lib/types";

type FilterMode = "blacklist" | "whitelist";

interface SettingsState {
  filter: FilterConfig;
  login: LoginConfig;
  filterMode: FilterMode;
  settingsOpen: boolean;
  prefetchContent: boolean;
  setFilter: (f: FilterConfig) => Promise<void>;
  setLogin: (l: LoginConfig) => Promise<void>;
  setFilterMode: (m: FilterMode) => void;
  setPrefetchContent: (v: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  filter: { blacklist: [], whitelist: [] },
  login: { juejin: null, zhihu: null },
  filterMode: "blacklist",
  settingsOpen: false,
  prefetchContent: false,

  setFilter: async (filter) => {
    set({ filter });
    try {
      await api.updateFilter(filter);
    } catch (e) {
      console.error("updateFilter failed", e);
    }
  },

  setLogin: async (login) => {
    set({ login });
    try {
      await api.updateLogin(login);
    } catch (e) {
      console.error("updateLogin failed", e);
    }
  },

  setFilterMode: (filterMode) => set({ filterMode }),
  setPrefetchContent: (prefetchContent) => set({ prefetchContent }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
