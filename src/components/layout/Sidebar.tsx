import {
  Bookmark,
  Bot,
  Compass,
  Database,
  Flame,
  Home,
  Library,
  Rss,
} from "lucide-react";
import type { ComponentType } from "react";

import { SOURCE_COLORS } from "../../lib/types";
import { cn } from "../../lib/utils";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import { useUiStore, type ActiveView } from "../../stores/uiStore";

const workbenchItems: Array<{
  id: ActiveView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", label: "首页 Dashboard", icon: Home },
  { id: "trending", label: "热门趋势", icon: Flame },
  { id: "subscriptions", label: "我的订阅", icon: Rss },
  { id: "summary", label: "AI 摘要", icon: Bot },
  { id: "later", label: "稍后阅读", icon: Bookmark },
  { id: "knowledge", label: "收藏知识库", icon: Library },
];

export function Sidebar() {
  const sources = useSourcesStore((s) => s.sources);
  const unreadCounts = useSourcesStore((s) => s.unreadCounts);
  const activeSource = useArticlesStore((s) => s.activeSource);
  const setActiveSource = useArticlesStore((s) => s.setActiveSource);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const enabledSourceCount = sources.filter((source) => source.enabled).length;

  const selectView = (view: ActiveView) => {
    setActiveView(view);
    setActiveSource(null);
  };

  const openSourceSettings = () => {
    setSettingsSection("sources");
    openSettings();
  };

  return (
    <aside className="flex w-[var(--signal-sidebar-width)] shrink-0 flex-col overflow-hidden border-r border-line bg-panel/70 px-2 pb-3 pt-4 min-[1200px]:px-3">
      <SidebarLabel>工作台</SidebarLabel>
      <nav className="space-y-0.5">
        {workbenchItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id && activeSource === null;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onClick={() => selectView(item.id)}
              className={cn(
                "relative flex h-10 w-full items-center justify-center rounded-btn px-0 text-[14px] font-medium transition min-[1200px]:justify-start min-[1200px]:gap-3 min-[1200px]:px-3",
                active
                  ? "bg-accent-soft text-blue-600"
                  : "text-muted hover:bg-gray-100 hover:text-ink",
              )}
            >
              {active && (
                <span className="absolute -left-2 top-2 h-6 w-[3px] rounded-r-full bg-blue-600 min-[1200px]:-left-3" />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden min-[1200px]:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="my-3 h-px bg-line min-[1200px]:my-4" />

      <div className="mb-2 flex items-center justify-center px-0 min-[1200px]:justify-between min-[1200px]:px-3">
        <SidebarLabel className="mb-0">数据源</SidebarLabel>
        <button
          type="button"
          onClick={openSourceSettings}
          className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-white hover:text-ink"
          title="管理数据源"
          aria-label="管理数据源"
          aria-haspopup="dialog"
        >
          <Database className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {sources.length === 0 && (
          <div className="hidden px-3 py-4 text-[11px] leading-5 text-faint min-[1200px]:block">
            尚未连接数据源
          </div>
        )}
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            title={`查看 ${source.name}`}
            aria-label={`查看 ${source.name} 的文章`}
            aria-current={activeSource === source.id ? "page" : undefined}
            onClick={() => {
              setActiveSource(activeSource === source.id ? null : source.id);
              setActiveView("dashboard");
            }}
            className={cn(
              "group relative flex h-10 w-full items-center justify-center rounded-btn px-0 text-left transition min-[1200px]:justify-start min-[1200px]:gap-2.5 min-[1200px]:px-2.5",
              activeSource === source.id ? "bg-white shadow-card" : "hover:bg-white/80",
            )}
          >
            <span
              className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-sm"
              style={{ backgroundColor: SOURCE_COLORS[source.id] ?? "#64748b" }}
            >
              {source.id === "hackernews"
                ? "Y"
                : source.id === "github"
                  ? "GH"
                  : source.name.slice(0, 1).toUpperCase()}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-panel",
                  source.enabled ? "bg-success" : "bg-gray-300",
                )}
                title={source.enabled ? "同步已启用" : "同步已停用"}
              />
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-[13px] font-medium text-ink-2 min-[1200px]:block">
              {source.name}
            </span>
            <span className="hidden min-w-[27px] rounded-full bg-gray-100 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-muted group-hover:bg-gray-200/70 min-[1200px]:inline">
              {unreadCounts[source.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center rounded-btn border border-line bg-white px-1 py-2.5 min-[1200px]:justify-start min-[1200px]:gap-2 min-[1200px]:px-3">
        <span
          className={cn(
            "relative flex h-7 w-7 items-center justify-center rounded-md",
            enabledSourceCount > 0
              ? "bg-emerald-50 text-emerald-600"
              : "bg-gray-100 text-faint",
          )}
        >
          <Compass className="h-3.5 w-3.5" />
          {enabledSourceCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-white bg-success" />}
        </span>
        <div className="hidden min-w-0 min-[1200px]:block">
          <p className="text-[11px] font-semibold text-ink-2">
            {enabledSourceCount > 0 ? "数据源已连接" : "等待启用数据源"}
          </p>
          <p className="text-[10px] text-faint">
            {enabledSourceCount > 0
              ? `${enabledSourceCount} 个来源可同步`
              : sources.length > 0
                ? "打开设置启用来源"
                : "打开设置完成初始化"}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mb-2 hidden px-3 text-[11px] font-semibold uppercase text-faint min-[1200px]:block", className)}>
      {children}
    </p>
  );
}
