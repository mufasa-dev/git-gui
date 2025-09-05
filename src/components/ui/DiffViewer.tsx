import { For, Show } from "solid-js";

type Props = {
  diff: string;
  class: string;
};

type DiffLine = {
  type: "add" | "del" | "ctx" | "hunk";
  oldLine?: number;
  newLine?: number;
  content: string;
};

function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  
  const lines = diff.split("\n");
  const result: DiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file mode")) {
      continue; // pula cabeçalhos
    }

    if (line.startsWith("@@")) {
      // hunk header → @@ -1,3 +1,4 @@
      const match = /@@ -(\d+),?\d* \+(\d+),?\d* @@/.exec(line);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({ type: "hunk", content: line });
      continue;
    }

    if (line.startsWith("+")) {
      result.push({ type: "add", newLine: newLine++, content: line });
    } else if (line.startsWith("-")) {
      result.push({ type: "del", oldLine: oldLine++, content: line });
    } else {
      result.push({ type: "ctx", oldLine: oldLine++, newLine: newLine++, content: line });
    }
  }

  return result;
}

export default function DiffViewer(props: Props) {
  const diffLines = () => parseDiff(props.diff);

  return (
    <div class="font-mono text-sm border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
      <table class="w-full border-collapse">
        <tbody>
          <For each={diffLines()}>
            {(line) => (
              <tr
                class={
                  line.type === "add"
                    ? "bg-green-100 dark:bg-green-300 dark:text-black"
                    : line.type === "del"
                    ? "bg-red-100 dark:bg-red-300 dark:text-black"
                    : line.type === "hunk"
                    ? "bg-gray-200 dark:bg-gray-700 font-bold"
                    : ""
                }
              >
                {/* Número linha antiga */}
                <td class="w-12 text-right px-2 text-gray-500 select-none border-r border-gray-300 dark:border-gray-600">
                  <Show when={line.oldLine !== undefined}>{line.oldLine}</Show>
                </td>
                {/* Número linha nova */}
                <td class="w-12 text-right px-2 text-gray-500 select-none border-r border-gray-300 dark:border-gray-600">
                  <Show when={line.newLine !== undefined}>{line.newLine}</Show>
                </td>
                {/* Conteúdo */}
                <td class="px-2 whitespace-pre-wrap">
                  {line.content}
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
