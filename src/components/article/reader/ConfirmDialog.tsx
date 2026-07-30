import { AlertTriangle } from "lucide-react";

import { Button } from "../../ui/button";
import { ReaderDialog } from "./ReaderDialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  danger = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ReaderDialog
      open={open}
      title={title}
      description={description}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={onConfirm}
            className={danger ? "bg-none bg-red-600 hover:bg-red-700" : undefined}
          >
            {busy ? "处理中..." : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-3 text-[11px] leading-5 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        此操作会立即写入本地 Signal 数据库。
      </div>
    </ReaderDialog>
  );
}
