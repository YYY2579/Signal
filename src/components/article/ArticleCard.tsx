import { BookOpen, Flame, MessageSquare } from "lucide-react";

import { SOURCE_COLORS } from "../../lib/types";
import type { Article } from "../../lib/types";
import { useArticlesStore } from "../../stores/articlesStore";
import { cn, formatRelativeTime } from "../../lib/utils";

export function ArticleCard({ article }: { article: Article }) {
  const readingArticleId = useArticlesStore((s) => s.readingArticleId);
  const openArticle = useArticlesStore((s) => s.openArticle);
  const active = readingArticleId === article.id;

  return (
    <div
      onClick={() => openArticle(article.id)}
      className={cn(
        "relative cursor-pointer border-b border-line p-4 transition",
        active ? "bg-accent-soft" : "hover:bg-panel",
        article.is_read && "opacity-55",
      )}
    >
      {active && (
        <span className="absolute left-0 top-0 h-full w-0.5 bg-accent" />
      )}
      <h3
        className={cn(
          "mb-1.5 line-clamp-2 text-sm",
          article.is_read ? "font-normal text-muted" : "font-semibold text-ink",
        )}
      >
        {article.title}
      </h3>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase text-white"
          style={{ backgroundColor: SOURCE_COLORS[article.source] ?? "#6b7280" }}
        >
          {article.source}
        </span>
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
        <span>{formatRelativeTime(article.published_at)}</span>
        {article.has_content && (
          <BookOpen className="ml-auto h-3 w-3 text-accent" />
        )}
      </div>
      {article.summary && (
        <p className="line-clamp-2 text-xs text-faint">{article.summary}</p>
      )}
    </div>
  );
}
