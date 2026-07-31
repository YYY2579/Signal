import { create } from "zustand";

import { api } from "../lib/tauri";
import { isTauriRuntime } from "../lib/tauri";
import type { FilterConfig, LoginConfig } from "../lib/types";
import { useArticlesStore } from "./articlesStore";

type FilterMode = "blacklist" | "whitelist";

interface SettingsState {
  filter: FilterConfig;
  login: LoginConfig;
  filterMode: FilterMode;
  settingsOpen: boolean;
  loadSettings: () => Promise<void>;
  setFilter: (f: FilterConfig) => Promise<void>;
  setLogin: (l: LoginConfig) => Promise<void>;
  setFilterMode: (m: FilterMode) => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  filter: { blacklist: [], whitelist: [] },
  login: { juejin: null, zhihu: null },
  filterMode: "blacklist",
  settingsOpen: false,

  loadSettings: async () => {
    if (!isTauriRuntime()) return;
    try {
      const config = await api.getConfig();
      set({ filter: config.filters, login: config.login });
    } catch (e) {
      console.error("loadSettings failed", e);
    }
  },

  setFilter: async (filter) => {
    const previous = get().filter;
    set({ filter });
    if (!isTauriRuntime()) return;
    try {
      await api.updateFilter(filter);
      await useArticlesStore.getState().loadArticles();
    } catch (e) {
      console.error("updateFilter failed", e);
      set({ filter: previous });
    }
  },

  setLogin: async (login) => {
    const previous = get().login;
    set({ login });
    if (!isTauriRuntime()) return;
    try {
      await api.updateLogin(login);
    } catch (e) {
      console.error("updateLogin failed", e);
      set({ login: previous });
      throw e;
    }
  },

  setFilterMode: (filterMode) => set({ filterMode }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
