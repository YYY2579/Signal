import { FileText, LockKeyhole, Send } from "lucide-react";

import { Button } from "../ui/button";
import { ReaderDialog } from "../article/reader/ReaderDialog";

export function AiSendConfirmDialog({
  open,
  articleTitle,
  sourceName,
  hasSummary,
  hasContent,
  onClose,
  onConfirm,
}: {
  open: boolean;
  articleTitle: string;
  sourceName: string;
  hasSummary: boolean;
  hasContent: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ReaderDialog
      open={open}
      title="确认发送给 AI"
      description="只有在你确认后，Signal 才会把下列文章内容发送到已配置的模型服务。"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={onConfirm}>
            <Send className="h-3.5 w-3.5" />确认并生成
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-line bg-panel/60 p-3.5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-accent">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="line-clamp-2 text-[12px] font-semibold leading-5 text-ink">{articleTitle}</p>
            <p className="mt-1 text-[10px] text-muted">{sourceName}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[10px]">
          <DataItem label="文章标题" available />
          <DataItem label="来源与作者" available />
          <DataItem label="来源摘要" available={hasSummary} />
          <DataItem label="已缓存正文" available={hasContent} />
        </div>
      </div>
      <div className="mt-3 flex gap-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-[10px] leading-5 text-indigo-950">
        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        请求会直接发送到你配置的服务地址；Signal 不会发送 API Key，也不会在接受前自动沉淀结果。
      </div>
    </ReaderDialog>
  );
}
function DataItem({ label, available }: { label: string; available: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-gray-300"}`} />
      <span className={available ? "text-ink-2" : "text-faint"}>{label}</span>
      <span className="ml-auto text-[9px] text-faint">{available ? "发送" : "无数据"}</span>
    </div>
  );
}
