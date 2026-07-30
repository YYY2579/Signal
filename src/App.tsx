import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { Toaster } from "react-hot-toast";

import { ArticleList } from "./components/article/ArticleList";
import { ReadingView } from "./components/article/ReadingView";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { isTauriRuntime } from "./lib/tauri";
import { useArticlesStore } from "./stores/articlesStore";
import { useSourcesStore } from "./stores/sourcesStore";
import { useSettingsStore } from "./stores/settingsStore";

function App() {
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const loadSources = useSourcesStore((s) => s.loadSources);
  const loadUnread = useSourcesStore((s) => s.loadUnread);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSources();
    loadArticles();
    loadUnread();
    loadSettings();

    if (!isTauriRuntime()) return;

    // 监听后端事件：文章更新 / 正文抓取完成
    const unlistenUpdated = listen("articles-updated", () => {
      loadArticles();
      loadUnread();
    });
    const unlistenContent = listen("content-fetched", () => {
      loadArticles();
    });

    return () => {
      unlistenUpdated.then((f) => f());
      unlistenContent.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-bg">
      <TopBar />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <Sidebar />
        <ArticleList />
        <ReadingView />
      </div>
      <SettingsDialog />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 2400,
          style: {
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            boxShadow: "0 12px 28px rgba(17, 24, 39, 0.1)",
            color: "#111827",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}

export default App;
