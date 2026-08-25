import { For, Show, createMemo } from "solid-js";
import { commitColors, TAG_MAPPING } from "../../utils/file";

interface Props {
  message: string;
  class?: string;
  canClickOnCard?: boolean;
  onClickCard?: (cardId: string) => void;
}

interface ParsedCommitMessage {
  isMerge: boolean;
  mergeLabel?: string;
  branchName?: string;
  type?: string | null;
  scope?: string | null;
  mainContent?: string;
  fullMessage?: string;
}

const CommitMessage = (props: Props) => {
  const parsed = createMemo<ParsedCommitMessage>(() => {
    const msg = (props.message || "").trim();

    const pullRequestMatch = msg.match(/^Merge pull request\s+#?(\d+)\s+from\s+(.+)$/i);
    if (pullRequestMatch) {
      return {
        isMerge: true,
        mergeLabel: `PR #${pullRequestMatch[1]}`,
        branchName: pullRequestMatch[2],
      };
    }

    const providerPullRequestMatch = msg.match(/^Merged?\s+PR\s+#?(\d+)\s*:?\s*(.*)$/i);
    if (providerPullRequestMatch) {
      return {
        isMerge: true,
        mergeLabel: `PR #${providerPullRequestMatch[1]}`,
        branchName: providerPullRequestMatch[2] || "pull request",
      };
    }

    const branchMergeMatch = msg.match(/^Merge (?:remote-tracking )?branch\s+'([^']+)'/i);
    if (branchMergeMatch) {
      return {
        isMerge: true,
        mergeLabel: "branch",
        branchName: branchMergeMatch[1],
      };
    }

    // Aceita tanto "feat(scope): mensagem" quanto "feat: (scope): mensagem".
    const malformedTagMatch = msg.match(/^([\w-]+)\s*:\s*\(([^)]+)\)\s*:?[ \t]*(.*)$/);
    const conventionalTagMatch = msg.match(/^([\w-]+)(?:\(([^)]+)\))?\s*:\s*(.*)$/);
    const tagMatch = malformedTagMatch || conventionalTagMatch;

    let type = tagMatch ? tagMatch[1] : null;
    if (type) {
      const lowerType = type.toLowerCase();
      type = TAG_MAPPING[lowerType] || lowerType;
    }

    return {
      isMerge: false,
      type,
      scope: tagMatch ? tagMatch[2] : null,
      mainContent: tagMatch ? tagMatch[3] : msg,
      fullMessage: msg,
    };
  });

  const renderContentWithCards = (text: string) => {
    const parts = text.split(/(#\d+)/g);
    return (
      <For each={parts}>
        {(part) => (
          <Show when={part.startsWith("#")} fallback={<span>{part}</span>}>
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
          <div class="flex min-w-0 items-center gap-1 font-mono text-sm">
            <span class="shrink-0 font-bold text-fuchsia-500 dark:text-fuchsia-400">merge:</span>
            <span class="shrink-0">{parsed().mergeLabel}</span>
            <span class="truncate text-gray-600 dark:text-gray-300">· {parsed().branchName}</span>
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