import { useEffect, useRef } from "react";
import { Bookmark, Clock3, Copy, ExternalLink } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export function ReaderMoreMenu({
  open,
  bookmarked,
  readLater,
  busy,
  onClose,
  onBookmark,
  onReadLater,
  onCopyLink,
  onOpenOriginal,
}: {
  open: boolean;
  bookmarked: boolean;
  readLater: boolean;
  busy: boolean;
  onClose: () => void;
  onBookmark: () => void;
  onReadLater: () => void;
  onCopyLink: () => void;
  onOpenOriginal: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-reader-more-trigger]")) return;
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label="文章更多操作"
          className="absolute right-0 top-8 z-30 w-44 overflow-hidden rounded-lg border border-line bg-white p-1.5 shadow-card-hover"
          initial={{ opacity: 0, y: -3, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -2, scale: 0.98 }}
          transition={{ duration: 0.13 }}
        >
          <MenuItem
            icon={Bookmark}
            label={bookmarked ? "取消收藏" : "收藏文章"}
            active={bookmarked}
            disabled={busy}
            onClick={onBookmark}
          />
          <MenuItem
            icon={Clock3}
            label={readLater ? "移出稍后阅读" : "加入稍后阅读"}
            active={readLater}
            disabled={busy}
            onClick={onReadLater}
          />
          <div className="my-1 border-t border-line" />
          <MenuItem icon={Copy} label="复制文章链接" onClick={onCopyLink} />
          <MenuItem icon={ExternalLink} label="打开原文" onClick={onOpenOriginal} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuItem({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: typeof Bookmark;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[11px] font-medium transition disabled:opacity-50 ${active ? "bg-accent-soft text-accent-strong" : "text-ink-2 hover:bg-panel"}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}
