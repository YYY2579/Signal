import { create } from "zustand";

import { api } from "../lib/tauri";
import { isTauriRuntime } from "../lib/tauri";
import type { SourceConfig, UnreadCounts } from "../lib/types";

interface SourcesState {
  sources: SourceConfig[];
  sourcesLoading: boolean;
  sourcesError: string | null;
  unreadCounts: UnreadCounts;
  loadSources: () => Promise<void>;
  loadUnread: () => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  toggleSubscription: (id: string, subscribed: boolean) => Promise<void>;
  updateInterval: (id: string, minutes: number) => Promise<void>;
  addSource: (name: string, url: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
}

export const useSourcesStore = create<SourcesState>((set, get) => ({
  sources: [],
  sourcesLoading: false,
  sourcesError: null,
  unreadCounts: {},

  loadSources: async () => {
    set({ sourcesLoading: true, sourcesError: null });
    if (!isTauriRuntime()) {
      set({ sources: [], sourcesLoading: false });
      return;
    }
    try {
      const sources = await api.getSources();
      set({ sources, sourcesLoading: false, sourcesError: null });
    } catch (e) {
      console.error("loadSources failed", e);
      set({
        sourcesLoading: false,
        sourcesError: e instanceof Error ? e.message : String(e),
      });
    }
  },

  loadUnread: async () => {
    if (!isTauriRuntime()) {
      set({ unreadCounts: {} });
      return;
    }
    try {
      const unreadCounts = await api.getUnreadCounts();
      set({ unreadCounts });
    } catch (e) {
      console.error("loadUnread failed", e);
    }
  },

  toggleSource: async (id, enabled) => {
    const src = get().sources.find((s) => s.id === id);
    if (!src) throw new Error("数据源不存在");
    const updated = { ...src, enabled };
    set((st) => ({
      sources: st.sources.map((s) => (s.id === id ? updated : s)),
    }));
    if (!isTauriRuntime()) return;
    try {
      await api.updateSourceConfig(updated);
    } catch (e) {
      console.error("toggleSource failed", e);
      set((st) => ({
        sources: st.sources.map((s) => (s.id === id ? src : s)),
      }));
      throw e;
    }
  },

  toggleSubscription: async (id, subscribed) => {
    const src = get().sources.find((source) => source.id === id);
    if (!src) throw new Error("数据源不存在");
    const updated = { ...src, subscribed };
    set((state) => ({
      sources: state.sources.map((source) => (source.id === id ? updated : source)),
    }));
    if (!isTauriRuntime()) return;
    try {
      await api.updateSourceConfig(updated);
    } catch (error) {
      console.error("toggleSubscription failed", error);
      set((state) => ({
        sources: state.sources.map((source) => (source.id === id ? src : source)),
      }));
      throw error;
    }
  },

  updateInterval: async (id, minutes) => {
    const src = get().sources.find((s) => s.id === id);
    if (!src) throw new Error("数据源不存在");
    const updated = { ...src, interval_minutes: minutes };
    set((st) => ({
      sources: st.sources.map((s) => (s.id === id ? updated : s)),
    }));
    if (!isTauriRuntime()) return;
    try {
      await api.updateSourceConfig(updated);
    } catch (e) {
      console.error("updateInterval failed", e);
      set((st) => ({
        sources: st.sources.map((s) => (s.id === id ? src : s)),
      }));
      throw e;
    }
  },
  addSource: async (name, url) => {
    if (!isTauriRuntime()) throw new Error("自定义来源仅在桌面应用中可用");
    const source = await api.addCustomSource(name, url);
    set((state) => ({ sources: [...state.sources, source] }));
  },
  removeSource: async (id) => {
    if (!isTauriRuntime()) return;
    await api.removeCustomSource(id);
    set((state) => ({ sources: state.sources.filter((source) => source.id !== id) }));
  },
}));
