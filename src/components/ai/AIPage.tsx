import { createSignal, For, Show } from "solid-js";
import { Repo } from "../../models/Repo.model";
import {
  AIConfig,
  AIMessage,
  AIAgentMode,
  AIProvider,
  AI_PROVIDER_DEFAULTS,
} from "../../models/AI.model";
import { sendAIMessage } from "../../services/aiService";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";

export default function AIPage(props: { repo: Repo }) {
  const { aiConfig, updateAIConfig, t } = useApp();
  const currentConfig = aiConfig();
  const [provider, setProvider] = createSignal<AIProvider>(currentConfig?.provider || "gemini");
  const [model, setModel] = createSignal(currentConfig?.model || AI_PROVIDER_DEFAULTS.gemini.model);
  const [apiKey, setApiKey] = createSignal(currentConfig?.apiKey || "");
  const [mode, setMode] = createSignal<AIAgentMode>(currentConfig?.mode || "chat");
  const [prompt, setPrompt] = createSignal("");
  const [messages, setMessages] = createSignal<AIMessage[]>([]);
  const [isSending, setIsSending] = createSignal(false);

  const providerDefaults = () => AI_PROVIDER_DEFAULTS[provider()];
  const activeConfig = (): AIConfig => ({
    provider: provider(),
    model: model().trim(),
    apiKey: apiKey().trim(),
    mode: mode(),
  });

  const saveConfiguration = (): AIConfig | null => {
    const config = activeConfig();
    if (!config.apiKey) {
      notify.error(t("ai").configuration_required, t("ai").api_key_required);
      return null;
    }
    if (!config.model) {
      notify.error(t("ai").configuration_required, t("ai").model_required);
      return null;
    }
    updateAIConfig(config);
    return config;
  };

  const selectProvider = (nextProvider: AIProvider) => {
    setProvider(nextProvider);
    setModel(AI_PROVIDER_DEFAULTS[nextProvider].model);
  };

  const sendMessage = async () => {
    const content = prompt().trim();
    if (!content || isSending()) return;

    const config = saveConfiguration();
    if (!config) return;

    const nextMessages: AIMessage[] = [...messages(), { role: "user", content }];
    setMessages(nextMessages);
    setPrompt("");
    setIsSending(true);

    try {
      const answer = await sendAIMessage(props.repo.path, config, nextMessages);
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch (error) {
      notify.error(t("ai").ai_error, String(error));
    } finally {
      setIsSending(false);
    }
  };

  const clearConfiguration = () => {
    setApiKey("");
    updateAIConfig(null);
  };

  return (
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-200 p-3 dark:bg-gray-900">
      <div class="flex min-h-0 w-full flex-1 flex-col gap-3">
        <header class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-300 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-500">
              <i class="fa-solid fa-wand-magic-sparkles text-xl" />
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">Dev Brook AI</p>
              <h1 class="text-xl font-bold">{t("ai").title}</h1>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-200">
              {providerDefaults().label} · {model()}
            </span>
          </div>
        </header>

        <div class="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <div>
                <h2 class="font-semibold">{t("ai").repository_chat}</h2>
              <p class="text-xs text-gray-500 dark:text-gray-400">{t("ai").repository_chat_hint}</p>
              </div>
              <button
                class="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setMessages([])}
                disabled={messages().length === 0}
              >
                {t("ai").clear}
              </button>
            </div>

            <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <Show when={messages().length === 0}>
                <div class="flex min-h-full items-center justify-center">
                  <div class="w-full max-w-2xl rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-600">
                    <i class="fa-regular fa-comments mb-3 text-4xl text-blue-400" />
                    <h3 class="text-lg font-semibold">{t("ai").empty_title}</h3>
                    <p class="mx-auto mt-2 max-w-xl text-sm text-gray-500 dark:text-gray-400">
                      {t("ai").empty_description}
                    </p>
                    <div class="mt-5 flex flex-wrap justify-center gap-2">
                      <For each={[
                        t("ai").suggest_changes,
                        t("ai").suggest_tests,
                        t("ai").suggest_commit,
                      ]}>
                        {(suggestion) => (
                          <button
                            class="rounded-full border border-gray-300 px-3 py-2 text-xs hover:border-blue-500 dark:border-gray-600"
                            onClick={() => setPrompt(suggestion)}
                          >
                            {suggestion}
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>
              </Show>
              <For each={messages()}>
                {(message) => (
                  <div class={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div class={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      message.role === "user"
                        ? "rounded-br-md bg-blue-600 text-white"
                        : "rounded-bl-md bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                    }`}>
                      <div class="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-60">
                        {message.role === "user" ? t("ai").you : t("ai").assistant}
                      </div>
                      <div class="whitespace-pre-wrap break-words">{message.content}</div>
                    </div>
                  </div>
                )}
              </For>
              <Show when={isSending()}>
                <div class="text-sm text-gray-500">
                  <i class="fa-solid fa-spinner mr-2 animate-spin" /> {t("ai").analyzing_repository}
                </div>
              </Show>
            </div>

            <div class="border-t border-gray-200 p-4 dark:border-gray-700">
              <textarea
                class="min-h-20 w-full resize-y rounded-xl border border-gray-300 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                placeholder={aiConfig() ? t("ai").prompt_placeholder : t("ai").configure_key_placeholder}
                value={prompt()}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={isSending()}
              />
              <div class="mt-2 flex items-center justify-between gap-3">
                <span class="text-[11px] text-gray-500">{t("ai").shortcut_hint}</span>
                <button
                  class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={sendMessage}
                  disabled={isSending() || !prompt().trim()}
                >
                  <i class="fa-solid fa-paper-plane mr-2" /> {t("ai").send}
                </button>
              </div>
            </div>
          </section>

          <aside class="min-h-0 overflow-y-auto rounded-2xl border border-gray-300 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-5 flex items-center justify-between">
              <div>
                <h2 class="font-semibold">{t("ai").configuration}</h2>
                <p class="text-xs text-gray-500 dark:text-gray-400">{t("ai").session_only}</p>
              </div>
              <i class="fa-solid fa-shield-halved text-green-500" title={t("ai").key_not_persisted} />
            </div>

            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t("ai").provider}</label>
            <select
              class="input-select mb-4 w-full dark:border-gray-600 dark:bg-gray-700"
              value={provider()}
              onChange={(event) => selectProvider(event.currentTarget.value as AIProvider)}
            >
              <For each={Object.entries(AI_PROVIDER_DEFAULTS)}>
                {([value, option]) => <option value={value}>{option.label}</option>}
              </For>
            </select>

            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t("ai").model}</label>
            <select
              class="input-select mb-2 w-full dark:border-gray-600 dark:bg-gray-700"
              value={AI_PROVIDER_DEFAULTS[provider()].models.includes(model()) ? model() : ""}
              onChange={(event) => setModel(event.currentTarget.value)}
            >
              <For each={providerDefaults().models}>
                {(option) => <option value={option}>{option}</option>}
              </For>
            </select>
            <input
              class="input-text mb-4 w-full dark:border-gray-600 dark:bg-gray-700"
              placeholder={t("ai").custom_model}
              value={model()}
              onInput={(event) => setModel(event.currentTarget.value)}
            />

            <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t("ai").api_key}</label>
            <input
              type="password"
              autocomplete="off"
              class="input-text mb-2 w-full dark:border-gray-600 dark:bg-gray-700"
              placeholder={t("ai").api_key_placeholder.replace("{{provider}}", providerDefaults().label)}
              value={apiKey()}
              onInput={(event) => setApiKey(event.currentTarget.value)}
            />
            <p class="mb-5 text-[11px] leading-relaxed text-gray-500">
              {t("ai").key_session_hint}
            </p>

            <label class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">{t("ai").work_mode}</label>
            <div class="mb-5 grid grid-cols-2 gap-2">
              <For each={[
                ["chat", t("ai").chat_mode, t("ai").chat_mode_description],
                ["agent", t("ai").agent_mode, t("ai").agent_mode_description],
              ] as [AIAgentMode, string, string][]}>
                {([value, label, description]) => (
                  <button
                    class={`rounded-xl border p-2 text-left ${mode() === value ? "border-blue-500 bg-blue-500/10" : "border-gray-300 dark:border-gray-600"}`}
                    onClick={() => setMode(value)}
                  >
                    <div class="text-xs font-semibold">{label}</div>
                    <div class="mt-1 text-[10px] text-gray-500">{description}</div>
                  </button>
                )}
              </For>
            </div>

            <button class="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" onClick={saveConfiguration}>
              <i class="fa-solid fa-lock mr-2" /> {t("ai").use_session}
            </button>
            <Show when={aiConfig()}>
              <button class="mt-2 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:border-red-400 hover:text-red-500 dark:border-gray-600 dark:text-gray-300" onClick={clearConfiguration}>
                {t("ai").remove_session_key}
              </button>
            </Show>
            <p class="mt-5 border-t border-gray-200 pt-4 text-[11px] leading-relaxed text-gray-500 dark:border-gray-700">
              {t("ai").claude_terminal_note}
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
