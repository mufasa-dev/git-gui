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
    
    // Mapa: coluna -> { branchId, parentBranchId? }
    let activeBranches: Map<number, { id: number; parentId?: number }> = new Map();
    let maxCol = 0;

    const rows: {
      segments: { col: number; nextCol: number; color: string; char: string }[];
      commitCol: number | null;
    }[] = [];

    for (const commit of commits) {
      const chars = (commit.graph_symbol || "").split("");
      const nextActive: Map<number, { id: number; parentId?: number }> = new Map();
      const segments: { col: number; nextCol: number; color: string; char: string }[] = [];
      let commitCol: number | null = null;

      for (let col = 0; col < chars.length; col++) {
        const char = chars[col];
        if (char === " ") continue;
        
        if (col > maxCol) maxCol = col;

        let branchId: number;
        let parentId: number | undefined;

        if (char === "/") {
          // Merge: usa o branchId existente na coluna
          const existing = activeBranches.get(col);
          branchId = existing ? existing.id : nextBranchId++;
        } else if (char === "\\") {
          // Nova branch: herda o ID do ramo pai (coluna atual)
          const parent = activeBranches.get(col);
          if (parent) {
            // Cria um novo branchId para a nova branch
            branchId = nextBranchId++;
            parentId = parent.id;
          } else {
            branchId = nextBranchId++;
          }
        } else if (activeBranches.has(col)) {
          // Ramo existente
          branchId = activeBranches.get(col)!.id;
        } else {
          // Novo ramo do nada (primeiro commit)
          branchId = nextBranchId++;
        }

        // Atribui cor com base no branchId ou parentId
        if (!branchColors.has(branchId)) {
          if (parentId !== undefined && branchColors.has(parentId)) {
            // Nova branch: usa a próxima cor disponível diferente do pai
            const parentColor = branchColors.get(parentId)!;
            const parentIndex = colors.indexOf(parentColor);
            const nextColorIndex = (parentIndex + 1) % colors.length;
            branchColors.set(branchId, colors[nextColorIndex]);
          } else {
            // Usa o próximo slot de cor
            branchColors.set(branchId, colors[branchId % colors.length]);
          }
        }
        const color = branchColors.get(branchId)!;

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
            survives = false;
            break;
        }

        segments.push({ col, nextCol, color, char });

        if (survives) {
          if (!nextActive.has(nextCol)) {
            nextActive.set(nextCol, { id: branchId });
          }
          // Se já existe (merge), mantém o ramo principal
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
              {/* Linhas e curvas */}
              <For each={row.segments}>
                {(seg) => {
                  const x = seg.col * colWidth + xOffset;
                  const xNext = seg.nextCol * colWidth + xOffset;

                  if (seg.col === seg.nextCol) {
                    // Linha vertical
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
                    // Curva suave
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

              {/* Círculo do commit */}
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