import { useState } from "react";
import { X } from "lucide-react";

import { useSettingsStore } from "../../stores/settingsStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import { cn } from "../../lib/utils";

export function SettingsDialog() {
  const open = useSettingsStore((s) => s.settingsOpen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={closeSettings}
    >
      <div
        className="max-h-[80vh] w-[560px] overflow-y-auto rounded-card bg-bg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">设置</h2>
          <button
            onClick={closeSettings}
            className="text-faint transition hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <SourcesSection />
          <FilterSection />
          <LoginSection />
        </div>
      </div>
    </div>
  );
}

function SourcesSection() {
  const sources = useSourcesStore((s) => s.sources);
  const toggleSource = useSourcesStore((s) => s.toggleSource);
  const updateInterval = useSourcesStore((s) => s.updateInterval);

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">数据源</h3>
      <div className="space-y-2">
        {sources.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 rounded-btn border border-line p-2.5"
          >
            <span className="flex-1 text-sm text-ink-2">{s.name}</span>
            <input
              type="number"
              value={s.interval_minutes}
              onChange={(e) => updateInterval(s.id, Number(e.target.value))}
              className="w-16 rounded border border-line px-2 py-1 text-xs"
              min={1}
            />
            <span className="text-xs text-faint">分钟</span>
            <button
              onClick={() => toggleSource(s.id, !s.enabled)}
              className={cn(
                "relative h-4 w-7 rounded-full transition",
                s.enabled ? "bg-accent" : "bg-faint",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
                  s.enabled ? "left-3.5" : "left-0.5",
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterSection() {
  const filter = useSettingsStore((s) => s.filter);
  const setFilter = useSettingsStore((s) => s.setFilter);
  const filterMode = useSettingsStore((s) => s.filterMode);
  const setFilterMode = useSettingsStore((s) => s.setFilterMode);
  const [input, setInput] = useState("");

  const list = filterMode === "blacklist" ? filter.blacklist : filter.whitelist;

  const add = () => {
    if (!input.trim()) return;
    const updated = { ...filter };
    if (filterMode === "blacklist") {
      updated.blacklist = [...filter.blacklist, input.trim()];
    } else {
      updated.whitelist = [...filter.whitelist, input.trim()];
    }
    setFilter(updated);
    setInput("");
  };

  const remove = (idx: number) => {
    const updated = { ...filter };
    if (filterMode === "blacklist") {
      updated.blacklist = filter.blacklist.filter((_, i) => i !== idx);
    } else {
      updated.whitelist = filter.whitelist.filter((_, i) => i !== idx);
    }
    setFilter(updated);
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-ink">关键词过滤</h3>
      <div className="mb-2 flex gap-1">
        <button
          onClick={() => setFilterMode("blacklist")}
          className={cn(
            "rounded-btn px-3 py-1 text-xs transition",
            filterMode === "blacklist"
              ? "bg-accent text-white"
              : "bg-panel text-muted hover:text-ink",
          )}
        >
          黑名单
        </button>
        <button
          onClick={() => setFilterMode("whitelist")}
          className={cn(
            "rounded-btn px-3 py-1 text-xs transition",
            filterMode === "whitelist"
              ? "bg-accent text-white"
              : "bg-panel text-muted hover:text-ink",
          )}
        >
          白名单
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={
            filterMode === "blacklist" ? "添加屏蔽词..." : "添加仅显示词..."
          }
          className="flex-1 rounded-btn border border-line px-2 py-1 text-xs outline-none focus:border-accent"
        />
        <button
          onClick={add}
          className="rounded-btn bg-accent px-3 py-1 text-xs text-white transition hover:bg-accent/90"
        >
          添加
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {list.map((kw, i) => (
          <span
            key={i}
            className="flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-xs text-muted"
          >
            {kw}
            <button
              onClick={() => remove(i)}
              className="text-faint transition hover:text-ink"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </section>
  );
}

function LoginSection() {
  const login = useSettingsStore((s) => s.login);
  const setLogin = useSettingsStore((s) => s.setLogin);

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-ink">登录态（Cookie）</h3>
      <p className="mb-2 text-xs text-faint">
        从浏览器 DevTools 复制 Cookie 粘贴，明文存储，注意保密。
      </p>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-muted">掘金</label>
          <input
            value={login.juejin ?? ""}
            onChange={(e) =>
              setLogin({ ...login, juejin: e.target.value || null })
            }
            placeholder="juejin cookie..."
            className="w-full rounded-btn border border-line px-2 py-1 text-xs outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-xs text-muted">知乎</label>
          <input
            value={login.zhihu ?? ""}
            onChange={(e) =>
              setLogin({ ...login, zhihu: e.target.value || null })
            }
            placeholder="zhihu cookie..."
            className="w-full rounded-btn border border-line px-2 py-1 text-xs outline-none focus:border-accent"
          />
        </div>
      </div>
    </section>
  );
}
