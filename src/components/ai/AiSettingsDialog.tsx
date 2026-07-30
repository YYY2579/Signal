import { useEffect, useState } from "react";
import {
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { Button } from "../ui/button";
import { ReaderDialog } from "../article/reader/ReaderDialog";
import type { AiSettings } from "../article/reader/types";
import {
  AI_PROVIDER_OPTIONS,
  getAiProviderOption,
  nextProviderBaseUrl,
} from "../../lib/aiProviders";

export function AiSettingsDialog({
  open,
  settings,
  loading,
  busy,
  error,
  onClose,
  onSave,
  onDeleteKey,
  onRetry,
}: {
  open: boolean;
  settings: AiSettings | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (settings: Omit<AiSettings, "configured">, apiKey: string) => void;
  onDeleteKey: () => void;
  onRetry: () => void;
}) {
  const [provider, setProvider] = useState("openai-compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [requireReview, setRequireReview] = useState(true);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!open || !settings) return;
    setProvider(getAiProviderOption(settings.provider).id);
    setBaseUrl(settings.base_url);
    setModel(settings.model);
    setApiKey("");
    setRequireReview(settings.require_review);
    setShowKey(false);
  }, [open, settings]);

  const providerOption = getAiProviderOption(provider);
  const settingsProvider = settings ? getAiProviderOption(settings.provider).id : null;
  const credentialConfigured = Boolean(
    settings?.configured && settingsProvider === providerOption.id,
  );
  const keyAvailable = Boolean(
    !providerOption.requiresApiKey || credentialConfigured || apiKey.trim(),
  );
  const valid = Boolean(
    settings && provider.trim() && baseUrl.trim() && model.trim() && keyAvailable,
  );

  return (
    <ReaderDialog
      open={open}
      title="配置 AI 服务"
      description="密钥保存到系统凭据存储；Signal 不会把密钥写入数据库、设置文件或日志。"
      onClose={busy ? () => undefined : onClose}
      width="max-w-[560px]"
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={busy || loading || !valid}
            onClick={() =>
              onSave(
                {
                  provider: provider.trim(),
                  base_url: baseUrl.trim(),
                  model: model.trim(),
                  require_review: requireReview,
                },
                apiKey.trim(),
              )
            }
          >
            {busy && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {busy ? "验证中..." : "保存并验证"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-4 py-2" aria-label="正在加载 AI 设置">
          {[100, 100, 100, 65].map((width, index) => (
            <div key={index} className="h-9 animate-pulse rounded-field bg-gray-100" style={{ width: `${width}%` }} />
          ))}
        </div>
      ) : !settings ? (
        <div
          role="alert"
          className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-red-100 bg-red-50/60 px-6 text-center"
        >
          <CircleAlert className="h-5 w-5 text-red-500" />
          <p className="mt-2 text-[12px] font-semibold text-red-800">AI 设置读取失败</p>
          <p className="mt-1 max-w-[380px] text-[10px] leading-5 text-red-700">
            {error || "无法确认当前配置，已暂停编辑以防覆盖已有设置。"}
          </p>
          <Button variant="outline" size="sm" className="mt-3 bg-white" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />重试读取
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-[11px] font-semibold text-ink">
            Provider
            <select
              data-autofocus
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value;
                setBaseUrl((current) =>
                  nextProviderBaseUrl(provider, current, nextProvider),
                );
                setProvider(nextProvider);
                setModel("");
                setApiKey("");
              }}
              className="mt-2 h-9 w-full rounded-field border border-line bg-white px-3 text-[12px] font-normal text-ink outline-none transition focus:border-accent"
            >
              {AI_PROVIDER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-semibold text-ink">
            Model
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              autoComplete="off"
              placeholder={providerOption.modelPlaceholder}
              className="mt-2 h-9 w-full rounded-field border border-line bg-white px-3 text-[12px] font-normal text-ink outline-none transition placeholder:text-faint focus:border-accent"
            />
          </label>
          <label className="col-span-2 block text-[11px] font-semibold text-ink">
            API 地址
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              inputMode="url"
              autoComplete="url"
              placeholder={providerOption.defaultBaseUrl}
              className="mt-2 h-9 w-full rounded-field border border-line bg-white px-3 text-[12px] font-normal text-ink outline-none transition placeholder:text-faint focus:border-accent"
            />
          </label>
          {providerOption.requiresApiKey ? (
          <label className="col-span-2 block text-[11px] font-semibold text-ink">
            API Key
            <span className="relative mt-2 block">
              <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                autoComplete="new-password"
                placeholder={credentialConfigured ? "已安全配置；留空则保持不变" : "输入 API Key"}
                className="h-9 w-full rounded-field border border-line bg-white pl-9 pr-10 text-[12px] font-normal text-ink outline-none transition placeholder:text-faint focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-faint hover:bg-panel hover:text-ink"
                aria-label={showKey ? "隐藏密钥" : "显示密钥"}
                title={showKey ? "隐藏密钥" : "显示密钥"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </span>
          </label>
          ) : (
            <div className="col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3.5 py-3 text-[11px] text-emerald-800">
              Ollama 通过本机服务连接，不读取或发送 API Key。
            </div>
          )}

          <p className="col-span-2 -mt-1 text-[10px] leading-4 text-muted">
            {providerOption.description}
          </p>

          <div className="col-span-2 flex items-center justify-between rounded-lg border border-line bg-panel/60 px-3.5 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div>
                <p className="text-[11px] font-semibold text-ink">生成后必须人工审核</p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">接受前保持草稿状态，不自动写入知识库。</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireReview}
              aria-label="生成后必须人工审核"
              title="生成后必须人工审核"
              onClick={() => setRequireReview((value) => !value)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${requireReview ? "bg-accent" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${requireReview ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      )}

      {credentialConfigured && providerOption.requiresApiKey && !loading && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <p className="text-[10px] text-emerald-700">系统凭据中已有 API Key</p>
          <button
            type="button"
            disabled={busy}
            onClick={onDeleteKey}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />移除密钥
          </button>
        </div>
      )}
      {error && settings && (
        <p role="alert" className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
          {error}
        </p>
      )}
    </ReaderDialog>
  );
}
