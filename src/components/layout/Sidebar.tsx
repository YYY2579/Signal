import { useArticlesStore } from "../../stores/articlesStore";
import { useSourcesStore } from "../../stores/sourcesStore";
import { SOURCE_COLORS } from "../../lib/types";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const sources = useSourcesStore((s) => s.sources);
  const unreadCounts = useSourcesStore((s) => s.unreadCounts);
  const toggleSource = useSourcesStore((s) => s.toggleSource);
  const activeSource = useArticlesStore((s) => s.activeSource);
  const setActiveSource = useArticlesStore((s) => s.setActiveSource);

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          数据源
        </span>
        <button className="text-faint transition hover:text-ink">+</button>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        <SourceItem
          active={activeSource === null}
          onClick={() => setActiveSource(null)}
          color="#2563eb"
          name="全部文章"
          unread={totalUnread}
          showToggle={false}
          enabled={true}
          onToggle={() => {}}
        />
        {sources.map((s) => (
          <SourceItem
            key={s.id}
            active={activeSource === s.id}
            onClick={() => setActiveSource(s.id)}
            color={SOURCE_COLORS[s.id] ?? "#6b7280"}
            name={s.name}
            unread={unreadCounts[s.id] ?? 0}
            showToggle={true}
            enabled={s.enabled}
            onToggle={(v) => toggleSource(s.id, v)}
          />
        ))}
      </div>
    </aside>
  );
}

interface SourceItemProps {
  active: boolean;
  onClick: () => void;
  color: string;
  name: string;
  unread: number;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  showToggle: boolean;
}

function SourceItem({
  active,
  onClick,
  color,
  name,
  unread,
  enabled,
  onToggle,
  showToggle,
}: SourceItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition",
        active ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-line/50",
      )}
    >
      {active && (
        <span className="absolute left-0 top-0 h-full w-0.5 bg-accent" />
      )}
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0)}
      </span>
      <span className="flex-1 truncate">{name}</span>
      {unread > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs",
            active ? "bg-accent text-white" : "bg-line text-muted",
          )}
        >
          {unread}
        </span>
      )}
      {showToggle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!enabled);
          }}
          className={cn(
            "relative h-4 w-7 shrink-0 rounded-full transition",
            enabled ? "bg-accent" : "bg-faint",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
              enabled ? "left-3.5" : "left-0.5",
            )}
          />
        </button>
      )}
    </div>
  );
}
