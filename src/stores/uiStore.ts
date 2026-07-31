import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ActiveView =
  | "dashboard"
  | "trending"
  | "subscriptions"
  | "summary"
  | "later"
  | "knowledge";
export type SummaryStage = "pending" | "draft" | "accepted";

export type TopBarPanel = "workspace" | "notifications" | "user" | null;
export type SettingsSection = "general" | "sources" | "filters" | "ai" | "accounts";
export type AiPanelMode = "search" | "summary";
export type AiRequestStatus = "idle" | "preparing" | "streaming" | "complete" | "error";
export type AppTheme = "light" | "dark";
export type AppLocale = "zh-CN" | "en-US";

export interface WorkspacePreference {
  id: string;
  name: string;
  locality: "daily" | "local";
}

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  kind: "info" | "success" | "error";
  createdAt: number;
  read: boolean;
}

interface UiState {
  activeView: ActiveView;
  summaryStage: SummaryStage;
  activePanel: TopBarPanel;
  workspaces: WorkspacePreference[];
  activeWorkspaceId: string;
  notifications: AppNotification[];
  settingsSection: SettingsSection;
  aiPanelOpen: boolean;
  aiPanelRequestKey: number;
  aiPanelMode: AiPanelMode;
  aiRequestStatus: AiRequestStatus;
  aiRequestInput: string;
  aiRequestError: string | null;
  theme: AppTheme;
  locale: AppLocale;
  feedWidth: number;
  setActiveView: (view: ActiveView) => void;
  setSummaryStage: (stage: SummaryStage) => void;
  togglePanel: (panel: Exclude<TopBarPanel, null>) => void;
  closePanels: () => void;
  selectWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => boolean;
  addNotification: (notification: Pick<AppNotification, "title" | "description" | "kind">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  setSettingsSection: (section: SettingsSection) => void;
  openAiPanel: (mode: AiPanelMode, input?: string) => void;
  closeAiPanel: () => void;
  setAiRequestState: (
    status: AiRequestStatus,
    update?: { input?: string; error?: string | null },
  ) => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
  toggleLocale: () => void;
  setFeedWidth: (width: number) => void;
}

const defaultWorkspaces: WorkspacePreference[] = [
  { id: "daily-tech", name: "每日技术情报中心", locality: "daily" },
  { id: "local", name: "本地工作区", locality: "local" },
];

function notificationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      activeView: "dashboard",
      summaryStage: "pending",
      activePanel: null,
      workspaces: defaultWorkspaces,
      activeWorkspaceId: "daily-tech",
      notifications: [],
      settingsSection: "general",
      aiPanelOpen: false,
      aiPanelRequestKey: 0,
      aiPanelMode: "search",
      aiRequestStatus: "idle",
      aiRequestInput: "",
      aiRequestError: null,
      theme: "light",
      locale: "zh-CN",
      feedWidth: 560,

      setActiveView: (activeView) =>
        set({
          activeView,
          summaryStage: activeView === "summary" ? "pending" : get().summaryStage,
          activePanel: null,
          aiPanelOpen: false,
        }),
      setSummaryStage: (summaryStage) => set({ summaryStage }),
      togglePanel: (panel) =>
        set((state) => ({
          activePanel: state.activePanel === panel ? null : panel,
          aiPanelOpen: false,
        })),
      closePanels: () => set({ activePanel: null }),
      selectWorkspace: (activeWorkspaceId) => {
        if (!get().workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return;
        set({ activeWorkspaceId, activePanel: null });
      },
      renameWorkspace: (id, name) => {
        const normalizedName = name.trim();
        if (!normalizedName || normalizedName.length > 40) return false;
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, name: normalizedName } : workspace,
          ),
        }));
        return true;
      },
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: notificationId(),
              createdAt: Date.now(),
              read: false,
            },
            ...state.notifications,
          ].slice(0, 50),
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id ? { ...notification, read: true } : notification,
          ),
        })),
      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            read: true,
          })),
        })),
      clearNotifications: () => set({ notifications: [] }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      openAiPanel: (aiPanelMode, input = "") =>
        set((state) => ({
          aiPanelOpen: true,
          aiPanelRequestKey: state.aiPanelRequestKey + 1,
          aiPanelMode,
          aiRequestInput: input,
          aiRequestStatus: "idle",
          aiRequestError: null,
          activePanel: null,
        })),
      closeAiPanel: () => set({ aiPanelOpen: false }),
      setAiRequestState: (aiRequestStatus, update) =>
        set((state) => ({
          aiRequestStatus,
          aiRequestInput: update?.input ?? state.aiRequestInput,
          aiRequestError:
            update?.error !== undefined
              ? update.error
              : aiRequestStatus === "error"
                ? state.aiRequestError
                : null,
        })),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === "light" ? "dark" : "light" })),
      toggleLocale: () => set((state) => ({ locale: state.locale === "zh-CN" ? "en-US" : "zh-CN" })),
      setFeedWidth: (feedWidth) =>
        set({ feedWidth: Math.round(Math.min(760, Math.max(420, feedWidth))) }),
    }),
    {
      name: "signal-ui-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeView: state.activeView,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        theme: state.theme,
        locale: state.locale,
        feedWidth: state.feedWidth,
      }),
    },
  ),
);
