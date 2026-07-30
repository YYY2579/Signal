import { useEffect, useState } from "react";
import { BookOpen, FileText, LoaderCircle } from "lucide-react";

import { Button } from "../../ui/button";
import { ReaderDialog } from "./ReaderDialog";

export function KnowledgeDialog({
  open,
  articleTitle,
  sourceName,
  saved,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  articleTitle: string;
  sourceName: string;
  saved: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ReaderDialog
      open={open}
      title={saved ? "移出知识库" : "加入知识库"}
      description="知识库状态会保存在本地，可用于后续检索、笔记与 AI 上下文。"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "保存中..." : saved ? "确认移出" : "确认加入"}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-lg border border-line bg-panel/70 p-3.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-accent">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-[12px] font-semibold leading-5 text-ink">
            {articleTitle}
          </p>
          <p className="mt-1 text-[10px] text-muted">{sourceName}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </ReaderDialog>
  );
}

export function NoteDialog({
  open,
  articleTitle,
  suggestedContent,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  articleTitle: string;
  suggestedContent: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (title: string, content: string) => void;
}) {
  const [title, setTitle] = useState(articleTitle);
  const [content, setContent] = useState(suggestedContent);

  useEffect(() => {
    if (!open) return;
    setTitle(articleTitle);
    setContent(suggestedContent);
  }, [articleTitle, open, suggestedContent]);

  const valid = title.trim().length > 0 && content.trim().length > 0;

  return (
    <ReaderDialog
      open={open}
      title="生成笔记"
      description="检查并编辑内容后保存。Signal 不会在未确认时自动写入知识库。"
      onClose={busy ? () => undefined : onClose}
      width="max-w-[620px]"
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={busy || !valid}
            onClick={() => onSave(title.trim(), content.trim())}
          >
            {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {busy ? "保存中..." : "保存笔记"}
          </Button>
        </>
      }
    >
      <label className="block text-[11px] font-semibold text-ink">
        标题
        <input
          data-autofocus
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 h-9 w-full rounded-field border border-line bg-white px-3 text-[12px] font-normal text-ink outline-none transition focus:border-accent"
        />
      </label>
      <label className="mt-4 block text-[11px] font-semibold text-ink">
        笔记内容
        <textarea
          value={content}
          maxLength={20000}
          onChange={(event) => setContent(event.target.value)}
          placeholder="记录你的判断、上下文与后续行动..."
          className="mt-2 min-h-[260px] w-full resize-y rounded-field border border-line bg-white px-3 py-2.5 text-[12px] font-normal leading-6 text-ink outline-none transition placeholder:text-faint focus:border-accent"
        />
      </label>
      <div className="mt-2 flex justify-between text-[9px] text-faint">
        <span>{suggestedContent ? "已填入当前文章内容，可继续编辑" : "需要填写内容后才能保存"}</span>
        <span className="tabular-nums">{content.length}/20000</span>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {error}
        </p>
      )}
    </ReaderDialog>
  );
}
