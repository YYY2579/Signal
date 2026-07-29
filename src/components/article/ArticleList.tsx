import { useArticlesStore } from "../../stores/articlesStore";

import { ArticleCard } from "./ArticleCard";

export function ArticleList() {
  const articles = useArticlesStore((s) => s.articles);
  const loading = useArticlesStore((s) => s.loading);
  const activeSource = useArticlesStore((s) => s.activeSource);

  const title = activeSource ?? "全部文章";

  return (
    <div className="w-[420px] shrink-0 overflow-y-auto border-r border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {articles.length > 0 && (
          <span className="text-xs text-faint">{articles.length} 篇</span>
        )}
      </div>

      {loading && articles.length === 0 ? (
        <SkeletonList />
      ) : articles.length === 0 ? (
        <EmptyState />
      ) : (
        articles.map((a) => <ArticleCard key={a.id} article={a} />)
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border-b border-line p-4">
          <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-line" />
          <div className="mb-2 h-3 w-1/2 animate-pulse rounded bg-line" />
          <div className="h-3 w-full animate-pulse rounded bg-line" />
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-3 text-4xl">📭</div>
      <p className="text-sm font-medium text-ink">暂无文章</p>
      <p className="mt-1 text-xs text-muted">点击刷新按钮获取最新内容</p>
    </div>
  );
}
