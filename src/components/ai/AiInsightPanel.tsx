import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Edit3,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "../ui/button";
import type { ArticleInsight, RelatedReading } from "../article/reader/types";

export type GenerationState = "idle" | "preparing" | "generating" | "error";

export function AiInsightPanel({
  insight,
  loading,
  loadError,
  generationState,
  generationError,
  reviewBusy,
  reviewError,
  onRetryLoad,
  onConfigure,
  onGenerate,
  onAccept,
  onReject,
}: {
  insight: ArticleInsight | null;
  loading: boolean;
  loadError: string | null;
  generationState: GenerationState;
  generationError: string | null;
  reviewBusy: boolean;
  reviewError: string | null;
  onRetryLoad: () => void;
  onConfigure: () => void;
  onGenerate: () => void;
  onAccept: (insight: ArticleInsight) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(insight);

  useEffect(() => {
    setDraft(insight);
    setEditing(false);
  }, [insight]);

  const status = insight?.status;
  const statusLabel = loading
    ? "读取中"
    : loadError
      ? "读取失败"
      : getStatusLabel(status, generationState);

  return (
    <aside className="min-w-0 self-start rounded-card border border-violet-100 bg-violet-50/70 p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-violet text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-ink">AI Insight</h2>
            {insight?.updated_at && <p className="mt-0.5 text-[9px] text-faint">{formatUpdatedAt(insight.updated_at)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-semibold text-muted">{statusLabel}</span>
          <button
            type="button"
            onClick={onConfigure}
            className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-white hover:text-ink"
            aria-label="配置 AI 服务"
            title="配置 AI 服务"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" aria-label="正在读取 AI Insight">
          {[88, 100, 72, 94, 64].map((width, index) => (
            <div key={index} className="h-2.5 animate-pulse rounded bg-violet-100" style={{ width: `${width}%` }} />
          ))}
        </div>
      ) : loadError ? (
        <ReadErrorState error={loadError} onRetry={onRetryLoad} />
      ) : generationState === "preparing" || generationState === "generating" || status === "generating" ? (
        <GenerationProgress state={generationState} />
      ) : generationState === "error" || status === "failed" || (!insight && generationError) ? (
        <ErrorState error={insight?.error || generationError || "AI Insight 生成失败"} onRetry={onGenerate} onConfigure={onConfigure} />
      ) : status === "rejected" ? (
        <RejectedState onGenerate={onGenerate} />
      ) : draft ? (
        <>
          {editing ? (
            <InsightEditor insight={draft} onChange={setDraft} />
          ) : (
            <InsightContent insight={draft} />
          )}

          {status === "draft" ? (
            <div className="mt-4 border-t border-violet-100 pt-3">
              {reviewError && <p role="alert" className="mb-2 rounded-md bg-red-50 px-2.5 py-2 text-[10px] text-red-700">{reviewError}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white text-[11px]"
                  disabled={reviewBusy}
                  onClick={() => setEditing((value) => !value)}
                >
                  {editing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                  {editing ? "完成编辑" : "编辑草稿"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={reviewBusy}
                  onClick={onReject}
                >
                  <X className="h-3.5 w-3.5" />拒绝
                </Button>
                <Button
                  size="sm"
                  className="ml-auto h-8 text-[11px]"
                  disabled={reviewBusy || !hasUsefulContent(draft)}
                  onClick={() => onAccept(draft)}
                >
                  {reviewBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {reviewBusy ? "保存中..." : "接受结果"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between border-t border-violet-100 pt-3">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />结果已通过人工审核
              </span>
              <button type="button" onClick={onGenerate} className="text-[10px] font-semibold text-accent hover:text-accent-strong">
                重新生成
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyInsight onGenerate={onGenerate} onConfigure={onConfigure} />
      )}
    </aside>
  );
}

function ReadErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/80 px-3.5 py-4">
      <p className="text-[11px] font-semibold text-red-800">Insight 读取失败</p>
      <p role="alert" className="mt-1 break-words text-[10px] leading-5 text-red-700">{error}</p>
      <Button variant="outline" size="sm" className="mt-3 h-8 bg-white text-[10px]" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />重新读取
      </Button>
    </div>
  );
}

function GenerationProgress({ state }: { state: "idle" | "preparing" | "generating" | "error" }) {
  return (
    <div className="rounded-lg border border-violet-100 bg-white/70 p-3.5" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
        <div>
          <p className="text-[11px] font-semibold text-ink">
            {state === "preparing" ? "正在准备真实文章内容" : "正在等待模型返回结构化结果"}
          </p>
          <p className="mt-1 text-[9px] text-muted">生成完成前不会写入知识库</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-accent to-violet" />
      </div>
      <div className="mt-3 space-y-2">
        <ProgressItem label="准备文章上下文" complete={state === "generating"} active={state === "preparing"} />
        <ProgressItem label="请求已配置模型" complete={false} active={state === "generating"} />
        <ProgressItem label="等待人工审核" complete={false} active={false} />
      </div>
    </div>
  );
}

function ProgressItem({ label, complete, active }: { label: string; complete: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[9px]">
      <span className={`h-1.5 w-1.5 rounded-full ${complete ? "bg-emerald-500" : active ? "animate-pulse bg-accent" : "bg-gray-300"}`} />
      <span className={active || complete ? "font-medium text-ink-2" : "text-faint"}>{label}</span>
    </div>
  );
}

function EmptyInsight({ onGenerate, onConfigure }: { onGenerate: () => void; onConfigure: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-violet-200 bg-white/55 px-3.5 py-5 text-center">
      <Sparkles className="mx-auto h-5 w-5 text-violet-400" />
      <p className="mt-2 text-[11px] font-semibold text-ink">尚未生成 AI Insight</p>
      <p className="mt-1 text-[10px] leading-5 text-muted">确认发送文章内容后生成，并在接受前保留为可编辑草稿。</p>
      <div className="mt-3 flex justify-center gap-2">
        <Button variant="outline" size="sm" className="h-8 bg-white text-[10px]" onClick={onConfigure}>配置</Button>
        <Button size="sm" className="h-8 text-[10px]" onClick={onGenerate}><Sparkles className="h-3.5 w-3.5" />生成 Insight</Button>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry, onConfigure }: { error: string; onRetry: () => void; onConfigure: () => void }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/80 px-3.5 py-4">
      <p className="text-[11px] font-semibold text-red-800">生成失败</p>
      <p role="alert" className="mt-1 break-words text-[10px] leading-5 text-red-700">{error}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" className="h-8 bg-white text-[10px]" onClick={onConfigure}><Settings2 className="h-3.5 w-3.5" />检查配置</Button>
        <Button size="sm" className="h-8 text-[10px]" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />重试</Button>
      </div>
    </div>
  );
}

function RejectedState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-white/60 px-3.5 py-5 text-center">
      <X className="mx-auto h-5 w-5 text-faint" />
      <p className="mt-2 text-[11px] font-semibold text-ink">这份结果已拒绝</p>
      <p className="mt-1 text-[10px] leading-5 text-muted">拒绝状态已保存，不会进入知识库或笔记。</p>
      <Button variant="outline" size="sm" className="mt-3 h-8 bg-white text-[10px]" onClick={onGenerate}><RefreshCw className="h-3.5 w-3.5" />重新生成</Button>
    </div>
  );
}

function InsightContent({ insight }: { insight: ArticleInsight }) {
  return (
    <>
      <InsightBlock number="01" title="三句话总结">
        {insight.summary || <MissingValue />}
      </InsightBlock>
      <InsightBlock number="02" title="核心观点">
        {insight.key_points.length ? <BulletList items={insight.key_points} /> : <MissingValue />}
      </InsightBlock>
      <InsightBlock number="03" title="影响分析">
        {insight.impact_analysis || <MissingValue />}
      </InsightBlock>
      <InsightBlock number="04" title="相关技术">
        {insight.technologies.length ? (
          <div className="flex flex-wrap gap-1.5">
            {insight.technologies.map((technology) => (
              <span key={technology} className="rounded-md border border-violet-100 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700">{technology}</span>
            ))}
          </div>
        ) : <MissingValue />}
      </InsightBlock>
      <InsightBlock number="05" title="延伸阅读" last>
        {insight.related_reading.length ? <RelatedList items={insight.related_reading} /> : <MissingValue />}
      </InsightBlock>
    </>
  );
}

function InsightEditor({ insight, onChange }: { insight: ArticleInsight; onChange: (insight: ArticleInsight) => void }) {
  return (
    <div className="space-y-3">
      <EditorField label="三句话总结" value={insight.summary} onChange={(summary) => onChange({ ...insight, summary })} />
      <EditorField label="核心观点（每行一条）" value={insight.key_points.join("\n")} onChange={(value) => onChange({ ...insight, key_points: splitLines(value) })} />
      <EditorField label="影响分析" value={insight.impact_analysis} onChange={(impact_analysis) => onChange({ ...insight, impact_analysis })} />
      <EditorField label="相关技术（每行一项）" value={insight.technologies.join("\n")} onChange={(value) => onChange({ ...insight, technologies: splitLines(value) })} compact />
      <EditorField
        label="延伸阅读（每行一项）"
        value={insight.related_reading.map((item) => item.title).join("\n")}
        onChange={(value) => onChange({ ...insight, related_reading: splitLines(value).map((title) => ({ title })) })}
        compact
      />
    </div>
  );
}

function EditorField({ label, value, onChange, compact = false }: { label: string; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <label className="block text-[10px] font-semibold text-ink">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1.5 w-full resize-y rounded-lg border border-violet-100 bg-white px-2.5 py-2 text-[11px] font-normal leading-5 text-ink outline-none transition focus:border-accent ${compact ? "min-h-[66px]" : "min-h-[92px]"}`}
      />
    </label>
  );
}

function InsightBlock({ number, title, children, last = false }: { number: string; title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <section className={last ? "pt-3" : "border-b border-violet-100 py-3 first:pt-0"}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[9px] font-bold text-violet-400">{number}</span>
        <h3 className="text-[13px] font-bold text-ink">{title}</h3>
      </div>
      <div className="whitespace-pre-wrap text-[12px] leading-[1.7] text-muted">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return <ul className="space-y-1.5">{items.map((item) => <li key={item} className="flex gap-2"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-violet-400" /><span>{item}</span></li>)}</ul>;
}

function RelatedList({ items }: { items: RelatedReading[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={`${item.title}-${item.url ?? ""}`}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:text-accent-strong hover:underline">{item.title}</a>
          ) : item.title}
        </li>
      ))}
    </ul>
  );
}

function MissingValue() {
  return <span className="text-faint">模型未返回这一项</span>;
}

function splitLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function hasUsefulContent(insight: ArticleInsight) {
  return Boolean(insight.summary.trim() || insight.key_points.length || insight.impact_analysis.trim());
}

function formatUpdatedAt(timestamp: number) {
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(milliseconds);
}

function getStatusLabel(
  status: ArticleInsight["status"] | undefined,
  generationState: GenerationState,
) {
  if (generationState === "preparing" || generationState === "generating") return "生成中";
  if (status === "accepted") return "已接受";
  if (status === "rejected") return "已拒绝";
  if (status === "failed") return "生成失败";
  if (status === "generating") return "生成中";
  if (status === "draft") return "待审核";
  return "未生成";
}
