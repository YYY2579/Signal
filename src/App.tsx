import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { ArticleList } from "./components/article/ArticleList";
import { ReadingView } from "./components/article/ReadingView";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { useArticlesStore } from "./stores/articlesStore";
import { useSourcesStore } from "./stores/sourcesStore";

function App() {
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const loadSources = useSourcesStore((s) => s.loadSources);
  const loadUnread = useSourcesStore((s) => s.loadUnread);
  const readingArticleId = useArticlesStore((s) => s.readingArticleId);

  useEffect(() => {
    loadSources();
    loadArticles();
    loadUnread();

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
    <div className="flex h-full w-full flex-col bg-bg">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ArticleList />
        {readingArticleId && <ReadingView />}
      </div>
      <SettingsDialog />
    </div>
  );
}

export default App;
