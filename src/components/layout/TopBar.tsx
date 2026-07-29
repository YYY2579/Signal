import { CheckCheck, RefreshCw, Search, Settings } from "lucide-react";

import { api } from "../../lib/tauri";
import { useArticlesStore } from "../../stores/articlesStore";
import { useSettingsStore } from "../../stores/settingsStore";

export function TopBar() {
  const searchQuery = useArticlesStore((s) => s.searchQuery);
  const setSearchQuery = useArticlesStore((s) => s.setSearchQuery);
  const refresh = useArticlesStore((s) => s.refresh);
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const activeSource = useArticlesStore((s) => s.activeSource);
  const openSettings = useSettingsStore((s) => s.openSettings);

  const handleRefresh = async () => {
    await refresh();
    loadArticles();
  };

  const handleMarkAllRead = async () => {
    await api.markAllRead(activeSource ?? undefined);
    loadArticles();
  };

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-bg px-4">
      <span className="text-base font-bold text-ink">Signal</span>
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索文章..."
          className="w-full rounded-btn border border-line bg-panel py-1.5 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-accent"
        />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm text-muted transition hover:bg-panel hover:text-ink"
        >
          <RefreshCw className="h-4 w-4" /> 刷新
        </button>
        <button
          onClick={handleMarkAllRead}
          className="flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm text-muted transition hover:bg-panel hover:text-ink"
        >
          <CheckCheck className="h-4 w-4" /> 全部已读
        </button>
        <button
          onClick={openSettings}
          className="flex items-center gap-1.5 rounded-btn px-2.5 py-1.5 text-sm text-muted transition hover:bg-panel hover:text-ink"
        >
          <Settings className="h-4 w-4" /> 设置
        </button>
      </div>
    </header>
  );
}
