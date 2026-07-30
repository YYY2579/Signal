import { BarChart3, Network, RefreshCw, Tag, TrendingUp } from "lucide-react";

import { Button } from "../../ui/button";
import type { AnalyticsItem, ArticleAnalytics, TrendPoint } from "./types";

export function ArticleTrend({
  points,
  loading,
  error,
  onRetry,
}: {
  points: TrendPoint[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const chart = createChart(points, 640, 112);

  return (
    <section className="mt-5 rounded-card border border-line bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-bold text-ink">
            <TrendingUp className="h-4 w-4 text-accent" />24 小时热度趋势
          </h3>
          <p className="mt-1 text-[10px] text-faint">
            {points.length > 1 ? `${points.length} 个真实同步快照` : "至少需要两次真实同步"}
          </p>
        </div>
        {points.length > 1 && (
          <span className="rounded-md bg-panel px-2 py-1 text-[9px] font-semibold tabular-nums text-muted">
            {formatValue(points[points.length - 1]?.value ?? 0)}
          </span>
        )}
      </div>

      {loading ? (
        <ChartLoading />
      ) : chart ? (
        <div className="relative h-[132px] overflow-hidden rounded-lg bg-panel/50 px-2 pb-5 pt-1">
          <svg
            viewBox="0 0 640 112"
            preserveAspectRatio="none"
            className="h-[108px] w-full overflow-visible"
            role="img"
            aria-label="文章 24 小时真实热度趋势"
          >
            {[28, 56, 84].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="640"
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 5"
              />
            ))}
            <path d={`${chart.path} L 640 112 L 0 112 Z`} fill="rgba(99,102,241,0.08)" />
            <path
              d={chart.path}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="signal-chart-line"
            />
            {chart.points.map((point, index) => (
              <circle
                key={`${point.timestamp}-${index}`}
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill="#fff"
                stroke="#6366f1"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${formatTimestamp(point.timestamp)} · ${formatValue(point.value)}`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-x-2 bottom-1 flex justify-between text-[9px] tabular-nums text-faint">
            <span>{formatTimestamp(points[0].timestamp)}</span>
            <span>{formatTimestamp(points[points.length - 1]?.timestamp ?? 0)}</span>
          </div>
        </div>
      ) : (
        <AnalyticsEmpty
          title={error ? "趋势加载失败" : "暂无趋势数据"}
          description={error || "完成至少两轮真实同步后即可比较热度变化。"}
          action="重新检查"
          onAction={onRetry}
        />
      )}
    </section>
  );
}

export function ArticleAnalyticsView({
  analytics,
  loading,
  error,
  onRetry,
}: {
  analytics: ArticleAnalytics | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const trend = analytics?.trend ?? [];
  const keywords = analytics?.keywords ?? [];
  const domains = analytics?.domains ?? [];

  return (
    <section className="mt-10 border-t border-line pt-8">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-ink">
            <BarChart3 className="h-5 w-5 text-accent" />Analytics
          </h2>
          <p className="mt-1 text-[11px] text-faint">
            {analytics?.updated_at
              ? `更新于 ${formatTimestamp(analytics.updated_at)}`
              : "只显示本地真实聚合数据"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-accent disabled:opacity-50"
          aria-label="刷新分析数据"
          title="刷新分析数据"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] text-red-700">
          {error}
        </div>
      )}

      <div className="analytics-grid grid gap-3">
        <AnalyticsCard icon={TrendingUp} title="今日热点趋势">
          {loading ? (
            <CardLoading />
          ) : trend.length > 1 ? (
            <CompactTrend points={trend} />
          ) : (
            <CardEmpty label="暂无趋势快照" onRetry={onRetry} />
          )}
        </AnalyticsCard>
        <AnalyticsCard icon={Tag} title="关键词热力图">
          {loading ? (
            <CardLoading />
          ) : keywords.length ? (
            <KeywordBars items={keywords} />
          ) : (
            <CardEmpty label="暂无关键词数据" onRetry={onRetry} />
          )}
        </AnalyticsCard>
        <AnalyticsCard icon={Network} title="技术领域占比">
          {loading ? (
            <CardLoading />
          ) : domains.length ? (
            <DomainShare items={domains} />
          ) : (
            <CardEmpty label="暂无领域数据" onRetry={onRetry} />
          )}
        </AnalyticsCard>
      </div>
    </section>
  );
}

function AnalyticsCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof TrendingUp;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-h-[170px] min-w-0 flex-col rounded-card border border-line bg-white p-3.5 shadow-card">
      <div className="flex items-center gap-2 text-[11px] font-bold text-ink">
        <Icon className="h-3.5 w-3.5 text-accent" />{title}
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </article>
  );
}

function CompactTrend({ points }: { points: TrendPoint[] }) {
  const chart = createChart(points, 220, 82);
  if (!chart) return null;
  const first = points[0].value;
  const last = points[points.length - 1]?.value ?? first;
  const delta = last - first;

  return (
    <div className="flex h-full flex-col">
      <div className={`text-[10px] font-semibold tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
        {delta > 0 ? "+" : ""}{formatValue(delta)}
      </div>
      <svg viewBox="0 0 220 82" preserveAspectRatio="none" className="mt-2 h-[74px] w-full" aria-hidden="true">
        <path d={chart.path} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function KeywordBars({ items }: { items: AnalyticsItem[] }) {
  const visible = items.slice(0, 5);
  const maximum = Math.max(...visible.map((item) => item.value), 1);
  return (
    <div className="space-y-2.5">
      {visible.map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[9px]">
            <span className="truncate font-medium text-ink-2">{item.name}</span>
            <span className="tabular-nums text-faint">{formatValue(item.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(5, (item.value / maximum) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const domainColors = ["#6366f1", "#14b8a6", "#f59e0b", "#ec4899", "#64748b"];

function DomainShare({ items }: { items: AnalyticsItem[] }) {
  const visible = items.slice(0, 5);
  const total = visible.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <CardEmpty label="领域占比为空" />;
  let current = 0;
  const stops = visible.map((item, index) => {
    const start = current;
    current += (item.value / total) * 100;
    return `${domainColors[index]} ${start}% ${current}%`;
  });

  return (
    <div className="flex h-full items-center gap-3">
      <div
        className="relative h-[76px] w-[76px] shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops.join(",")})` }}
        role="img"
        aria-label="技术领域真实占比"
      >
        <div className="absolute inset-[15px] rounded-full bg-white" />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {visible.map((item, index) => (
          <div key={item.name} className="flex items-center gap-1.5 text-[9px]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: domainColors[index] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{item.name}</span>
            <span className="tabular-nums text-ink-2">{Math.round((item.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardEmpty({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full min-h-[112px] flex-col items-center justify-center text-center">
      <p className="text-[10px] text-faint">{label}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-[9px] font-semibold text-accent hover:text-accent-strong">
          重新检查
        </button>
      )}
    </div>
  );
}

function AnalyticsEmpty({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-panel/50 px-4 text-center">
      <p className="text-[11px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-[360px] text-[10px] leading-5 text-muted">{description}</p>
      <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]" onClick={onAction}>
        <RefreshCw className="h-3 w-3" />{action}
      </Button>
    </div>
  );
}

function ChartLoading() {
  return <div className="h-[112px] animate-pulse rounded-lg bg-panel" aria-label="正在加载趋势数据" />;
}

function CardLoading() {
  return (
    <div className="space-y-3 pt-2" aria-label="正在加载分析数据">
      {[90, 72, 84, 58].map((width, index) => (
        <div key={index} className="h-2 animate-pulse rounded bg-gray-100" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function createChart(points: TrendPoint[], width: number, height: number) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const normalized = points.map((point, index) => ({
    ...point,
    x: (index / (points.length - 1)) * width,
    y: height - 8 - ((point.value - minimum) / range) * (height - 16),
  }));
  return {
    path: normalized.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    points: normalized,
  };
}

function formatValue(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function formatTimestamp(timestamp: number) {
  if (!timestamp) return "--";
  const milliseconds = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(milliseconds);
}
