import {
  Bookmark,
  Check,
  Circle,
  Clock3,
  FileText,
  Flame,
  LoaderCircle,
  MessageSquare,
} from "lucide-react";
import { motion } from "framer-motion";

import { SOURCE_NAMES } from "../../lib/types";
import type { Article } from "../../lib/types";
import { cn, formatRelativeTime } from "../../lib/utils";
import { useArticlesStore } from "../../stores/articlesStore";

export function ArticleCard({ article, index }: { article: Article; index: number }) {
  const readingArticleId = useArticlesStore((s) => s.readingArticleId);
  const openArticle = useArticlesStore((s) => s.openArticle);
  const setArticleFlag = useArticlesStore((s) => s.setArticleFlag);
  const pendingFlags = useArticlesStore((s) => s.pendingFlags);
  const active = readingArticleId === article.id;
  const summary = article.ai_summary?.trim() || article.summary?.trim();
  const summaryLabel = article.ai_summary?.trim() ? "AI 摘要" : "来源摘要";
  const aiStatus = {
    draft: { label: "摘要待审核", className: "bg-amber-50 text-amber-700" },
    accepted: { label: "摘要已完成", className: "bg-emerald-50 text-emerald-700" },
    failed: { label: "生成失败", className: "bg-red-50 text-red-600" },
    rejected: { label: "草稿已拒绝", className: "bg-gray-100 text-muted" },
  }[article.ai_status ?? ""];

  const isPending = (flag: string) => Boolean(pendingFlags[`${article.id}:${flag}`]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.045, 0.2), duration: 0.28 }}
      whileHover={{ y: -2 }}
      onClick={() => openArticle(article.id)}
      className={cn(
        "relative h-40 w-full cursor-pointer overflow-hidden rounded-card border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover",
        active ? "border-indigo-300 ring-1 ring-indigo-100" : "border-line",
        article.is_read && !active && "bg-gray-50/50",
      )}
    >
      {active && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-accent" />}
      <div className="flex h-full gap-4">
        <div className="min-w-0 flex-1">
          <h3>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openArticle(article.id);
              }}
              className="line-clamp-2 w-full pr-2 text-left text-[15px] font-bold leading-[1.35] text-ink"
              aria-label={`阅读：${article.title}`}
            >
              {article.title}
            </button>
          </h3>

          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
            <span className="font-semibold text-ink-2">{SOURCE_NAMES[article.source] ?? article.source}</span>
            <span className="h-0.5 w-0.5 rounded-full bg-gray-300" />
            <span>{formatRelativeTime(article.published_at)}</span>
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{article.comments_count ?? "--"}</span>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600">
              <FileText className="h-2.5 w-2.5" />
              {article.has_content ? "正文已缓存" : "外部链接"}
            </span>
            {aiStatus && (
              <span className={cn("rounded-md px-2 py-0.5 text-[9px] font-semibold", aiStatus.className)}>
                {aiStatus.label}
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-2 text-[11px] leading-[1.55] text-muted">
            <span className={cn("mr-1 font-semibold", summaryLabel === "AI 摘要" ? "text-accent" : "text-faint")}>
              {summaryLabel}
            </span>
            {summary || "暂无摘要"}
          </p>
        </div>

        <div className="flex w-[74px] shrink-0 flex-col items-end">
          <div className="flex gap-1">
            <CardAction
              active={article.is_bookmarked}
              pending={isPending("is_bookmarked")}
              label={article.is_bookmarked ? "取消收藏" : "收藏"}
              onClick={() => void setArticleFlag(article.id, "is_bookmarked", !article.is_bookmarked)}
            >
              <Bookmark className="h-3.5 w-3.5" fill={article.is_bookmarked ? "currentColor" : "none"} />
            </CardAction>
            <CardAction
              active={article.is_read_later}
              pending={isPending("is_read_later")}
              label={article.is_read_later ? "移出稍后阅读" : "稍后阅读"}
              onClick={() => void setArticleFlag(article.id, "is_read_later", !article.is_read_later)}
            >
              <Clock3 className="h-3.5 w-3.5" />
            </CardAction>
          </div>
          <span className="mt-3 flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-600">
            <Flame className="h-3 w-3" fill="currentColor" />{article.hot_label || Math.round(article.hot_score)}
          </span>
          <span
            className={cn(
              "mt-1.5 rounded-full px-2 py-1 text-[10px] font-bold",
              typeof article.ai_score === "number"
                ? "bg-indigo-50 text-accent"
                : "bg-gray-50 text-faint",
            )}
            title={typeof article.ai_score === "number" ? "真实 AI 评分" : "尚未生成 AI 评分"}
          >
            AI {typeof article.ai_score === "number" ? article.ai_score.toFixed(1) : "--"}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void setArticleFlag(article.id, "is_read", !article.is_read);
            }}
            disabled={isPending("is_read")}
            className={cn(
              "mt-auto flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-medium transition disabled:opacity-50",
              article.is_read
                ? "text-emerald-600 hover:bg-emerald-50"
                : "text-faint hover:bg-panel hover:text-ink",
            )}
            title={article.is_read ? "标记为未读" : "标记为已读"}
            aria-label={article.is_read ? "标记为未读" : "标记为已读"}
            aria-pressed={article.is_read}
          >
            {isPending("is_read") ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : article.is_read ? (
              <Check className="h-3 w-3" />
            ) : (
              <Circle className="h-3 w-3" />
            )}
            {article.is_read ? "已读" : "未读"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function CardAction({
  children,
  active,
  pending,
  label,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  pending?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={pending}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition",
        active ? "bg-accent-soft text-accent" : "text-faint hover:bg-panel hover:text-ink",
        pending && "cursor-wait opacity-50",
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
      aria-busy={pending || undefined}
    >
      {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}
