import { For, Show, createMemo } from "solid-js";
import { commitColors } from "../../utils/file";

interface Props {
  message: string;
  class?: string;
  canClickOnCard?: boolean;
  onClickCard?: (cardId: string) => void;
}

const CommitMessage = (props: Props) => {
  // 1. Criamos um "memo" para processar a mensagem apenas quando props.message mudar
  const parsed = createMemo(() => {
    const msg = props.message || "";

    // Lógica para Merges
    if (msg.startsWith("Merge branch") || msg.startsWith("Merge remote-tracking branch")) {
      const branchName = msg.match(/'([^']+)'/)?.[1] || "branch";
      return { isMerge: true, branchName };
    }

    // Regex para capturar Tag e Conteúdo
    const tagRegex = /^(\w+)(?:\(([^)]+)\))?:\s*(.*)$/;
    const tagMatch = msg.match(tagRegex);

    return {
      isMerge: false,
      type: tagMatch ? tagMatch[1] : null,
      scope: tagMatch ? tagMatch[2] : null,
      mainContent: tagMatch ? tagMatch[3] : msg,
      fullMessage: msg
    };
  });

  const renderContentWithCards = (text: string) => {
    const parts = text.split(/(#\d+)/g);
    return (
      <For each={parts}>
        {(part) => (
          <Show when={part.startsWith("#")} fallback={<span >{part}</span>}>
            <span
              onClick={() => props.canClickOnCard && props.onClickCard?.(part.replace("#", ""))}
              class={`text-blue-600 dark:text-blue-400 font-medium ${
                props.canClickOnCard ? "cursor-pointer hover:underline" : ""
              }`}
            >
              {part}
            </span>
          </Show>
        )}
      </For>
    );
  };

  return (
    <div class={`${props.class ?? "text-sm font-mono"}`}>
      <Show 
        when={!parsed().isMerge} 
        fallback={
          <div class="font-mono text-sm">
            <span class="text-fuchsia-500 dark:text-fuchsia-400 font-bold">merge:</span>
            <span> from {parsed().branchName}</span>
          </div>
        }
      >
        <Show when={parsed().type} fallback={renderContentWithCards(parsed().fullMessage || "")}>
          <span class={commitColors[parsed().type!] || "text-gray-500 dark:text-gray-400"}>
            {parsed().type}: 
          </span>
          <Show when={parsed().scope}>
            <span class="text-gray-500 dark:text-gray-500">({parsed().scope}): </span>
          </Show>
          {renderContentWithCards(parsed().mainContent!)}
        </Show>
      </Show>
    </div>
  );
};

export default CommitMessage;