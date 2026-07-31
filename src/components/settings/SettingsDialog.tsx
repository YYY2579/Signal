import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Bot,
  Check,
  CircleAlert,
  ClipboardPaste,
  Database,
  ExternalLink,
  Filter,
  KeyRound,
  LoaderCircle,
  Plus,
  Rss,
  RotateCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { api, isTauriRuntime } from "../../lib/tauri";
import type { AiPreferences } from "../../lib/types";
import {
  AI_PROVIDER_OPTIONS,
  canonicalAiProviderId,
  getAiProviderOption,
  nextProviderBaseUrl,
} from "../../lib/aiProviders";
import { cn } from "../../lib/utils";
import { useSettingsStore } from "../../stores/settingsStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import {
  useUiStore,
  type SettingsSection,
} from "../../stores/uiStore";

const settingsNavigation: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Settings2;
}> = [
  { id: "general", label: "通用", icon: Settings2 },
  { id: "sources", label: "数据源", icon: Database },
  { id: "filters", label: "关键词过滤", icon: Filter },
  { id: "ai", label: "AI", icon: Bot },
  { id: "accounts", label: "来源登录", icon: UserRound },
];

interface FeedPreset {
  name: string;
  url: string;
}

interface FeedPresetGroup {
  label: string;
  sources: readonly FeedPreset[];
}

const FEED_PRESET_GROUPS: readonly FeedPresetGroup[] = [
  {
    label: "中文技术社区",
    sources: [
      { name: "SegmentFault 最新问题", url: "https://segmentfault.com/feeds" },
      { name: "OSCHINA 社区", url: "https://www.oschina.net/news/rss" },
      { name: "博客园首页", url: "https://feed.cnblogs.com/blog/sitehome/rss" },
      { name: "Ruby China", url: "https://ruby-china.org/topics/feed" },
      { name: "InfoQ 中文", url: "https://www.infoq.cn/feed" },
    ],
  },
  {
    label: "国际技术社区",
    sources: [
      { name: "DEV Community", url: "https://dev.to/feed" },
      { name: "Lobsters", url: "https://lobste.rs/rss" },
    ],
  },
  {
    label: "语言与开发者论坛",
    sources: [
      { name: "Rust Users Forum", url: "https://users.rust-lang.org/latest.rss" },
      { name: "Rust Internals", url: "https://internals.rust-lang.org/latest.rss" },
      { name: "Python Discussions", url: "https://discuss.python.org/latest.rss" },
      { name: "Go Forum", url: "https://forum.golangbridge.org/latest.rss" },
    ],
  },
] as const;

const FEED_PRESETS = FEED_PRESET_GROUPS.flatMap((group) => group.sources);

