import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const openDialogStack: symbol[] = [];

function removeDialog(token: symbol) {
  const index = openDialogStack.lastIndexOf(token);
  if (index >= 0) openDialogStack.splice(index, 1);
}

export function ReaderDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = "max-w-[480px]",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const dialogTokenRef = useRef(Symbol("reader-dialog"));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialogToken = dialogTokenRef.current;
    removeDialog(dialogToken);
    openDialogStack.push(dialogToken);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const focusFrame = window.requestAnimationFrame(() => {
      const preferred = dialog?.querySelector<HTMLElement>("[data-autofocus]");
      (preferred ?? dialog?.querySelector<HTMLElement>(focusableSelector) ?? dialog)?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogStack[openDialogStack.length - 1] !== dialogToken) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;
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
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      removeDialog(dialogToken);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/25 px-6 py-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <motion.section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            className={`max-h-full w-full overflow-hidden rounded-card border border-line bg-white shadow-card-hover ${width}`}
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.99 }}
            transition={{ duration: 0.16 }}
          >
            <header className="flex items-start justify-between border-b border-line px-5 py-4">
              <div className="min-w-0 pr-4">
                <h2 id={titleId} className="text-[15px] font-bold text-ink">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-muted">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint transition hover:bg-panel hover:text-ink"
                aria-label="关闭"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="max-h-[min(620px,calc(100vh-190px))] overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-line bg-panel/60 px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
