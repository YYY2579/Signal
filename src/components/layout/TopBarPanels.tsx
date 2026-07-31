import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BellOff,
  Bot,
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleUserRound,
  FileText,
  HardDrive,
  Info,
  LoaderCircle,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "../../lib/utils";
import { api, isTauriRuntime } from "../../lib/tauri";
import { SOURCE_NAMES, type Article, type ArticleInsight } from "../../lib/types";
import { AiSendConfirmDialog } from "../ai/AiSendConfirmDialog";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore, type TopBarPanel } from "../../stores/uiStore";

type SearchEvidence = {
  localCandidates: number;
  citedArticles: number;
  scope: "local_and_model" | "model_only";
  freshnessNotice: string | null;
};

function normalizeSearchEvidence(response: unknown, resultCount: number): SearchEvidence {
  const payload = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const numberField = (key: string, fallback: number) =>
    typeof payload[key] === "number" && Number.isFinite(payload[key] as number)
      ? Math.max(0, Math.trunc(payload[key] as number))
      : fallback;
  const rawScope = payload.scope ?? payload.answer_scope;
  const scope = rawScope === "model_only" || rawScope === "model-only"
    ? "model_only"
    : "local_and_model";
  return {
    localCandidates: numberField("local_candidate_count", resultCount),
    citedArticles: numberField("cited_article_count", resultCount),
    scope,
    freshnessNotice:
      typeof payload.freshness_notice === "string" && payload.freshness_notice.trim()
        ? payload.freshness_notice.trim()
        : null,
  };
}

function usePanelFocus(
  open: boolean,
  close: () => void,
  panelRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (preferred ?? first ?? panelRef.current)?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [close, open, panelRef]);
}

