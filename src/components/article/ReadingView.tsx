import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Flame, MessageSquare, User } from "lucide-react";

import { api } from "../../lib/tauri";
import { sanitizeHtml } from "../../lib/sanitize";
import { SOURCE_COLORS } from "../../lib/types";
import { useArticlesStore } from "../../stores/articlesStore";
import { formatRelativeTime } from "../../lib/utils";

export function ReadingView() {
  const articles = useArticlesStore((s) => s.articles);
  const readingArticleId = useArticlesStore((s) => s.readingArticleId);
  const closeReader = useArticlesStore((s) => s.closeReader);
  const loadArticles = useArticlesStore((s) => s.loadArticles);

  const article = articles.find((a) => a.id === readingArticleId);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!article) return;
    setContent(null);
    setLoading(true);
    api
      .getArticleContent(article.id)
      .then((c) => {
        setContent(c);
        loadArticles();
      })
      .catch((e) => console.error("getArticleContent failed", e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  if (!article) return null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-bg">
      {/* 顶栏 */}
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <button
          onClick={closeReader}
          className="flex items-center gap-1 text-sm text-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase text-white"
          style={{ backgroundColor: SOURCE_COLORS[article.source] ?? "#6b7280" }}
        >
          {article.source}
        </span>
      </div>

      {/* 正文 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-6 py-8">
          <h1 className="mb-3 text-2xl font-bold leading-tight text-ink">
            {article.title}
          </h1>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted">
            {article.author && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {article.author}
              </span>
            )}
            <span>{formatRelativeTime(article.published_at)}</span>
            <span className="flex items-center gap-0.5">
              <Flame className="h-3 w-3" />
              {article.hot_label}
            </span>
            {article.comments_count != null && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {article.comments_count}
              </span>
            )}
          </div>
          <div className="mb-6 border-t border-line" />

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-4 animate-pulse rounded bg-line"
                  style={{ width: `${80 - i * 5}%` }}
                />
              ))}
            </div>
          ) : content ? (
            <div
              className="max-w-none text-[15px] leading-[1.7] text-ink-2 [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-panel [&_code]:px-1 [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_img]:rounded [&_img]:max-w-full [&_p]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:bg-panel [&_pre]:p-3"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
            />
          ) : (
            <div className="rounded-card border border-line bg-panel p-6 text-center">
              <p className="mb-3 text-sm text-muted">
                该文章无缓存正文（外链内容）
              </p>
              <button
                onClick={() => api.openArticleUrl(article.url)}
                className="inline-flex items-center gap-1.5 rounded-btn bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90"
              >
                <ExternalLink className="h-4 w-4" /> 在浏览器中打开原文
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 底部固定栏 */}
      <div className="flex justify-end border-t border-line px-4 py-2">
        <button
          onClick={() => api.openArticleUrl(article.url)}
          className="flex items-center gap-1.5 rounded-btn bg-accent px-4 py-1.5 text-sm text-white transition hover:bg-accent/90"
        >
          <ExternalLink className="h-4 w-4" /> 在浏览器中打开原文
        </button>
      </div>
    </div>
  );
}
