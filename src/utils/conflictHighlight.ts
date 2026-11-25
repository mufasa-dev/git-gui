import { EditorState, Range, StateField, Text } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";

export type ConflictChoice = "current" | "incoming" | "both";

export type ConflictBlock = {
  /** Número sequencial do conflito no documento (1, 2, 3...). */
  id: number;
  /** Offset do início da linha `<<<<<<<`. */
  from: number;
  /** Offset do fim da linha `>>>>>>>`. */
  to: number;
  /** Linhas (1-based) dos marcadores. */
  startLine: number;
  sepLine: number;
  endLine: number;
  currentLines: string[];
  incomingLines: string[];
};

export type ConflictLabels = {
  line: string;
  current: string;
  incoming: string;
  both: string;
};

export type ConflictExtensionOptions = {
  labels: ConflictLabels;
  onResolve: (view: EditorView, block: ConflictBlock, choice: ConflictChoice) => void;
};

/** Encontra todos os blocos completos `<<<<<<< / ======= / >>>>>>>` do documento. */
export function parseConflicts(doc: Text): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  let lineNumber = 1;

  while (lineNumber <= doc.lines) {
    const startLine = doc.line(lineNumber);
    if (!startLine.text.startsWith("<<<<<<<")) {
      lineNumber++;
      continue;
    }

    let sepLine = -1;
    let endLine = -1;
    for (let cursor = lineNumber + 1; cursor <= doc.lines; cursor++) {
      const text = doc.line(cursor).text;
      if (sepLine === -1) {
        if (text.startsWith("<<<<<<<")) break; // início sem separador: descarta
        if (text.startsWith("=======")) sepLine = cursor;
      } else if (text.startsWith(">>>>>>>")) {
        endLine = cursor;
        break;
      }
    }

    if (sepLine === -1 || endLine === -1) {
      lineNumber++;
      continue;
    }

    const currentLines: string[] = [];
    const incomingLines: string[] = [];
    for (let n = lineNumber + 1; n < sepLine; n++) currentLines.push(doc.line(n).text);
    for (let n = sepLine + 1; n < endLine; n++) incomingLines.push(doc.line(n).text);

    blocks.push({
      id: blocks.length + 1,
      from: startLine.from,
      to: doc.line(endLine).to,
      startLine: lineNumber,
      sepLine,
      endLine,
      currentLines,
      incomingLines,
    });
    lineNumber = endLine + 1;
  }

  return blocks;
}

export function resolutionLines(block: ConflictBlock, choice: ConflictChoice): string[] {
  if (choice === "current") return block.currentLines;
  if (choice === "incoming") return block.incomingLines;
  return [...block.currentLines, ...block.incomingLines];
}

/** Substitui o bloco de conflito pelo lado escolhido. */
export function applyResolution(view: EditorView, block: ConflictBlock, choice: ConflictChoice) {
  const lines = resolutionLines(block, choice);
  const insert = lines.join("\n");
  let from = block.from;
  let to = block.to;

  if (lines.length === 0) {
    // Remove também a quebra de linha, para não sobrar uma linha vazia.
    if (to < view.state.doc.length) to += 1;
    else if (from > 0) from -= 1;
  }

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
}

class ConflictActionsWidget extends WidgetType {
  private readonly key: string;

  constructor(
    private readonly block: ConflictBlock,
    private readonly options: ConflictExtensionOptions,
  ) {
    super();
    this.key = [
      block.id,
      block.from,
      block.to,
      block.startLine,
      block.currentLines.join("\n"),
      block.incomingLines.join("\n"),
    ].join("\u0001");
  }

  eq(other: ConflictActionsWidget) {
    return other.key === this.key;
  }

  toDOM(view: EditorView) {
    const { labels } = this.options;
    const root = document.createElement("div");
    root.className = "cm-merge-actions";

    const title = document.createElement("span");
    title.className = "cm-merge-actions-title";
    title.textContent = `#${this.block.id} · ${labels.line} ${this.block.startLine}`;
    root.appendChild(title);

    const choices: [ConflictChoice, string][] = [
      ["current", labels.current],
      ["incoming", labels.incoming],
      ["both", labels.both],
    ];

    for (const [choice, label] of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cm-merge-btn cm-merge-btn-${choice}`;
      button.textContent = label;
      // Evita que o mousedown tire o foco/seleção do editor antes da ação.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.options.onResolve(view, this.block, choice);
      });
      root.appendChild(button);
    }

    return root;
  }

  ignoreEvent() {
    return true;
  }
}

function buildDecorations(state: EditorState, options: ConflictExtensionOptions): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const doc = state.doc;

  const markerDeco = Decoration.line({ class: "cm-merge-marker" });
  const currentDeco = Decoration.line({ class: "cm-merge-current" });
  const incomingDeco = Decoration.line({ class: "cm-merge-incoming" });

  for (const block of parseConflicts(doc)) {
    ranges.push(
      Decoration.widget({ widget: new ConflictActionsWidget(block, options), block: true, side: -1 })
        .range(block.from),
    );

    ranges.push(markerDeco.range(doc.line(block.startLine).from));
    ranges.push(markerDeco.range(doc.line(block.sepLine).from));
    ranges.push(markerDeco.range(doc.line(block.endLine).from));

    for (let n = block.startLine + 1; n < block.sepLine; n++) {
      ranges.push(currentDeco.range(doc.line(n).from));
    }
    for (let n = block.sepLine + 1; n < block.endLine; n++) {
      ranges.push(incomingDeco.range(doc.line(n).from));
    }
  }

  return Decoration.set(ranges, true);
}

/**
 * Extensão do CodeMirror: pinta os blocos de conflito (lado atual em verde,
 * lado incoming em azul, marcadores em âmbar) e mostra, acima de cada bloco,
 * os botões para escolher a resolução.
 */
export function conflictExtension(options: ConflictExtensionOptions) {
  return StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, options),
    update: (value, transaction) => (transaction.docChanged ? buildDecorations(transaction.state, options) : value),
    provide: (field) => EditorView.decorations.from(field),
  });
}
