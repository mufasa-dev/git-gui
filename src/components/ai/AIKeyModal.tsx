import { createEffect, createSignal, For } from "solid-js";
import Dialog from "../ui/Dialog";
import { AIConfig, AIProvider, AI_PROVIDER_DEFAULTS } from "../../models/AI.model";
import { notify } from "../../utils/notifications";

export type AIKeyModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: AIConfig) => void;
};

// Rótulos amigáveis pedidos pelo usuário (Gemini / GPT / Claude), mapeados
// para os providers internos já existentes em AI_PROVIDER_DEFAULTS.
const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
  { value: "gemini", label: "Gemini (Google)" },
  { value: "openai", label: "GPT (OpenAI)" },
  { value: "anthropic", label: "Claude (Anthropic)" },
];

export default function AIKeyModal(props: AIKeyModalProps) {
  const [provider, setProvider] = createSignal<AIProvider>("gemini");
  const [apiKey, setApiKey] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  // Sempre que o modal é reaberto, começa limpo.
  createEffect(() => {
    if (props.open) {
      setProvider("gemini");
      setApiKey("");
      setSaving(false);
    }
  });

  const submit = () => {
    const key = apiKey().trim();
    if (!key) {
      notify.error("Configuração necessária", "Informe a chave de API para continuar.");
      return;
    }

    setSaving(true);
    try {
      const config: AIConfig = {
        provider: provider(),
        model: AI_PROVIDER_DEFAULTS[provider()].model,
        apiKey: key,
        mode: "chat",
      };
      props.onConfirm(config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      title="Configurar IA para sugestão de commit"
      icon="fa-solid fa-key"
      iconColor="text-blue-600 dark:text-blue-300"
      onClose={props.onClose}
    >
      <div class="space-y-4 text-gray-700 dark:text-gray-200">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Nenhuma chave de IA configurada ainda. Escolha o provedor e informe a chave para gerar
          a sugestão de mensagem de commit. A chave fica salva apenas nesta sessão.
        </p>

        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            IA
          </label>
          <select
            class="w-full input-select dark:border-gray-600 dark:bg-gray-700"
            value={provider()}
            onChange={(event) => setProvider(event.currentTarget.value as AIProvider)}
            disabled={saving()}
          >
            <For each={PROVIDER_OPTIONS}>
              {(option) => <option value={option.value}>{option.label}</option>}
            </For>
          </select>
        </div>

        <div>
          <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Chave de API
          </label>
          <input
            type="password"
            autocomplete="off"
            class="w-full input-text"
            placeholder={`Chave do ${AI_PROVIDER_DEFAULTS[provider()].label}`}
            value={apiKey()}
            onInput={(event) => setApiKey(event.currentTarget.value)}
            disabled={saving()}
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button
            class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600"
            onClick={props.onClose}
            disabled={saving()}
          >
            Cancelar
          </button>
          <button
            class="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
            onClick={submit}
            disabled={saving()}
          >
            Salvar e gerar sugestão
          </button>
        </div>
      </div>
    </Dialog>
  );
}