function FloatingPanel({
  panel,
  className,
  labelledBy,
  children,
}: {
  panel: Exclude<TopBarPanel, null>;
  className: string;
  labelledBy: string;
  children: ReactNode;
}) {
  const activePanel = useUiStore((state) => state.activePanel);
  const closePanels = useUiStore((state) => state.closePanels);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = activePanel === panel;
  usePanelFocus(open, closePanels, panelRef);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="关闭菜单"
            className="fixed inset-0 top-14 z-40 cursor-default bg-transparent"
            onClick={closePanels}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panelRef}
            id={`${panel}-panel`}
            role="dialog"
            aria-modal="false"
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={cn(
              "fixed top-[60px] z-50 overflow-hidden rounded-card border border-line bg-white shadow-card-hover",
              className,
            )}
            initial={{ opacity: 0, y: -5, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function WorkspacePanel() {
  const workspaces = useUiStore((state) => state.workspaces);
  const activeWorkspaceId = useUiStore((state) => state.activeWorkspaceId);
  const selectWorkspace = useUiStore((state) => state.selectWorkspace);
  const renameWorkspace = useUiStore((state) => state.renameWorkspace);
  const activePanel = useUiStore((state) => state.activePanel);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (activePanel !== "workspace") {
      setEditingId(null);
      setNameError("");
    }
  }, [activePanel]);

  const startRename = (workspaceId: string, name: string) => {
    setEditingId(workspaceId);
    setDraftName(name);
    setNameError("");
  };

  const saveRename = () => {
    if (!editingId) return;
    if (!renameWorkspace(editingId, draftName)) {
      setNameError("名称需为 1-40 个字符");
      return;
    }
    setEditingId(null);
    setNameError("");
  };

  return (
    <FloatingPanel
      panel="workspace"
      className="left-[256px] w-[300px]"
      labelledBy="workspace-panel-title"
    >
      <div className="border-b border-line px-4 py-3">
        <p id="workspace-panel-title" className="text-[13px] font-semibold text-ink">
          切换工作区
        </p>
      </div>
      <div className="space-y-1 p-2">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeWorkspaceId;
          const Icon = workspace.locality === "local" ? HardDrive : Bot;
          const editing = editingId === workspace.id;
          return (
            <div
              key={workspace.id}
              className={cn(
                "group flex min-h-11 items-center gap-2 rounded-btn px-2 transition",
                active ? "bg-accent-soft" : "hover:bg-panel",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  active ? "bg-white text-accent" : "bg-panel text-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              {editing ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <input
                    autoFocus
                    value={draftName}
                    maxLength={40}
                    aria-label="工作区名称"
                    onChange={(event) => setDraftName(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveRename();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        setEditingId(null);
                      }
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md border border-indigo-200 bg-white px-2 text-[12px] text-ink outline-none"
                  />
                  <button
                    type="button"
                    title="保存名称"
                    aria-label="保存工作区名称"
                    onClick={saveRename}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-accent transition hover:bg-white"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    title={`切换到${workspace.name}`}
                    aria-label={`切换到${workspace.name}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => selectWorkspace(workspace.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[12px] font-semibold text-ink-2">
                      {workspace.name}
                    </span>
                    <span className="block text-[10px] text-faint">
                      {workspace.locality === "local" ? "本机数据" : "每日工作流"}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="重命名工作区"
                    aria-label={`重命名${workspace.name}`}
                    onClick={() => startRename(workspace.id, workspace.name)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition hover:bg-white hover:text-ink group-hover:opacity-100 focus:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {active && !editing && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
            </div>
          );
        })}
        {nameError && (
          <p role="alert" className="px-2 pb-1 text-[11px] text-red-600">
            {nameError}
          </p>
        )}
      </div>
    </FloatingPanel>
  );
}

export function NotificationsPanel() {
  const notifications = useUiStore((state) => state.notifications);
  const markNotificationRead = useUiStore((state) => state.markNotificationRead);
  const markAllNotificationsRead = useUiStore((state) => state.markAllNotificationsRead);
  const clearNotifications = useUiStore((state) => state.clearNotifications);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <FloatingPanel
      panel="notifications"
      className="right-[60px] w-[340px]"
      labelledBy="notification-panel-title"
    >
      <div className="flex h-12 items-center border-b border-line px-4">
        <p id="notification-panel-title" className="text-[13px] font-semibold text-ink">
          通知
        </p>
        {unreadCount > 0 && (
          <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
            {unreadCount}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={unreadCount === 0}
            title="全部标为已读"
            aria-label="全部标为已读"
            onClick={markAllNotificationsRead}
            className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-ink disabled:opacity-35"
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={notifications.length === 0}
            title="清除通知"
            aria-label="清除全部通知"
            onClick={clearNotifications}
            className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-red-600 disabled:opacity-35"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex h-[190px] flex-col items-center justify-center px-8 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-panel text-faint">
              <BellOff className="h-4 w-4" />
            </span>
            <p className="text-[12px] font-semibold text-ink-2">暂无通知</p>
            <p className="mt-1 text-[11px] leading-5 text-faint">同步和处理事件会显示在这里</p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {notifications.map((notification) => {
              const Icon =
                notification.kind === "error"
                  ? CircleAlert
                  : notification.kind === "info"
                    ? Info
                    : CircleCheck;
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => markNotificationRead(notification.id)}
                  aria-label={`${notification.read ? "已读" : "未读"}通知：${notification.title}`}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-panel",
                    !notification.read && "bg-indigo-50/45",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      notification.kind === "error"
                        ? "text-red-500"
                        : notification.kind === "info"
                          ? "text-blue-500"
                          : "text-emerald-500",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-ink-2">
                      {notification.title}
                    </span>
                    {notification.description && (
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted">
                        {notification.description}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] text-faint">
                      {new Date(notification.createdAt).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  {!notification.read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}

export function UserPanel() {
  const togglePanel = useUiStore((state) => state.togglePanel);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const closePanels = useUiStore((state) => state.closePanels);
  const openSettings = useSettingsStore((state) => state.openSettings);

  const openPreferences = () => {
    closePanels();
    setSettingsSection("general");
    openSettings();
  };

  return (
    <FloatingPanel panel="user" className="right-4 w-[260px]" labelledBy="user-panel-title">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white">
            <CircleUserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span id="user-panel-title" className="block truncate text-[12px] font-semibold text-ink">
              本地用户
            </span>
            <span className="block text-[10px] text-faint">数据保存在本机</span>
          </span>
        </div>
      </div>
      <div className="p-2">
        <button
          type="button"
          onClick={() => togglePanel("workspace")}
          className="flex h-9 w-full items-center gap-2 rounded-btn px-2.5 text-[12px] text-ink-2 transition hover:bg-panel"
        >
          <HardDrive className="h-3.5 w-3.5 text-muted" />
          工作区
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-faint" />
        </button>
        <button
          type="button"
          onClick={openPreferences}
          className="flex h-9 w-full items-center gap-2 rounded-btn px-2.5 text-[12px] text-ink-2 transition hover:bg-panel"
        >
          <Settings className="h-3.5 w-3.5 text-muted" />
          偏好设置
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-faint" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[10px] text-faint">
        <CircleUserRound className="h-3.5 w-3.5" />
        Signal 本地模式
      </div>
    </FloatingPanel>
  );
}

export function AiAssistantPanel() {
  const open = useUiStore((state) => state.aiPanelOpen);
  const requestKey = useUiStore((state) => state.aiPanelRequestKey);
  const mode = useUiStore((state) => state.aiPanelMode);
  const status = useUiStore((state) => state.aiRequestStatus);
  const input = useUiStore((state) => state.aiRequestInput);
  const error = useUiStore((state) => state.aiRequestError);
  const setAiRequestState = useUiStore((state) => state.setAiRequestState);
  const addNotification = useUiStore((state) => state.addNotification);
  const closeAiPanel = useUiStore((state) => state.closeAiPanel);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const articles = useArticlesStore((state) => state.articles);
  const readingArticleId = useArticlesStore((state) => state.readingArticleId);
  const openArticleResult = useArticlesStore((state) => state.openArticleResult);
  const loadArticles = useArticlesStore((state) => state.loadArticles);
  const [query, setQuery] = useState(input);
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [searchEvidence, setSearchEvidence] = useState<SearchEvidence | null>(null);
  const [insight, setInsight] = useState<ArticleInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [aiConfigState, setAiConfigState] = useState<
    "checking" | "ready" | "missing" | "unavailable"
  >("checking");
  const [aiConfigLabel, setAiConfigLabel] = useState("正在读取配置");
  const [confirmSummary, setConfirmSummary] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const requestSequence = useRef(0);
  const insightSequence = useRef(0);
  usePanelFocus(open && !confirmSummary, closeAiPanel, panelRef);

  useEffect(() => {
    if (!open) return;
    requestSequence.current += 1;
    setQuery(input);
    setAnswer("");
    setResults([]);
    setSearchEvidence(null);
    setInsight(null);
    setInsightLoading(false);
    setReviewBusy(false);
    setReviewError(null);
    setConfirmSummary(false);
  }, [mode, open, requestKey]);

  useEffect(() => {
    if (!open) requestSequence.current += 1;
  }, [open]);

  const selectedArticle = articles.find((article) => article.id === readingArticleId) ?? null;
  const running = status === "preparing" || status === "streaming";

  useEffect(() => {
    if (!open || mode !== "summary") return;
    let active = true;
    setAiConfigState("checking");
    setAiConfigLabel("正在读取配置");
    if (!isTauriRuntime()) {
      setAiConfigState("unavailable");
      setAiConfigLabel("仅桌面应用可用");
      return;
    }
    void api
      .getAiSettings()
      .then((settings) => {
        if (!active) return;
        const configured = Boolean(
          settings.configured && settings.model.trim() && settings.base_url.trim(),
        );
        setAiConfigState(configured ? "ready" : "missing");
        setAiConfigLabel(configured ? settings.model : "尚未完成模型配置");
      })
      .catch(() => {
        if (!active) return;
        setAiConfigState("missing");
        setAiConfigLabel("配置状态读取失败");
      });
    return () => {
      active = false;
    };
  }, [mode, open, requestKey]);

  useEffect(() => {
    const articleId = selectedArticle?.id;
    const loadId = ++insightSequence.current;
    setReviewError(null);
    if (!open || mode !== "summary" || !articleId || !isTauriRuntime()) {
      setInsight(null);
      setInsightLoading(false);
      return;
    }
    setInsight(null);
    setInsightLoading(true);
    void api
      .getArticleInsight(articleId)
      .then((saved) => {
        if (loadId !== insightSequence.current) return;
        setInsight(saved);
      })
      .catch((loadError) => {
        if (loadId !== insightSequence.current) return;
        setReviewError(
          loadError instanceof Error ? loadError.message : "已有总结读取失败",
        );
      })
      .finally(() => {
        if (loadId === insightSequence.current) setInsightLoading(false);
      });
  }, [mode, open, selectedArticle?.id]);

  const runSearch = async () => {
    const normalized = query.trim();
    const requestId = ++requestSequence.current;
    if (!normalized) {
      setAiRequestState("error", { input: normalized, error: "请输入需要检索的问题" });
      return;
    }
    if (!isTauriRuntime()) {
      setAiRequestState("error", {
        input: normalized,
        error: "AI Search 需要在 Signal 桌面应用中使用",
      });
      return;
    }
    setAiRequestState("preparing", { input: normalized, error: null });
    setAnswer("");
    setResults([]);
    setSearchEvidence(null);
    try {
      setAiRequestState("streaming", { input: normalized, error: null });
      const response = await api.aiSearch(normalized);
      if (requestId !== requestSequence.current) return;
      setAnswer(response.answer);
      setResults(response.articles);
      setSearchEvidence(normalizeSearchEvidence(response, response.articles.length));
      setAiRequestState("complete", { input: normalized, error: null });
      addNotification({
        title: "AI 搜索完成",
        description: `${response.articles.length} 篇本地引用`,
        kind: "success",
      });
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setAiRequestState("error", {
        input: normalized,
        error: message,
      });
      addNotification({ title: "AI 搜索失败", description: message, kind: "error" });
    }
  };

  const prepareSummary = async () => {
    setReviewError(null);
    if (!selectedArticle) {
      setAiRequestState("error", { error: "请先在 Feed 中选择一篇文章" });
      return;
    }
    if (!isTauriRuntime()) {
      setAiRequestState("error", { error: "AI 总结需要在 Signal 桌面应用中使用" });
      return;
    }
    const requestId = ++requestSequence.current;
    setAiRequestState("preparing", { input: selectedArticle.title, error: null });
    try {
      const settings = await api.getAiSettings();
      if (requestId !== requestSequence.current) return;
      if (!settings.configured || !settings.model.trim() || !settings.base_url.trim()) {
        setAiConfigState("missing");
        setAiConfigLabel("尚未完成模型配置");
        throw new Error("请先完成 AI 模型、服务地址和 API Key 配置");
      }
      setAiConfigState("ready");
      setAiConfigLabel(settings.model);
      setAiRequestState("idle", { input: selectedArticle.title, error: null });
      setConfirmSummary(true);
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setAiRequestState("error", { input: selectedArticle.title, error: message });
    }
  };

  const runSummary = async () => {
    if (!selectedArticle) return;
    const requestId = ++requestSequence.current;
    insightSequence.current += 1;
    setConfirmSummary(false);
    setAiRequestState("preparing", { input: selectedArticle.title, error: null });
    setInsight(null);
    setInsightLoading(false);
    setReviewError(null);
    try {
      setAiRequestState("streaming", { input: selectedArticle.title, error: null });
      const generated = await api.generateArticleInsight(selectedArticle.id);
      if (requestId !== requestSequence.current) return;
      setInsight(generated);
      await loadArticles();
      if (requestId !== requestSequence.current) return;
      setAiRequestState("complete", { input: selectedArticle.title, error: null });
      addNotification({
        title: "AI 总结已生成",
        description: selectedArticle.title,
        kind: "success",
      });
    } catch (requestError) {
      if (requestId !== requestSequence.current) return;
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setAiRequestState("error", {
        input: selectedArticle.title,
        error: message,
      });
      addNotification({ title: "AI 总结生成失败", description: message, kind: "error" });
    }
  };

  const reviewSummary = async (action: "accept" | "reject") => {
    if (!selectedArticle || !insight || reviewBusy) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const reviewed = await api.reviewArticleInsight(selectedArticle.id, action);
      setInsight(reviewed);
      setAiRequestState("complete", { input: selectedArticle.title, error: null });
      await loadArticles();
      addNotification({
        title: action === "accept" ? "AI 总结已接受" : "AI 总结已拒绝",
        description: selectedArticle.title,
        kind: action === "accept" ? "success" : "info",
      });
    } catch (reviewFailure) {
      const message =
        reviewFailure instanceof Error ? reviewFailure.message : String(reviewFailure);
      setReviewError(message);
      addNotification({ title: "AI 审核操作失败", description: message, kind: "error" });
    } finally {
      setReviewBusy(false);
    }
  };

  const selectSummaryArticle = (article: Article) => {
    requestSequence.current += 1;
    openArticleResult(article);
    setAiRequestState("idle", { input: article.title, error: null });
  };

  const openAiSettings = () => {
    closeAiPanel();
    setSettingsSection("ai");
    openSettings();
  };

  const statusLabel = {
    idle: "等待请求",
    preparing: "正在准备",
    streaming: "正在生成",
    complete: "已完成",
    error: "请求失败",
  }[status];
  const summaryStatusLabel = running
    ? statusLabel
    : !selectedArticle
      ? "等待选择文章"
      : insightLoading
        ? "正在读取已有总结"
        : insight?.status === "draft"
          ? "草稿等待人工审核"
          : insight?.status === "accepted"
            ? "总结已接受"
            : insight?.status === "rejected"
              ? "总结已拒绝"
              : aiConfigState === "ready"
                ? "可以生成单篇总结"
                : "等待配置 AI 服务";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="关闭 AI 面板"
            className="fixed inset-0 top-14 z-30 cursor-default bg-black/[0.02]"
            onClick={closeAiPanel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            ref={panelRef}
            id="ai-assistant-panel"
            aria-label={mode === "search" ? "AI 搜索" : "AI 总结"}
            tabIndex={-1}
            className="fixed bottom-0 right-0 top-14 z-40 flex w-[380px] flex-col border-l border-line bg-white shadow-card-hover"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-accent-soft text-accent">
                <Bot className="h-4 w-4" />
              </span>
              <div className="ml-2.5 min-w-0">
                <h2 className="text-[13px] font-semibold text-ink">
                  {mode === "search" ? "AI Search" : "AI 总结"}
                </h2>
                <p className="text-[10px] text-faint">
                  {mode === "summary" ? summaryStatusLabel : statusLabel}
                </p>
              </div>
              <button
                type="button"
                title="关闭 AI 面板"
                aria-label="关闭 AI 面板"
                onClick={closeAiPanel}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-btn text-faint transition hover:bg-panel hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {mode === "search" && (
                <div className="rounded-btn border border-line bg-panel px-3 py-2.5">
                  <label htmlFor="ai-search-query" className="text-[10px] font-semibold text-faint">
                    检索问题
                  </label>
                  <textarea
                    id="ai-search-query"
                    data-autofocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={running}
                    rows={3}
                    placeholder="询问当前情报库中的技术趋势..."
                    className="mt-1.5 w-full resize-none bg-transparent text-[12px] leading-5 text-ink-2 outline-none placeholder:text-faint disabled:opacity-60"
                  />
                </div>
              )}
              {mode === "search" && (
                status === "error" && error ? (
                  <div role="alert" className="mt-3 rounded-btn border border-red-100 bg-red-50 px-3 py-2.5">
                    <p className="text-[12px] font-semibold text-red-700">{error}</p>
                  </div>
                ) : status === "complete" ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-btn border border-indigo-100 bg-indigo-50/60 px-3 py-3">
                      <p className="text-[10px] font-semibold text-accent">AI 回答</p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-5 text-ink-2">
                        {answer || "没有足够证据生成回答。"}
                      </p>
                    </div>
                    <section className="rounded-btn border border-line bg-panel px-3 py-2.5" aria-label="回答证据范围">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-semibold text-ink-2">回答范围</span>
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 font-semibold",
                          searchEvidence?.scope === "model_only"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-indigo-50 text-accent",
                        )}>
                          {searchEvidence?.scope === "model_only" ? "模型知识" : "本地证据 + 模型知识"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-4 text-faint">
                        本地候选 {searchEvidence?.localCandidates ?? results.length} 篇，引用 {searchEvidence?.citedArticles ?? results.length} 篇。AI Search 不执行实时互联网检索，模型知识可能不是最新信息。
                      </p>
                      {searchEvidence?.freshnessNotice && (
                        <p className="mt-1 text-[10px] leading-4 text-amber-700">{searchEvidence.freshnessNotice}</p>
                      )}
                    </section>
                    {results.length > 0 && (
                      <section aria-label="引用文章" className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-faint">引用文章</p>
                        {results.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => {
                              openArticleResult(article);
                              closeAiPanel();
                            }}
                            className="w-full rounded-btn border border-line px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-panel"
                          >
                            <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-ink-2">
                              {article.title}
                            </span>
                            <span className="mt-1 block text-[9px] text-faint">{article.source}</span>
                          </button>
                        ))}
                      </section>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[260px] flex-col items-center justify-center px-7 text-center">
                    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
                      {running ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
                    </span>
                    <p className="text-[13px] font-semibold text-ink-2">
                      {running ? "正在组合本地证据与模型知识" : "本地证据 + 模型知识"}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-5 text-faint">
                      基于本地情报库与模型知识回答，不执行实时互联网搜索
                    </p>
                  </div>
                )
              )}
              {mode === "summary" && (
                <div className="-mx-4 -mb-4 -mt-4">
                  <section className="border-b border-line px-4 py-3.5" aria-label="当前总结上下文">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-btn bg-panel text-muted">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-semibold text-faint">当前文章</p>
                        <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-4 text-ink">
                          {selectedArticle?.title ?? "尚未选择"}
                        </p>
                        {selectedArticle && (
                          <p className="mt-1 text-[9px] text-faint">
                            {SOURCE_NAMES[selectedArticle.source] ?? selectedArticle.source}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={openAiSettings}
                        className={cn(
                          "flex h-7 shrink-0 items-center gap-1.5 rounded-btn border px-2 text-[9px] font-semibold transition hover:bg-panel",
                          aiConfigState === "ready"
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                            : "border-amber-100 bg-amber-50 text-amber-700",
                        )}
                      >
                        {aiConfigState === "checking" ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : aiConfigState === "ready" ? (
                          <CircleCheck className="h-3 w-3" />
                        ) : (
                          <CircleAlert className="h-3 w-3" />
                        )}
                        {aiConfigState === "ready" ? "AI 已配置" : "配置 AI"}
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 border-y border-line py-2 text-[9px] font-medium">
                      <span className={aiConfigState === "ready" ? "text-emerald-700" : "text-faint"}>
                        1. AI 服务
                      </span>
                      <span className={insight ? "text-violet-700" : "text-faint"}>
                        2. 总结草稿
                      </span>
                      <span className={insight?.status === "accepted" ? "text-emerald-700" : "text-faint"}>
                        3. 人工审核
                      </span>
                    </div>
                    <p className="mt-2 truncate text-[9px] text-faint">{aiConfigLabel}</p>
                  </section>

                  {!selectedArticle ? (
                    <section className="px-4 py-4" aria-label="选择总结文章">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-ink">选择一篇文章</p>
                        <span className="text-[9px] text-faint">{articles.length} 篇可用</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {articles.slice(0, 5).map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => selectSummaryArticle(article)}
                            className="group flex min-h-12 w-full items-center gap-2.5 rounded-btn border border-line px-3 py-2 text-left transition hover:border-indigo-200 hover:bg-panel"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-[11px] font-semibold leading-4 text-ink-2">
                                {article.title}
                              </span>
                              <span className="mt-0.5 block text-[9px] text-faint">
                                {SOURCE_NAMES[article.source] ?? article.source}
                              </span>
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint transition group-hover:text-accent" />
                          </button>
                        ))}
                        {articles.length === 0 && (
                          <div className="rounded-btn border border-dashed border-line px-3 py-6 text-center text-[10px] text-faint">
                            当前 Feed 暂无可总结文章
                          </div>
                        )}
                      </div>
                    </section>
                  ) : (
                    <section className="px-4 py-4" aria-label="文章 AI 总结">
                      {(status === "error" && error) || reviewError ? (
                        <div role="alert" className="mb-3 rounded-btn border border-red-100 bg-red-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold leading-5 text-red-700">
                            {reviewError || error}
                          </p>
                        </div>
                      ) : null}
                      {insightLoading || running ? (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center" aria-live="polite">
                          <LoaderCircle className="h-5 w-5 animate-spin text-accent" />
                          <p className="mt-3 text-[12px] font-semibold text-ink-2">
                            {running ? "正在生成单篇总结" : "正在读取已有总结"}
                          </p>
                          <p className="mt-1 text-[10px] text-faint">
                            {running ? "等待模型返回结构化结果" : "同步当前文章的审核状态"}
                          </p>
                        </div>
                      ) : insight ? (
                        <div className="rounded-btn border border-violet-100 bg-violet-50/60 px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            {insight.status === "accepted" ? (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 text-violet-700" />
                            )}
                            <p className="text-[10px] font-semibold text-violet-700">
                              {insight.status === "draft"
                                ? "待审核草稿"
                                : insight.status === "accepted"
                                  ? "已接受总结"
                                  : insight.status === "rejected"
                                    ? "已拒绝总结"
                                    : "生成失败"}
                            </p>
                          </div>
                          {insight.summary ? (
                            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-ink-2">
                              {insight.summary}
                            </p>
                          ) : (
                            <p className="mt-2 text-[11px] leading-5 text-red-700">
                              {insight.error || "模型没有返回可用总结"}
                            </p>
                          )}
                          {insight.key_points.length > 0 && (
                            <ul className="mt-2 space-y-1 border-t border-violet-100 pt-2 text-[11px] leading-4 text-muted">
                              {insight.key_points.slice(0, 4).map((point) => (
                                <li key={point}>- {point}</li>
                              ))}
                            </ul>
                          )}
                          {insight.status === "draft" && (
                            <div className="mt-3 flex items-center gap-2 border-t border-violet-100 pt-3">
                              <button
                                type="button"
                                disabled={reviewBusy}
                                onClick={() => void reviewSummary("reject")}
                                className="flex h-8 items-center gap-1 rounded-btn px-2.5 text-[10px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />拒绝
                              </button>
                              <button
                                type="button"
                                disabled={reviewBusy}
                                onClick={() => void reviewSummary("accept")}
                                className="ml-auto flex h-8 items-center gap-1 rounded-btn bg-accent px-3 text-[10px] font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
                              >
                                {reviewBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                                {reviewBusy ? "保存中" : "接受总结"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : aiConfigState === "ready" ? (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                            <Sparkles className="h-4 w-4" />
                          </span>
                          <p className="mt-3 text-[12px] font-semibold text-ink-2">尚未生成总结</p>
                          <button
                            type="button"
                            onClick={() => void prepareSummary()}
                            className="mt-3 flex h-8 items-center gap-1.5 rounded-btn bg-accent px-3 text-[10px] font-semibold text-white transition hover:bg-accent-strong"
                          >
                            <Sparkles className="h-3.5 w-3.5" />生成单篇总结
                          </button>
                        </div>
                      ) : (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center">
                          <CircleAlert className="h-5 w-5 text-amber-500" />
                          <p className="mt-3 text-[12px] font-semibold text-ink-2">AI 服务尚未可用</p>
                          <button
                            type="button"
                            onClick={openAiSettings}
                            className="mt-3 flex h-8 items-center gap-1.5 rounded-btn border border-line bg-white px-3 text-[10px] font-semibold text-ink-2 transition hover:bg-panel"
                          >
                            <Settings className="h-3.5 w-3.5" />打开 AI 设置
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-line p-3">
              <button
                type="button"
                onClick={() => {
                  if (mode === "search") {
                    void runSearch();
                  } else if (!selectedArticle && articles[0]) {
                    selectSummaryArticle(articles[0]);
                  } else if (aiConfigState !== "ready") {
                    openAiSettings();
                  } else if (insight?.status === "draft") {
                    void reviewSummary("accept");
                  } else {
                    void prepareSummary();
                  }
                }}
                disabled={
                  running ||
                  reviewBusy ||
                  (mode === "summary" &&
                    ((!selectedArticle && articles.length === 0) || aiConfigState === "checking"))
                }
                className="mb-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-btn bg-gradient-to-r from-accent to-violet text-[12px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running || reviewBusy || (mode === "summary" && aiConfigState === "checking") ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : mode === "search" ? (
                  <Search className="h-3.5 w-3.5" />
                ) : insight?.status === "draft" ? (
                  <CheckCheck className="h-3.5 w-3.5" />
                ) : aiConfigState !== "ready" ? (
                  <Settings className="h-3.5 w-3.5" />
                ) : !selectedArticle ? (
                  <FileText className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {running
                  ? "处理中"
                  : reviewBusy
                    ? "保存审核状态"
                    : mode === "search"
                      ? "开始 AI 搜索"
                      : aiConfigState === "checking"
                        ? "检查 AI 配置"
                        : !selectedArticle
                          ? articles.length
                            ? "选择首篇文章"
                            : "暂无可选文章"
                          : aiConfigState !== "ready"
                            ? "配置 AI 服务"
                            : insight?.status === "draft"
                              ? "接受当前草稿"
                              : insight
                                ? "重新生成总结"
                                : "生成当前文章总结"}
              </button>
              <button
                type="button"
                onClick={openAiSettings}
                className="flex h-9 w-full items-center justify-center rounded-btn border border-line bg-white text-[12px] font-medium text-ink-2 transition hover:bg-panel"
              >
                <Settings className="h-3.5 w-3.5" />
                AI 设置
              </button>
            </div>
          </motion.aside>
          <AiSendConfirmDialog
            open={confirmSummary}
            articleTitle={selectedArticle?.title ?? ""}
            sourceName={
              selectedArticle
                ? (SOURCE_NAMES[selectedArticle.source] ?? selectedArticle.source)
                : ""
            }
            hasSummary={Boolean(selectedArticle?.summary)}
            hasContent={Boolean(selectedArticle?.content)}
            onClose={() => setConfirmSummary(false)}
            onConfirm={() => void runSummary()}
          />
        </>
      )}
    </AnimatePresence>
  );
}