export function SettingsDialog() {
  const open = useSettingsStore((state) => state.settingsOpen);
  const closeSettings = useSettingsStore((state) => state.closeSettings);
  const activeSection = useUiStore((state) => state.settingsSection);
  const setSettingsSection = useUiStore((state) => state.setSettingsSection);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const sectionRefs = useRef(new Map<SettingsSection, HTMLElement>());

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
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
      previousFocusRef.current?.focus();
    };
  }, [closeSettings, open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      sectionRefs.current.get(activeSection)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, open]);

  if (!open) return null;

  const sectionRef = (section: SettingsSection) => (node: HTMLElement | null) => {
    if (node) sectionRefs.current.set(section, node);
    else sectionRefs.current.delete(section);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSettings();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="flex h-[min(720px,86vh)] w-[760px] max-w-[calc(100vw-48px)] overflow-hidden rounded-card border border-line bg-white shadow-2xl"
      >
        <aside className="w-[168px] shrink-0 border-r border-line bg-panel/70 p-3">
          <h2 id="settings-dialog-title" className="px-2 pb-3 pt-1 text-[15px] font-semibold text-ink">
            设置
          </h2>
          <nav aria-label="设置分类" className="space-y-0.5">
            {settingsNavigation.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setSettingsSection(item.id)}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-btn px-2.5 text-left text-[12px] font-medium transition",
                    active
                      ? "bg-white text-accent shadow-card"
                      : "text-muted hover:bg-white/80 hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
            <p className="text-[12px] font-medium text-muted">
              {settingsNavigation.find((item) => item.id === activeSection)?.label}
            </p>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeSettings}
              title="关闭设置"
              aria-label="关闭设置"
              className="flex h-8 w-8 items-center justify-center rounded-btn text-faint transition hover:bg-panel hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-6 pb-10">
            <SettingsSectionBlock refCallback={sectionRef("general")} title="通用">
              <GeneralSection />
            </SettingsSectionBlock>
            <SettingsSectionBlock refCallback={sectionRef("sources")} title="数据源">
              <SourcesSection />
            </SettingsSectionBlock>
            <SettingsSectionBlock refCallback={sectionRef("filters")} title="关键词过滤">
              <FilterSection />
            </SettingsSectionBlock>
            <SettingsSectionBlock refCallback={sectionRef("ai")} title="AI 设置">
              <AiSection />
            </SettingsSectionBlock>
            <SettingsSectionBlock refCallback={sectionRef("accounts")} title="来源登录">
              <LoginSection />
            </SettingsSectionBlock>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsSectionBlock({
  title,
  children,
  refCallback,
}: {
  title: string;
  children: React.ReactNode;
  refCallback: (node: HTMLElement | null) => void;
}) {
  return (
    <section ref={refCallback} className="scroll-mt-1 border-b border-line py-6 last:border-b-0">
      <h3 className="mb-4 text-[14px] font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function GeneralSection() {
  const workspaces = useUiStore((state) => state.workspaces);
  const activeWorkspaceId = useUiStore((state) => state.activeWorkspaceId);
  const selectWorkspace = useUiStore((state) => state.selectWorkspace);

  return (
    <SettingRow label="默认工作区" description="应用启动时恢复上次选中的工作区">
      <select
        value={activeWorkspaceId}
        aria-label="默认工作区"
        onChange={(event) => selectWorkspace(event.target.value)}
        className="h-9 w-[220px] rounded-btn border border-line bg-white px-2.5 text-[12px] text-ink-2 outline-none focus:border-indigo-300"
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </SettingRow>
  );
}

function SourcesSection() {
  const sources = useSourcesStore((state) => state.sources);
  const sourcesLoading = useSourcesStore((state) => state.sourcesLoading);
  const sourcesError = useSourcesStore((state) => state.sourcesError);
  const loadSources = useSourcesStore((state) => state.loadSources);
  const toggleSource = useSourcesStore((state) => state.toggleSource);
  const toggleSubscription = useSourcesStore((state) => state.toggleSubscription);
  const updateInterval = useSourcesStore((state) => state.updateInterval);
  const addSource = useSourcesStore((state) => state.addSource);
  const removeSource = useSourcesStore((state) => state.removeSource);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intervalDrafts, setIntervalDrafts] = useState<Record<string, string>>({});
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [selectedPresetUrl, setSelectedPresetUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setIntervalDrafts(
      Object.fromEntries(
        sources.map((source) => [source.id, String(source.interval_minutes)]),
      ),
    );
  }, [sources]);

  const saveSource = async (operation: () => Promise<void>, id: string) => {
    setPendingSource(id);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "数据源设置保存失败");
    } finally {
      setPendingSource(null);
    }
  };

  if (sourcesLoading && sources.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center text-faint" aria-label="正在加载数据源">
        <LoaderCircle className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (sourcesError && sources.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-btn border border-red-100 bg-red-50/60 px-5 text-center">
        <CircleAlert className="h-4 w-4 text-red-500" />
        <p role="alert" className="mt-2 text-[11px] text-red-700">数据源读取失败：{sourcesError}</p>
        <button
          type="button"
          onClick={() => void loadSources()}
          className="mt-3 flex h-8 items-center gap-1.5 rounded-btn border border-red-200 bg-white px-3 text-[11px] font-medium text-red-700 transition hover:bg-red-50"
        >
          <RotateCw className="h-3.5 w-3.5" />
          重试读取
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form
        className="rounded-btn border border-line bg-panel/50 p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setAdding(true);
          setError(null);
          try {
            await addSource(customName, customUrl);
            setCustomName("");
            setCustomUrl("");
            setSelectedPresetUrl("");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "添加 Feed 失败");
          } finally {
            setAdding(false);
          }
        }}
      >
        <div className="mb-2">
          <p className="text-[12px] font-semibold text-ink-2">添加 RSS / Atom 来源</p>
          <p className="mt-0.5 text-[10px] text-faint">
            系统会验证 Feed 格式并识别平台；普通网页暂不支持。
          </p>
        </div>
        <label className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted">
          <span className="flex shrink-0 items-center gap-1.5">
            <Rss className="h-3.5 w-3.5 text-accent" />
            常用技术社区
          </span>
          <select
            value={selectedPresetUrl}
            onChange={(event) => {
              const url = event.currentTarget.value;
              setSelectedPresetUrl(url);
              const preset = FEED_PRESETS.find((item) => item.url === url);
              if (!preset) return;
              setCustomName(preset.name);
              setCustomUrl(preset.url);
              setError(null);
            }}
            className="h-9 min-w-0 flex-1 rounded-btn border border-line bg-white px-2.5 text-[11px] text-ink-2 outline-none focus:border-indigo-300"
            aria-label="选择常用技术社区 Feed"
          >
            <option value="">选择 RSS / Atom 预设...</option>
            {FEED_PRESET_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.sources.map((preset) => {
                  const added = sources.some((source) => source.feed_url === preset.url);
                  return (
                    <option key={preset.url} value={preset.url} disabled={added}>
                      {preset.name}{added ? "（已添加）" : ""}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[minmax(100px,0.7fr)_minmax(180px,1.3fr)_auto] gap-2">
          <input
            required
            maxLength={60}
            value={customName}
            onChange={(event) => {
              setCustomName(event.target.value);
              setSelectedPresetUrl("");
            }}
            placeholder="来源名称"
            aria-label="自定义来源名称"
            className="h-9 min-w-0 rounded-btn border border-line bg-white px-2.5 text-[11px] outline-none focus:border-indigo-300"
          />
          <input
            required
            type="url"
            value={customUrl}
            onChange={(event) => {
              setCustomUrl(event.target.value);
              setSelectedPresetUrl("");
            }}
            placeholder="https://example.com/feed.xml"
            aria-label="RSS 或 Atom 链接"
            className="h-9 min-w-0 rounded-btn border border-line bg-white px-2.5 text-[11px] outline-none focus:border-indigo-300"
          />
          <button
            type="submit"
            disabled={adding}
            className="flex h-9 items-center gap-1.5 rounded-btn bg-accent px-3 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            {adding ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            添加
          </button>
        </div>
      </form>
      {sources.length === 0 ? (
        <EmptySettingsState icon={Database} label="暂无已添加的数据源" />
      ) : (
        <div className="overflow-hidden rounded-btn border border-line">
          {sources.map((source, index) => (
            <div
              key={source.id}
              className={cn(
                "flex min-h-14 items-center gap-3 px-3",
                index > 0 && "border-t border-line",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
                {source.name}
              </span>
              <label className="flex items-center gap-1.5 text-[11px] text-faint">
                <span>间隔</span>
                <input
                  type="number"
                  aria-label={`${source.name}同步间隔`}
                  value={intervalDrafts[source.id] ?? String(source.interval_minutes)}
                  disabled={pendingSource === source.id}
                  onChange={(event) =>
                    setIntervalDrafts((current) => ({
                      ...current,
                      [source.id]: event.target.value,
                    }))
                  }
                  onBlur={(event) => {
                    const minutes = Math.max(1, Number(event.currentTarget.value) || 1);
                    setIntervalDrafts((current) => ({
                      ...current,
                      [source.id]: String(minutes),
                    }));
                    if (minutes === source.interval_minutes) return;
                    void saveSource(() => updateInterval(source.id, minutes), source.id);
                  }}
                  className="h-8 w-16 rounded-md border border-line px-2 text-[11px] text-ink-2 outline-none focus:border-indigo-300 disabled:bg-panel disabled:opacity-60"
                  min={1}
                />
                <span>分钟</span>
              </label>
              <SourceToggle
                label="订阅"
                checked={source.subscribed}
                disabled={pendingSource === source.id}
                ariaLabel={`${source.subscribed ? "取消订阅" : "订阅"}${source.name}`}
                onClick={() =>
                  void saveSource(
                    () => toggleSubscription(source.id, !source.subscribed),
                    source.id,
                  )
                }
              />
              {source.id.startsWith("custom_") && source.feed_url && (
                <button
                  type="button"
                  title={`删除 ${source.name}`}
                  aria-label={`删除 ${source.name}`}
                  disabled={pendingSource === source.id}
                  onClick={() => void saveSource(() => removeSource(source.id), source.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-faint transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <SourceToggle
                label="同步"
                checked={source.enabled}
                disabled={pendingSource === source.id}
                ariaLabel={`${source.enabled ? "停用" : "启用"}${source.name}`}
                onClick={() =>
                  void saveSource(
                    () => toggleSource(source.id, !source.enabled),
                    source.id,
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SourceToggle({
  label,
  checked,
  disabled,
  ariaLabel,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-faint">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50",
          checked ? "bg-accent" : "bg-gray-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

function FilterSection() {
  const filter = useSettingsStore((state) => state.filter);
  const setFilter = useSettingsStore((state) => state.setFilter);
  const filterMode = useSettingsStore((state) => state.filterMode);
  const setFilterMode = useSettingsStore((state) => state.setFilterMode);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = filterMode === "blacklist" ? filter.blacklist : filter.whitelist;

  const persistFilter = async (nextFilter: typeof filter) => {
    setSaving(true);
    setError(null);
    try {
      await setFilter(nextFilter);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "关键词设置保存失败");
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const keyword = input.trim();
    if (!keyword || list.includes(keyword)) return;
    const updated =
      filterMode === "blacklist"
        ? { ...filter, blacklist: [...filter.blacklist, keyword] }
        : { ...filter, whitelist: [...filter.whitelist, keyword] };
    void persistFilter(updated);
    setInput("");
  };

  const remove = (index: number) => {
    const updated =
      filterMode === "blacklist"
        ? { ...filter, blacklist: filter.blacklist.filter((_, itemIndex) => itemIndex !== index) }
        : { ...filter, whitelist: filter.whitelist.filter((_, itemIndex) => itemIndex !== index) };
    void persistFilter(updated);
  };

  const handleKeywordKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  };

  return (
    <div>
      <div className="mb-3 inline-flex h-8 rounded-btn bg-panel p-0.5">
        {(["blacklist", "whitelist"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={filterMode === mode}
            onClick={() => setFilterMode(mode)}
            className={cn(
              "rounded-md px-3 text-[11px] font-medium transition",
              filterMode === mode ? "bg-white text-ink shadow-card" : "text-muted",
            )}
          >
            {mode === "blacklist" ? "黑名单" : "白名单"}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeywordKeyDown}
          aria-label={filterMode === "blacklist" ? "添加屏蔽词" : "添加仅显示词"}
          placeholder={filterMode === "blacklist" ? "添加屏蔽词..." : "添加仅显示词..."}
          className="h-9 min-w-0 flex-1 rounded-btn border border-line px-3 text-[12px] outline-none focus:border-indigo-300"
        />
        <button
          type="button"
          disabled={saving || !input.trim()}
          onClick={add}
          className="flex h-9 items-center gap-1.5 rounded-btn bg-accent px-3 text-[12px] font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          添加
        </button>
      </div>
      <div className="mt-3 flex min-h-8 flex-wrap gap-1.5">
        {list.length === 0 && <span className="text-[11px] text-faint">暂无关键词</span>}
        {list.map((keyword, index) => (
          <span
            key={keyword}
            className="flex h-7 items-center gap-1 rounded-md bg-panel px-2 text-[11px] text-muted"
          >
            {keyword}
            <button
              type="button"
              title={`移除${keyword}`}
              aria-label={`移除关键词${keyword}`}
              onClick={() => remove(index)}
              className="flex h-5 w-5 items-center justify-center rounded text-faint transition hover:bg-white hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function AiSection() {
  const addNotification = useUiStore((state) => state.addNotification);
  const [draft, setDraft] = useState<AiPreferences>({
    provider: "openai-compatible",
    base_url: "https://api.openai.com/v1",
    model: "",
    require_review: true,
  });
  const [configured, setConfigured] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<
    "loading" | "idle" | "saving" | "saved" | "validating" | "error"
  >("loading");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (!isTauriRuntime()) {
      setLoadFailed(false);
      setStatus("idle");
      return;
    }
    setLoadFailed(false);
    setError(null);
    setStatus("loading");
    api
      .getAiSettings()
      .then((settings) => {
        if (!active) return;
        setDraft({
          provider: canonicalAiProviderId(settings.provider),
          base_url: settings.base_url,
          model: settings.model,
          require_review: settings.require_review,
        });
        setConfigured(settings.configured);
        setLoadFailed(false);
        setStatus("idle");
      })
      .catch((cause) => {
        if (!active) return;
        setLoadFailed(true);
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const updateDraft = <Key extends keyof AiPreferences>(key: Key, value: AiPreferences[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const normalizedDraft = (): AiPreferences => ({
    ...draft,
    provider: draft.provider.trim(),
    base_url: draft.base_url.trim(),
    model: draft.model.trim(),
  });

  const saveSettings = async (announce = true) => {
    if (!isTauriRuntime()) {
      setStatus("error");
      setError("AI 设置仅可在 Signal 桌面应用中保存");
      return false;
    }
    setStatus("saving");
    setError(null);
    setValidationMessage(null);
    try {
      const normalized = normalizedDraft();
      await api.updateAiSettings(normalized);
      setDraft(normalized);
      setStatus("saved");
      if (announce) {
        addNotification({ title: "AI 设置已保存", kind: "success" });
      }
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus("error");
      setError(message);
      if (announce) {
        addNotification({ title: "AI 设置保存失败", description: message, kind: "error" });
      }
      return false;
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saveSettings();
  };

  const saveCredential = async () => {
    if (!apiKey.trim()) {
      setError("请输入 API Key");
      return;
    }
    if (!isTauriRuntime()) {
      setError("API 凭据仅可在 Signal 桌面应用中保存");
      return;
    }
    setCredentialBusy(true);
    setError(null);
    setValidationMessage(null);
    try {
      await api.setAiApiKey(apiKey, canonicalAiProviderId(draft.provider));
      setApiKey("");
      setConfigured(true);
      setConfirmDelete(false);
      addNotification({ title: "AI 凭据已写入系统安全存储", kind: "success" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addNotification({ title: "AI 凭据保存失败", description: message, kind: "error" });
    } finally {
      setCredentialBusy(false);
    }
  };

  const deleteCredential = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setCredentialBusy(true);
    setError(null);
    try {
      await api.deleteAiApiKey(canonicalAiProviderId(draft.provider));
      setConfigured(false);
      setConfirmDelete(false);
      setValidationMessage(null);
      addNotification({ title: "AI 凭据已移除", kind: "info" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      addNotification({ title: "AI 凭据移除失败", description: message, kind: "error" });
    } finally {
      setCredentialBusy(false);
    }
  };

  const validateConnection = async () => {
    if (!isTauriRuntime()) {
      setStatus("error");
      setError("连接测试仅可在 Signal 桌面应用中运行");
      return;
    }
    setStatus("validating");
    setError(null);
    setValidationMessage(null);
    try {
      const normalized = normalizedDraft();
      await api.updateAiSettings(normalized);
      if (apiKey.trim()) {
        await api.setAiApiKey(apiKey, canonicalAiProviderId(normalized.provider));
        setApiKey("");
        setConfigured(true);
      }
      const result = await api.validateAiProvider();
      if (!result.valid) throw new Error(result.message || "AI 服务连接失败");
      setDraft(normalized);
      setConfigured(true);
      setStatus("saved");
      setValidationMessage(result.message || "AI 服务连接成功");
      addNotification({
        title: "AI 服务连接成功",
        description: normalized.model || undefined,
        kind: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setStatus("error");
      setError(message);
      addNotification({ title: "AI 服务连接失败", description: message, kind: "error" });
    }
  };

  const busy = status === "loading" || status === "saving" || status === "validating";
  const providerOption = getAiProviderOption(draft.provider);

  return (
    <form onSubmit={submit} className="space-y-4">
      {status === "loading" ? (
        <div className="flex h-28 items-center justify-center text-faint">
          <LoaderCircle className="h-4 w-4 animate-spin" />
        </div>
      ) : loadFailed ? (
        <div
          role="alert"
          className="flex min-h-36 flex-col items-center justify-center rounded-btn border border-red-100 bg-red-50/60 px-6 text-center"
        >
          <CircleAlert className="h-5 w-5 text-red-500" />
          <p className="mt-2 text-[12px] font-semibold text-red-700">AI 设置读取失败</p>
          <p className="mt-1 max-w-[360px] text-[11px] leading-5 text-red-600">
            {error || "无法确认当前模型配置，已暂停编辑以防覆盖现有设置。"}
          </p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="mt-3 flex h-8 items-center gap-1.5 rounded-btn border border-red-200 bg-white px-3 text-[11px] font-medium text-red-700 transition hover:bg-red-50"
          >
            <RotateCw className="h-3.5 w-3.5" />
            重试读取
          </button>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5 text-[11px] font-medium text-muted">
          <span>Provider</span>
          <select
            value={draft.provider}
            onChange={(event) => {
              const nextProvider = event.target.value;
              const nextOption = getAiProviderOption(nextProvider);
              setDraft((current) => ({
                ...current,
                provider: nextOption.id,
                base_url: nextProviderBaseUrl(
                  current.provider,
                  current.base_url,
                  nextProvider,
                ),
                model: "",
              }));
              setApiKey("");
              setConfigured(!nextOption.requiresApiKey);
              setConfirmDelete(false);
              setValidationMessage(null);
            }}
            className="h-9 w-full rounded-btn border border-line bg-white px-2.5 text-[12px] text-ink-2 outline-none focus:border-indigo-300"
          >
            {AI_PROVIDER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-[11px] font-medium text-muted">
          <span>Model</span>
          <input
            value={draft.model}
            onChange={(event) => updateDraft("model", event.target.value)}
            placeholder={providerOption.modelPlaceholder}
            className="h-9 w-full rounded-btn border border-line px-2.5 text-[12px] text-ink-2 outline-none focus:border-indigo-300"
          />
        </label>
      </div>
      <label className="block space-y-1.5 text-[11px] font-medium text-muted">
        <span>API 地址</span>
        <input
          type="url"
          value={draft.base_url}
          onChange={(event) => updateDraft("base_url", event.target.value)}
          placeholder={providerOption.defaultBaseUrl}
          className="h-9 w-full rounded-btn border border-line px-2.5 text-[12px] text-ink-2 outline-none focus:border-indigo-300"
        />
      </label>
      <p className="-mt-1 text-[10px] leading-4 text-muted">
        {providerOption.description}
      </p>
      <div className="rounded-btn border border-line p-3">
        <div className="flex items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-panel text-muted">
          <KeyRound className="h-3.5 w-3.5" />
        </span>
        <span className="ml-2.5 min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-ink-2">API 凭据</span>
          <span className="block text-[10px] text-faint">
            {providerOption.requiresApiKey ? "系统安全存储" : "本地协议无需密钥"}
          </span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-medium",
            configured ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-muted",
          )}
        >
          {providerOption.requiresApiKey
            ? configured
              ? "已配置"
              : "未配置"
            : "无需密钥"}
        </span>
        </div>
        {providerOption.requiresApiKey ? (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setConfirmDelete(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveCredential();
              }
            }}
            aria-label="AI API Key"
            placeholder={configured ? "输入新密钥以替换" : "输入 API Key"}
            className="h-9 min-w-0 flex-1 rounded-btn border border-line px-2.5 text-[12px] text-ink-2 outline-none focus:border-indigo-300"
          />
          <button
            type="button"
            disabled={credentialBusy || !apiKey.trim()}
            title={configured ? "替换 API Key" : "保存 API Key"}
            onClick={() => void saveCredential()}
            className="flex h-9 items-center gap-1.5 rounded-btn border border-line bg-white px-3 text-[11px] font-medium text-ink-2 transition hover:bg-panel disabled:opacity-50"
          >
            {credentialBusy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {configured ? "替换" : "保存"}
          </button>
          {configured && (
            <button
              type="button"
              disabled={credentialBusy}
              title={confirmDelete ? "再次点击确认移除 API Key" : "移除 API Key"}
              aria-label={confirmDelete ? "确认移除 API Key" : "移除 API Key"}
              onClick={() => void deleteCredential()}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-btn border px-3 text-[11px] font-medium transition disabled:opacity-50",
                confirmDelete
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-line bg-white text-muted hover:bg-panel hover:text-red-600",
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmDelete ? "确认" : "移除"}
            </button>
          )}
        </div>
        ) : (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-[10px] leading-4 text-emerald-700">
            Signal 将直接连接本机 Ollama 服务，不会读取 Keychain 中的云模型凭据。
          </p>
        )}
      </div>
      <SettingRow label="分析提示词" description="三句话总结、核心观点、影响分析、相关技术、延伸阅读">
        <span className="rounded-full bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">
          Signal Insight
        </span>
      </SettingRow>
      <SettingRow label="生成后人工审核" description="接受前保持草稿状态，不自动写入知识库">
        <button
          type="button"
          role="switch"
          aria-checked={draft.require_review}
          aria-label="生成后人工审核"
          title="生成后人工审核"
          onClick={() => updateDraft("require_review", !draft.require_review)}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition",
            draft.require_review ? "bg-accent" : "bg-gray-300",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
              draft.require_review ? "left-[18px]" : "left-0.5",
            )}
          />
        </button>
      </SettingRow>
      <div className="flex min-h-9 items-center justify-end gap-2">
        {status === "saved" && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <Check className="h-3.5 w-3.5" /> 已保存
          </span>
        )}
        {error && (
          <span role="alert" className="mr-auto text-[11px] text-red-600">
            {error}
          </span>
        )}
        <button
          type="submit"
          disabled={busy || !draft.base_url.trim() || !draft.model.trim()}
          className="flex h-9 items-center gap-1.5 rounded-btn bg-gradient-to-r from-accent to-violet px-3.5 text-[12px] font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-60"
        >
          {status === "saving" && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {status === "saving" ? "保存中" : "保存 AI 设置"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || credentialBusy || !draft.base_url.trim() || !draft.model.trim()}
          title="测试 AI 服务连接"
          onClick={() => void validateConnection()}
          className="flex h-9 items-center gap-1.5 rounded-btn border border-line bg-white px-3 text-[11px] font-medium text-ink-2 transition hover:bg-panel disabled:opacity-50"
        >
          {status === "validating" ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {status === "validating" ? "测试中" : "测试连接"}
        </button>
        {validationMessage && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
            <ShieldCheck className="h-3.5 w-3.5" /> {validationMessage}
          </span>
        )}
      </div>
        </>
      )}
    </form>
  );
}

function LoginSection() {
  const login = useSettingsStore((state) => state.login);
  const setLogin = useSettingsStore((state) => state.setLogin);
  const [drafts, setDrafts] = useState({ juejin: "", zhihu: "" });
  const [visibleInputs, setVisibleInputs] = useState({ juejin: false, zhihu: false });
  const [savingSource, setSavingSource] = useState<"juejin" | "zhihu" | null>(null);
  const [status, setStatus] = useState<Record<"juejin" | "zhihu", "idle" | "saved" | "error">>({
    juejin: "idle",
    zhihu: "idle",
  });
  const [errors, setErrors] = useState<Partial<Record<"juejin" | "zhihu", string>>>({});

  const saveCookie = async (source: "juejin" | "zhihu") => {
    const cookie = drafts[source].trim();
    if (!cookie) {
      setStatus((current) => ({ ...current, [source]: "error" }));
      setErrors((current) => ({ ...current, [source]: "请从已登录浏览器手动粘贴完整 Cookie。" }));
      return;
    }
    setSavingSource(source);
    setErrors((current) => ({ ...current, [source]: undefined }));
    try {
      await setLogin({ ...login, [source]: cookie });
      setDrafts((current) => ({ ...current, [source]: "" }));
      setStatus((current) => ({ ...current, [source]: "saved" }));
    } catch (cause) {
      setStatus((current) => ({ ...current, [source]: "error" }));
      setErrors((current) => ({
        ...current,
        [source]: cause instanceof Error ? cause.message : "登录态保存失败",
      }));
    } finally {
      setSavingSource(null);
    }
  };

  const clearCookie = async (source: "juejin" | "zhihu") => {
    setSavingSource(source);
    setErrors((current) => ({ ...current, [source]: undefined }));
    try {
      await setLogin({ ...login, [source]: null });
      setDrafts((current) => ({ ...current, [source]: "" }));
      setStatus((current) => ({ ...current, [source]: "idle" }));
    } catch (cause) {
      setStatus((current) => ({ ...current, [source]: "error" }));
      setErrors((current) => ({
        ...current,
        [source]: cause instanceof Error ? cause.message : "清除登录态失败",
      }));
    } finally {
      setSavingSource(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-btn border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[10px] leading-5 text-blue-800">
        Signal 受浏览器安全隔离限制，无法自动读取其他浏览器的 Cookie。请在登录后的浏览器中手动复制 Cookie 并粘贴；保存内容由系统钥匙串保护，Signal 不会显示完整值。
      </div>
      {(["juejin", "zhihu"] as const).map((source) => (
        <LoginSourceCard
          key={source}
          source={source}
          configured={Boolean(login[source])}
          draft={drafts[source]}
          reveal={visibleInputs[source]}
          busy={savingSource === source}
          status={status[source]}
          error={errors[source]}
          onOpenLogin={() => void api.openArticleUrl(source === "juejin" ? "https://juejin.cn/" : "https://www.zhihu.com/")}
          onDraftChange={(value) => {
            setDrafts((current) => ({ ...current, [source]: value }));
            setStatus((current) => ({ ...current, [source]: "idle" }));
            setErrors((current) => ({ ...current, [source]: undefined }));
          }}
          onToggleReveal={() => setVisibleInputs((current) => ({ ...current, [source]: !current[source] }))}
          onPaste={async () => {
            try {
              const value = await navigator.clipboard.readText();
              if (!value.trim()) throw new Error("剪贴板中没有可粘贴的 Cookie");
              setDrafts((current) => ({ ...current, [source]: value.trim() }));
              setStatus((current) => ({ ...current, [source]: "idle" }));
              setErrors((current) => ({ ...current, [source]: undefined }));
            } catch (cause) {
              setStatus((current) => ({ ...current, [source]: "error" }));
              setErrors((current) => ({
                ...current,
                [source]: cause instanceof Error ? cause.message : "无法读取剪贴板，请直接粘贴到输入框",
              }));
            }
          }}
          onSave={() => void saveCookie(source)}
          onClear={() => void clearCookie(source)}
        />
      ))}
    </div>
  );
}

function LoginSourceCard({
  source,
  configured,
  draft,
  reveal,
  busy,
  status,
  error,
  onOpenLogin,
  onDraftChange,
  onToggleReveal,
  onPaste,
  onSave,
  onClear,
}: {
  source: "juejin" | "zhihu";
  configured: boolean;
  draft: string;
  reveal: boolean;
  busy: boolean;
  status: "idle" | "saved" | "error";
  error?: string;
  onOpenLogin: () => void;
  onDraftChange: (value: string) => void;
  onToggleReveal: () => void;
  onPaste: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const isJuejin = source === "juejin";
  const name = isJuejin ? "掘金" : "知乎";
  const example = isJuejin ? "sessionid=...; uid=..." : "z_c0=...; _zap=...";
  return (
    <section className="rounded-btn border border-line bg-white p-3" aria-label={`${name}登录设置`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", configured ? "bg-emerald-500" : "bg-gray-300")} aria-hidden="true" />
          <p className="text-[12px] font-semibold text-ink-2">{name}</p>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", configured ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-faint")}>
            {configured ? "已保存" : "未配置"}
          </span>
        </div>
        <button type="button" onClick={onOpenLogin} className="flex h-7 items-center gap-1 rounded-btn px-2 text-[10px] font-medium text-accent transition hover:bg-accent-soft" title={`打开${name}登录页`}>
          <ExternalLink className="h-3 w-3" />打开登录页
        </button>
      </div>
      <ol className="mt-2 grid gap-1 text-[10px] leading-4 text-muted">
        <li>1. 在打开的页面完成登录。</li>
        <li>2. 在浏览器开发者工具的请求头中复制完整 <code className="rounded bg-panel px-1 text-[9px] text-ink-2">Cookie</code>。</li>
        <li>3. 主动粘贴到下方后保存。示例格式：<code className="rounded bg-panel px-1 text-[9px] text-ink-2">{example}</code></li>
      </ol>
      <div className="mt-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            type={reveal ? "text" : "password"}
            autoComplete="off"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={configured ? "已保存新的 Cookie 可直接替换" : "手动粘贴 Cookie"}
            aria-label={`${name} Cookie`}
            className="h-9 w-full rounded-btn border border-line bg-white px-2.5 pr-12 text-[11px] text-ink-2 outline-none focus:border-indigo-300"
          />
          <button type="button" onClick={onToggleReveal} className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-md px-2 text-[9px] font-medium text-faint transition hover:bg-panel hover:text-ink" title={reveal ? "隐藏输入内容" : "显示当前输入内容"}>
            {reveal ? "隐藏" : "显示"}
          </button>
        </div>
        <button type="button" disabled={busy} onClick={onPaste} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-line text-faint transition hover:bg-panel hover:text-ink disabled:opacity-50" title="从剪贴板粘贴" aria-label={`从剪贴板粘贴${name} Cookie`}>
          <ClipboardPaste className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={busy || !draft.trim()} onClick={onSave} className="flex h-9 shrink-0 items-center gap-1 rounded-btn bg-accent px-3 text-[10px] font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50">
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}保存
        </button>
        {configured && (
          <button type="button" disabled={busy} onClick={onClear} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-line text-faint transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" title={`清除${name}登录态`} aria-label={`清除${name}登录态`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {status === "saved" && <p className="mt-2 flex items-center gap-1 text-[10px] text-emerald-600"><ShieldCheck className="h-3.5 w-3.5" />已保存到系统钥匙串，完整 Cookie 不会在此显示。</p>}
      {status === "error" && error && <p role="alert" className="mt-2 text-[10px] text-red-600">{error}</p>}
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-ink-2">{label}</p>
        <p className="mt-0.5 text-[10px] text-faint">{description}</p>
      </div>
      {children}
    </div>
  );
}

function EmptySettingsState({
  icon: Icon,
  label,
}: {
  icon: typeof Database;
  label: string;
}) {
  return (
    <div className="flex h-28 flex-col items-center justify-center rounded-btn border border-dashed border-line bg-panel/50 text-faint">
      <Icon className="mb-2 h-4 w-4" />
      <p className="text-[11px]">{label}</p>
    </div>
  );
}
