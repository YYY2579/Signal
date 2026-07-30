import { useState } from "react";
import {
  Bell,
  Bot,
  ChevronDown,
  CircleUserRound,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

import {
  AiAssistantPanel,
  NotificationsPanel,
  UserPanel,
  WorkspacePanel,
} from "./TopBarPanels";
import { Button } from "../ui/button";
import { isTauriRuntime } from "../../lib/tauri";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";

export function TopBar() {
  const searchQuery = useArticlesStore((s) => s.searchQuery);
  const setSearchQuery = useArticlesStore((s) => s.setSearchQuery);
  const refresh = useArticlesStore((s) => s.refresh);
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const activePanel = useUiStore((state) => state.activePanel);
  const activeWorkspaceId = useUiStore((state) => state.activeWorkspaceId);
  const workspaces = useUiStore((state) => state.workspaces);
  const notifications = useUiStore((state) => state.notifications);
  const aiPanelOpen = useUiStore((state) => state.aiPanelOpen);
  const aiPanelMode = useUiStore((state) => state.aiPanelMode);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const openAiPanel = useUiStore((state) => state.openAiPanel);
  const addNotification = useUiStore((state) => state.addNotification);
  const [refreshing, setRefreshing] = useState(false);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;

  const handleRefresh = async () => {
    if (!isTauriRuntime()) {
      toast("数据源同步需要在 Signal 桌面应用中运行");
      return;
    }
    setRefreshing(true);
    try {
      await refresh();
      const loaded = await loadArticles();
      if (!loaded) {
        throw new Error(
          useArticlesStore.getState().loadError ?? "同步完成，但信息流重新加载失败",
        );
      }
      toast.success("情报源已同步");
      addNotification({
        title: "情报源同步完成",
        description: "信息流已更新为最新数据",
        kind: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`刷新失败：${message}`);
      addNotification({ title: "情报源同步失败", description: message, kind: "error" });
    } finally {
      window.setTimeout(() => setRefreshing(false), 450);
    }
  };

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center border-b border-line bg-white px-3 min-[1200px]:px-4">
      <div className="flex w-[var(--signal-sidebar-width)] shrink-0 items-center justify-center gap-2.5 min-[1200px]:justify-start">
        <motion.div
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-gradient-to-br from-accent to-violet text-white shadow-sm"
        >
          <span className="absolute left-[8px] h-1.5 w-1.5 rounded-full bg-white/90" />
          <span className="absolute left-[13px] h-3 w-[2px] rounded-full bg-white/90" />
          <span className="absolute left-[18px] h-[18px] w-[2px] rounded-full bg-white/90" />
          <span className="absolute left-[23px] h-2.5 w-[2px] rounded-full bg-white/90" />
        </motion.div>
        <span className="hidden text-[16px] font-bold text-ink min-[1200px]:inline">Signal</span>
      </div>

      <button
        type="button"
        id="workspace-menu-trigger"
        title="切换工作区"
        aria-label="切换工作区"
        aria-haspopup="dialog"
        aria-expanded={activePanel === "workspace"}
        aria-controls="workspace-panel"
        onClick={() => togglePanel("workspace")}
        className="hidden h-9 min-w-[210px] max-w-[260px] items-center gap-2 rounded-btn px-2.5 text-left text-[13px] font-medium text-ink-2 transition hover:bg-panel min-[1440px]:flex"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-accent">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <span className="truncate">{activeWorkspace?.name ?? "每日技术情报中心"}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-faint" />
      </button>

      <div className="mx-3 flex h-9 min-w-0 flex-1 items-center rounded-field border border-transparent bg-panel px-2.5 transition focus-within:border-indigo-200 focus-within:bg-white focus-within:shadow-sm min-[1200px]:mx-auto min-[1200px]:max-w-[420px]">
        <Search className="h-4 w-4 shrink-0 text-faint" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="全局搜索"
          placeholder="搜索新闻、社区、作者、关键词..."
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-ink outline-none placeholder:text-faint"
        />
        <button
          type="button"
          title="使用 AI 搜索"
          aria-label="使用 AI 搜索当前输入"
          aria-haspopup="dialog"
          aria-expanded={aiPanelOpen && aiPanelMode === "search"}
          aria-controls="ai-assistant-panel"
          onClick={() => openAiPanel("search", searchQuery.trim())}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-r from-accent to-violet text-[11px] font-semibold text-white shadow-sm transition hover:brightness-95 min-[1200px]:w-auto min-[1200px]:gap-1 min-[1200px]:px-2.5"
        >
          <Sparkles className="h-3 w-3" />
          <span className="hidden min-[1200px]:inline">AI Search</span>
        </button>
      </div>

      <div className="ml-1 flex shrink-0 items-center gap-0.5 min-[1200px]:ml-5 min-[1200px]:gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={refreshing}
          title="刷新"
          aria-label="刷新"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setActiveView("summary");
            openAiPanel("summary");
          }}
          title="AI 总结"
          aria-label="AI 总结"
          aria-expanded={aiPanelOpen && aiPanelMode === "summary"}
          aria-controls="ai-assistant-panel"
          className="max-[1099px]:hidden"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="通知"
          aria-label={unreadNotifications > 0 ? `通知，${unreadNotifications} 条未读` : "通知"}
          aria-haspopup="dialog"
          aria-expanded={activePanel === "notifications"}
          aria-controls="notifications-panel"
          onClick={() => togglePanel("notifications")}
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {unreadNotifications > 0 && (
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSettingsSection("general");
            openSettings();
          }}
          title="设置"
          aria-label="设置"
          aria-haspopup="dialog"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => togglePanel("user")}
          aria-label="打开本地用户菜单"
          aria-haspopup="dialog"
          aria-expanded={activePanel === "user"}
          aria-controls="user-panel"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-[11px] font-semibold text-white shadow-sm ring-2 ring-white"
          title="本地用户"
        >
          <CircleUserRound className="h-4 w-4" />
        </button>
      </div>
      <WorkspacePanel />
      <NotificationsPanel />
      <UserPanel />
      <AiAssistantPanel />
    </header>
  );
}
