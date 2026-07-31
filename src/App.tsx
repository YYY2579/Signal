import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Toaster } from "react-hot-toast";

import { ArticleList } from "./components/article/ArticleList";
import { ReadingView } from "./components/article/ReadingView";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { isTauriRuntime } from "./lib/tauri";
import { translate } from "./lib/i18n";
import { useArticlesStore } from "./stores/articlesStore";
import { useSourcesStore } from "./stores/sourcesStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";

const FEED_MIN_WIDTH = 420;
const FEED_MAX_WIDTH = 760;

function FeedReaderDivider() {
  const setFeedWidth = useUiStore((state) => state.setFeedWidth);
  const feedWidth = useUiStore((state) => state.feedWidth);
  const locale = useUiStore((state) => state.locale);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const resize = (clientX: number) => {
    const state = dragState.current;
    if (!state) return;
    setFeedWidth(Math.min(FEED_MAX_WIDTH, Math.max(FEED_MIN_WIDTH, state.startWidth + clientX - state.startX)));
  };

  return (
    <div
      className="signal-divider group relative z-20 flex w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center"
      role="separator"
      aria-label={translate(locale, "layout.resize")}
      aria-orientation="vertical"
      aria-valuemin={FEED_MIN_WIDTH}
      aria-valuemax={FEED_MAX_WIDTH}
      aria-valuenow={feedWidth}
      tabIndex={0}
      onPointerDown={(event) => {
        dragState.current = { startX: event.clientX, startWidth: useUiStore.getState().feedWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => resize(event.clientX)}
      onPointerUp={() => {
        dragState.current = null;
      }}
      onPointerCancel={() => {
        dragState.current = null;
      }}
      onDoubleClick={() => setFeedWidth(560)}
      onKeyDown={(event) => {
        const width = useUiStore.getState().feedWidth;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setFeedWidth(width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setFeedWidth(width + 16);
        } else if (event.key === "Home") {
          event.preventDefault();
          setFeedWidth(FEED_MIN_WIDTH);
        } else if (event.key === "End") {
          event.preventDefault();
          setFeedWidth(FEED_MAX_WIDTH);
        }
      }}
    >
      <span className="my-auto h-12 w-px rounded-full bg-transparent transition group-hover:bg-accent/50 group-focus-visible:bg-accent" />
    </div>
  );
}

function App() {
  const loadArticles = useArticlesStore((s) => s.loadArticles);
  const loadSources = useSourcesStore((s) => s.loadSources);
  const loadUnread = useSourcesStore((s) => s.loadUnread);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useUiStore((s) => s.theme);
  const locale = useUiStore((s) => s.locale);
  const feedWidth = useUiStore((s) => s.feedWidth);

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

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.classList.toggle("signal-theme-dark", theme === "dark");
    document.body.classList.toggle("signal-theme-dark", theme === "dark");
  }, [locale, theme]);

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col bg-bg"
      style={{ "--signal-feed-width": `${feedWidth}px` } as React.CSSProperties}
    >
      <TopBar />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="feed-pane flex min-w-0 shrink-0">
          <ArticleList />
        </div>
        <FeedReaderDivider />
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
