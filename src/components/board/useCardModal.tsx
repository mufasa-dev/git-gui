import { createSignal, For, Show } from "solid-js";
import CardDetailView from "./CardItem";
import { getRemoteUrl } from "../../services/gitService";
import { GitProvider, parseRemoteRepository } from "../../utils/gitProvider";
import { notify } from "../../utils/notifications";
import { useApp } from "../../context/AppContext";

type CardModalOptions = {
  repoPath: string;
  /** Fallbacks usados quando a URL remota não puder ser interpretada. */
  repoName?: string;
  provider?: GitProvider;
  org?: string;
};

type CardTarget = {
  id: string;
  provider: GitProvider;
  organization: string;
  /** GitHub: nome do repositório. Azure: nome do projeto. */
  repoName: string;
  repoPath: string;
};

/**
 * Abre o modal de card (issue do GitHub / work item do Azure) a partir de um
 * `#123` encontrado na mensagem de um commit. Owner/projeto são resolvidos pela
 * URL remota do repositório, então funciona em qualquer tela que só conheça o
 * caminho local.
 */
export function useCardModal(options: () => CardModalOptions) {
  const { t } = useApp();
  const [target, setTarget] = createSignal<CardTarget | null>(null);
  const remoteCache = new Map<string, ReturnType<typeof parseRemoteRepository>>();

  const resolveRemote = async (repoPath: string) => {
    if (!remoteCache.has(repoPath)) {
      const url = repoPath ? await getRemoteUrl(repoPath) : "";
      remoteCache.set(repoPath, url ? parseRemoteRepository(url) : null);
    }
    return remoteCache.get(repoPath) ?? null;
  };

  const openCard = async (cardId: string) => {
    const opts = options();
    try {
      const remote = await resolveRemote(opts.repoPath);
      const provider = remote?.provider && remote.provider !== "unknown" ? remote.provider : opts.provider;

      let organization = opts.org ?? "";
      let repoName = opts.repoName ?? "";
      if (remote?.provider === "github") {
        organization = remote.owner || organization;
        repoName = remote.name || repoName;
      } else if (remote?.provider === "azure") {
        organization = remote.organization || organization;
        repoName = remote.project || repoName;
      }

      if ((provider !== "github" && provider !== "azure") || !organization || !repoName) {
        notify.error(t("error").error, t("board").card_unavailable);
        return;
      }

      setTarget({ id: cardId, provider, organization, repoName, repoPath: opts.repoPath });
    } catch (error) {
      notify.error(t("error").error, String(error));
    }
  };

  const CardModal = () => (
    <Show when={target()} keyed>
      {(card) => (
        <CardDetailView
          cardId={card.id}
          provider={card.provider}
          organization={card.organization}
          repoName={card.repoName}
          repoPath={card.repoPath}
          onClose={() => setTarget(null)}
        />
      )}
    </Show>
  );

  return { openCard, CardModal };
}

/** Texto livre (ex.: corpo do commit) com `#123` clicáveis. */
export function TextWithCards(props: { text: string; clickable?: boolean; onClickCard?: (id: string) => void }) {
  return (
    <For each={(props.text || "").split(/(#\d+)/g)}>
      {(part) => (
        <Show when={/^#\d+$/.test(part)} fallback={part}>
          <span
            class={`font-medium text-blue-600 dark:text-blue-400 ${props.clickable ? "cursor-pointer hover:underline" : ""}`}
            onClick={(e) => {
              if (!props.clickable) return;
              e.stopPropagation();
              props.onClickCard?.(part.slice(1));
            }}
          >
            {part}
          </span>
        </Show>
      )}
    </For>
  );
}
