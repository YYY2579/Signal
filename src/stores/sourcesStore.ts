import { create } from "zustand";

import { api } from "../lib/tauri";
import type { SourceConfig, UnreadCounts } from "../lib/types";

interface SourcesState {
  sources: SourceConfig[];
  unreadCounts: UnreadCounts;
  loadSources: () => Promise<void>;
  loadUnread: () => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  updateInterval: (id: string, minutes: number) => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  unreadCounts: {},

  loadSources: async () => {
    try {
      const sources = await api.getSources();
      set({ sources });
    } catch (e) {
      console.error("loadSources failed", e);
    }
  },

  loadUnread: async () => {
    try {
      const unreadCounts = await api.getUnreadCounts();
      set({ unreadCounts });
    } catch (e) {
      console.error("loadUnread failed", e);
    }
  },

  toggleSource: async (id, enabled) => {
    const src = get().sources.find((s) => s.id === id);
    if (!src) return;
    const updated = { ...src, enabled };
    set((st) => ({
      sources: st.sources.map((s) => (s.id === id ? updated : s)),
    }));
    try {
      await api.updateSourceConfig(updated);
    } catch (e) {
      console.error("toggleSource failed", e);
    }
  },

  updateInterval: async (id, minutes) => {
    const src = get().sources.find((s) => s.id === id);
    if (!src) return;
    const updated = { ...src, interval_minutes: minutes };
    set((st) => ({
      sources: st.sources.map((s) => (s.id === id ? updated : s)),
    }));
    try {
      await api.updateSourceConfig(updated);
    } catch (e) {
      console.error("updateInterval failed", e);
    }
  },
}));
