import { For, createMemo } from "solid-js";

interface CommitGraphProps {
  commits: any[];
  rowHeight: number;
}

export default function CommitGraph(props: CommitGraphProps) {
  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
  const colWidth = 14;
  const xOffset = 12;
  const circleRadius = 4;

  const graphData = createMemo(() => {
    const commits = props.commits;
    if (!commits.length) return { rows: [], maxCol: 0 };

    const branchColors: Map<number, string> = new Map();
    let nextBranchId = 0;
    
    // Ativo: coluna -> branchId
    let activeBranches: Map<number, number> = new Map();
    let maxCol = 0;

    const rows: {
      segments: { col: number; nextCol: number; color: string; char: string }[];
      commitCol: number | null;
    }[] = [];

    // Função para obter cor, criando se necessário
    function getOrCreateColor(branchId: number, parentBranchId?: number): string {
      if (branchColors.has(branchId)) return branchColors.get(branchId)!;

      let color: string;
      if (parentBranchId !== undefined) {
        const parentColor = branchColors.get(parentBranchId) || colors[0];
        const parentIdx = colors.indexOf(parentColor);
        // Pula para a próxima cor (diferente do pai)
        color = colors[(parentIdx + 1) % colors.length];
        // Se por acaso for igual (só uma cor), use a primeira
        if (color === parentColor) color = colors[0];
      } else {
        // Usa o próximo slot baseado no contador de branches
        color = colors[branchId % colors.length];
      }
      branchColors.set(branchId, color);
      return color;
    }

    for (const commit of commits) {
      const chars = (commit.graph_symbol || "").split("");
      const nextActive: Map<number, number> = new Map();
      const segments: { col: number; nextCol: number; color: string; char: string }[] = [];
      let commitCol: number | null = null;

      for (let col = 0; col < chars.length; col++) {
        const char = chars[col];
        if (char === " ") continue;
        if (col > maxCol) maxCol = col;

        let branchId: number;
        let parentBranchId: number | undefined;

        if (char === "\\") {
          // Nova branch saindo do ramo à esquerda (col - 1)
          const leftBranch = activeBranches.get(col - 1);
          if (leftBranch !== undefined) {
            // Cria um novo ID para a nova branch
            branchId = nextBranchId++;
            parentBranchId = leftBranch; // define o pai
          } else {
            // Fallback: não há ramo à esquerda (improvável)
            branchId = nextBranchId++;
          }
        } else if (char === "/") {
          // Merge: o ramo que termina é o desta coluna
          branchId = activeBranches.get(col) ?? nextBranchId++;
          // Não tem pai, pois está terminando
        } else if (activeBranches.has(col)) {
          // Continuação de ramo existente
          branchId = activeBranches.get(col)!;
        } else {
          // Início isolado (primeiro commit ou ramo sem pai)
          branchId = nextBranchId++;
        }

        const color = getOrCreateColor(branchId, parentBranchId);

        let nextCol = col;
        let survives = true;

        switch (char) {
          case "|":
          case "*":
            nextCol = col;
            if (char === "*") commitCol = col;
            break;
          case "\\":
            nextCol = col + 1;
            if (nextCol > maxCol) maxCol = nextCol;
            break;
          case "/":
            nextCol = col - 1;
            survives = false; // ramo termina
            break;
        }

        segments.push({ col, nextCol, color, char });

        if (survives) {
          // Se já existir um ramo em nextCol (merge), o ramo principal (esquerda) tem prioridade
          if (!nextActive.has(nextCol)) {
            nextActive.set(nextCol, branchId);
          }
        }
      }

      rows.push({ segments, commitCol });
      activeBranches = nextActive;
    }

    return { rows, maxCol };
  });

  const svgWidth = (graphData().maxCol + 2) * colWidth + xOffset;
  const svgHeight = props.commits.length * props.rowHeight;

  return (
    <svg 
      width={svgWidth} 
      height={svgHeight} 
      class="pointer-events-none overflow-visible flex-shrink-0"
    >
      <For each={graphData().rows}>
        {(row, i) => {
          const yTop = i() * props.rowHeight;
          const yMid = yTop + props.rowHeight / 2;
          const yBot = (i() + 1) * props.rowHeight;

          return (
            <g>
              <For each={row.segments}>
                {(seg) => {
                  const x = seg.col * colWidth + xOffset;
                  const xNext = seg.nextCol * colWidth + xOffset;

                  if (seg.col === seg.nextCol) {
                    return (
                      <line 
                        x1={x} y1={yTop} 
                        x2={x} y2={yBot} 
                        stroke={seg.color} 
                        stroke-width="2" 
                        stroke-linecap="round"
                      />
                    );
                  } else {
                    const midY = (yTop + yBot) / 2;
                    return (
                      <path 
                        d={`M ${x} ${yTop} C ${x} ${midY}, ${xNext} ${midY}, ${xNext} ${yBot}`}
                        fill="none" 
                        stroke={seg.color} 
                        stroke-width="2" 
                        stroke-linecap="round"
                      />
                    );
                  }
                }}
              </For>

              {row.commitCol !== null && (
                <circle 
                  cx={row.commitCol * colWidth + xOffset} 
                  cy={yMid} 
                  r={circleRadius}
                  fill={row.segments.find(s => s.col === row.commitCol)?.color || "#6b7280"} 
                  stroke="currentColor" 
                  stroke-width="1.5"
                  class="text-white dark:text-gray-900"
                />
              )}
            </g>
          );
        }}
      </For>
    </svg>
  );
}