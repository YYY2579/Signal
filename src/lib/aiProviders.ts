export interface AiProviderOption {
  id: "openai-compatible" | "anthropic" | "gemini" | "ollama";
  label: string;
  description: string;
  defaultBaseUrl: string;
  modelPlaceholder: string;
  requiresApiKey: boolean;
}

export type AiProviderId = AiProviderOption["id"];

export const AI_PROVIDER_OPTIONS: readonly AiProviderOption[] = [
  {
    id: "openai-compatible",
    label: "OpenAI Compatible",
    description: "OpenAI、DeepSeek、通义千问、Moonshot、GLM、硅基流动、vLLM、LM Studio",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4.1 / deepseek-chat / qwen-plus",
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Messages",
    description: "Claude 官方 Messages API",
    defaultBaseUrl: "https://api.anthropic.com",
    modelPlaceholder: "claude-sonnet-4-5",
    requiresApiKey: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Gemini generateContent API",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    modelPlaceholder: "gemini-2.5-flash",
    requiresApiKey: true,
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "本地 Ollama 原生 Chat API，无需 API Key",
    defaultBaseUrl: "http://localhost:11434",
    modelPlaceholder: "qwen3:8b / llama3.2",
    requiresApiKey: false,
  },
] as const;

export function canonicalAiProviderId(provider: string): AiProviderId {
  const normalized = provider.trim().toLowerCase();
  const canonical =
    normalized === "openai" || normalized === "local-compatible"
      ? "openai-compatible"
      : normalized === "claude"
        ? "anthropic"
        : normalized === "google" || normalized === "google-gemini"
          ? "gemini"
          : normalized;
  return AI_PROVIDER_OPTIONS.some((option) => option.id === canonical)
    ? (canonical as AiProviderId)
    : "openai-compatible";
}

export function getAiProviderOption(provider: string): AiProviderOption {
  const canonical = canonicalAiProviderId(provider);
  return (
    AI_PROVIDER_OPTIONS.find((option) => option.id === canonical) ??
    AI_PROVIDER_OPTIONS[0]
  );
}

export function nextProviderBaseUrl(
  currentProvider: string,
  currentBaseUrl: string,
  nextProvider: string,
) {
  const current = getAiProviderOption(currentProvider);
  const next = getAiProviderOption(nextProvider);
  const normalizedUrl = currentBaseUrl.trim().replace(/\/$/, "");
  return !normalizedUrl || normalizedUrl === current.defaultBaseUrl
    ? next.defaultBaseUrl
    : currentBaseUrl;
}
