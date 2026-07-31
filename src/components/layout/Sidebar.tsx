import {
  Bookmark,
  Bot,
  Compass,
  Database,
  Flame,
  Github,
  Home,
  Library,
  Rss,
} from "lucide-react";
import type { ComponentType } from "react";

import { SOURCE_COLORS, type SourceConfig } from "../../lib/types";
import { translate, type MessageKey } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import { useUiStore, type ActiveView } from "../../stores/uiStore";

const workbenchItems: Array<{
  id: ActiveView;
  labelKey: MessageKey;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "dashboard", labelKey: "sidebar.dashboard", icon: Home },
  { id: "trending", labelKey: "sidebar.trending", icon: Flame },
  { id: "subscriptions", labelKey: "sidebar.subscriptions", icon: Rss },
  { id: "summary", labelKey: "sidebar.summary", icon: Bot },
  { id: "later", labelKey: "sidebar.later", icon: Bookmark },
  { id: "knowledge", labelKey: "sidebar.knowledge", icon: Library },
];

export function Sidebar() {
  const sources = useSourcesStore((s) => s.sources);
  const unreadCounts = useSourcesStore((s) => s.unreadCounts);
  const activeSource = useArticlesStore((s) => s.activeSource);
  const setActiveSource = useArticlesStore((s) => s.setActiveSource);
  const closeReader = useArticlesStore((s) => s.closeReader);
  const openSettings = useSettingsStore((state) => state.openSettings);
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const locale = useUiStore((state) => state.locale);
  const t = (key: MessageKey, values?: Record<string, string | number>) => translate(locale, key, values);
  const enabledSourceCount = sources.filter((source) => source.enabled).length;

  const selectView = (view: ActiveView) => {
    closeReader();
    setActiveView(view);
    setActiveSource(null);
  };

  const openSourceSettings = () => {
    setSettingsSection("sources");
    openSettings();
  };

  return (
    <aside className="flex w-[var(--signal-sidebar-width)] shrink-0 flex-col overflow-hidden border-r border-line bg-panel/70 px-2 pb-3 pt-4 min-[1200px]:px-3">
      <SidebarLabel>{t("sidebar.workbench")}</SidebarLabel>
      <nav className="space-y-0.5">
        {workbenchItems.map((item) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          const active = activeView === item.id && activeSource === null;
          return (
            <button
              key={item.id}
              type="button"
              title={label}
              aria-label={label}
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
              <span className="hidden min-[1200px]:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="my-3 h-px bg-line min-[1200px]:my-4" />

      <div className="mb-2 flex items-center justify-center px-0 min-[1200px]:justify-between min-[1200px]:px-3">
        <SidebarLabel className="mb-0">{t("sidebar.sources")}</SidebarLabel>
        <button
          type="button"
          onClick={openSourceSettings}
          className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-white hover:text-ink"
          title={t("sidebar.manageSources")}
          aria-label={t("sidebar.manageSources")}
          aria-haspopup="dialog"
        >
          <Database className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {sources.length === 0 && (
          <div className="hidden px-3 py-4 text-[11px] leading-5 text-faint min-[1200px]:block">
            {t("sidebar.noSources")}
          </div>
        )}
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            title={t("sidebar.viewSource", { name: source.name })}
            aria-label={t("sidebar.viewSourceArticles", { name: source.name })}
            aria-current={activeSource === source.id ? "page" : undefined}
            onClick={() => {
              closeReader();
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
              style={{
                backgroundColor:
                  SOURCE_COLORS[source.platform ?? source.icon ?? source.id] ?? "#64748b",
              }}
            >
              <SourceMark source={source} />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-panel",
                  source.enabled ? "bg-success" : "bg-gray-300",
                )}
                title={t(source.enabled ? "sidebar.syncEnabled" : "sidebar.syncDisabled")}
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
            {t(enabledSourceCount > 0 ? "sidebar.connected" : "sidebar.waiting")}
          </p>
          <p className="text-[10px] text-faint">
            {enabledSourceCount > 0
              ? t("sidebar.sourceCount", { count: enabledSourceCount })
              : sources.length > 0
                ? t("sidebar.enableSources")
                : t("sidebar.initialize")}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SourceMark({ source }: { source: SourceConfig }) {
  const brand = source.icon ?? source.platform ?? source.id;
  if (brand === "github") return <Github className="h-3.5 w-3.5" aria-hidden="true" />;
  if (brand === "rss" || source.feed_url) {
    return <Rss className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  if (brand === "hackernews") return <>Y</>;
  return <>{source.name.slice(0, brand === "csdn" ? 1 : 2).toUpperCase()}</>;
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
