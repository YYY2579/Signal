import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SourceConfig } from "../../../lib/types";
import { cn } from "../../../lib/utils";
import {
  countActiveFilters,
  DEFAULT_FEED_FILTERS,
  type FeedFilters,
  type ReadFilter,
} from "./feedModel";

interface FeedFilterPopoverProps {
  filters: FeedFilters;
  sources: SourceConfig[];
  selectedSourceId: string | null;
  onSourceChange: (sourceId: string | null) => void;
  onChange: (filters: FeedFilters) => void;
}

const READ_OPTIONS: Array<{ value: ReadFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "read", label: "已读" },
];

export function FeedFilterPopover({
  filters,
  sources,
  selectedSourceId,
  onSourceChange,
  onChange,
}: FeedFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeCount = countActiveFilters(filters);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", containFocus);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", containFocus);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const firstControl = dialogRef.current.querySelector<HTMLElement>(
      'button:not([disabled]), select:not([disabled])',
    );
    firstControl?.focus();
  }, [open]);

  const toggle = (key: "bookmarked" | "readLater" | "knowledge") => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-2 font-medium transition",
          open || activeCount > 0
            ? "bg-accent-soft text-accent"
            : "text-faint hover:bg-panel hover:text-ink",
        )}
        aria-label={activeCount > 0 ? `筛选，已启用 ${activeCount} 项` : "筛选情报"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="feed-filter-dialog"
      >
        <SlidersHorizontal className="h-3 w-3" />
        筛选
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dialogRef}
          id="feed-filter-dialog"
          role="dialog"
          aria-label="情报筛选"
          tabIndex={-1}
          className="absolute right-0 top-9 z-40 w-[276px] rounded-[10px] border border-line bg-white p-3 text-ink shadow-card-hover"
        >
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[12px] font-bold">筛选情报</p>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FEED_FILTERS)}
              disabled={activeCount === 0}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-faint transition hover:bg-panel hover:text-ink disabled:cursor-default disabled:opacity-40"
              aria-label="清除全部筛选"
            >
              <RotateCcw className="h-3 w-3" />
              重置
            </button>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[10px] font-semibold text-faint">阅读状态</legend>
            <div className="grid grid-cols-3 gap-1 rounded-btn bg-panel p-1">
              {READ_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ ...filters, read: option.value })}
                  className={cn(
                    "h-7 rounded-[6px] text-[11px] font-semibold transition",
                    filters.read === option.value
                      ? "bg-white text-accent shadow-sm"
                      : "text-muted hover:text-ink",
                  )}
                  aria-pressed={filters.read === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-3 block text-[10px] font-semibold text-faint" htmlFor="feed-source-filter">
            数据源
          </label>
          <select
            id="feed-source-filter"
            value={selectedSourceId ?? ""}
            onChange={(event) => onSourceChange(event.target.value || null)}
            className="mt-1.5 h-8 w-full rounded-btn border border-line bg-white px-2 text-[11px] text-ink outline-none transition focus:border-indigo-300"
          >
            <option value="">全部来源</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}{source.enabled ? "" : "（已停用）"}
              </option>
            ))}
          </select>

          <div className="mt-3 space-y-0.5 border-t border-line pt-2">
            <FilterToggle
              label="仅显示已收藏"
              active={filters.bookmarked}
              onClick={() => toggle("bookmarked")}
            />
            <FilterToggle
              label="仅显示稍后阅读"
              active={filters.readLater}
              onClick={() => toggle("readLater")}
            />
            <FilterToggle
              label="仅显示知识库内容"
              active={filters.knowledge}
              onClick={() => toggle("knowledge")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[11px] font-medium text-ink-2 transition hover:bg-panel"
      aria-pressed={active}
    >
      {label}
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border transition",
          active ? "border-accent bg-accent text-white" : "border-gray-300 bg-white text-transparent",
        )}
        aria-hidden="true"
      >
        <Check className="h-3 w-3" strokeWidth={2.5} />
      </span>
    </button>
  );
}
