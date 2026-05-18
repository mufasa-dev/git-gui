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

    let globalMaxCol = 0;

    const rows = commits.map((commit, i) => {
      const rawSymbol = (commit.graph_symbol || "").replace(/ /g, "");
      const cleanChars = rawSymbol.split("");
      
      const nextCommitRaw = commits[i + 1]?.graph_symbol?.replace(/ /g, "") || "";
      const prevCommitRaw = commits[i - 1]?.graph_symbol?.replace(/ /g, "") || "";
      
      const currentColCount = cleanChars.length;
      const nextColCount = nextCommitRaw.length;
      const prevColCount = prevCommitRaw.length;

      const segments: { col: number; nextCol: number; color: string; isBranch: boolean; isMerge: boolean }[] = [];
      let commitCol: number | null = null;

      for (let col = 0; col < currentColCount; col++) {
        const char = cleanChars[col];
        if (char === "*") commitCol = col;

        let nextCol = col;
        let isMerge = false;
        let isBranch = false;

        // 1. Detecção e cálculo estrutural do Branching (\)
        if (nextColCount > currentColCount && col === currentColCount - 1) {
          isBranch = true;
          // Não muda nextCol da linha principal, mas adicionaremos um segmento extra abaixo
        } 
        
        // 2. Detecção e cálculo estrutural do Merging (/)
        if (prevColCount > currentColCount && col === currentColCount - 1) {
          isMerge = true;
          // Injeta a curva de merge vindo de col+1 para col (nextCol é herdado do loop principal)
        }

        if (col > globalMaxCol) globalMaxCol = col;
        if (nextCol > globalMaxCol) globalMaxCol = nextCol;

        // Adiciona a linha principal (reta, a menos que o merge mude nextCol no loop principal)
        segments.push({
          col,
          nextCol,
          color: colors[nextCol % colors.length], // Cor estável do destino para a linha principal
          isBranch: false, // Esta é a linha principal, não o novo ramo
          isMerge: false // Esta é a linha principal que recebe o merge, não a perna de curva
        });

        // Adiciona o segmento extra de branch (\) vindo da última coluna
        if (isBranch) {
          const targetCol = col + 1;
          segments.push({ 
            col, 
            nextCol: targetCol, 
            color: colors[targetCol % colors.length], // Nova cor para o novo ramo
            isBranch: true,
            isMerge: false
          });
        }

        // Adiciona o segmento extra de merge (/) vindo da coluna externa para a última atual
        if (isMerge) {
          const originCol = col + 1;
          // Lógica de cor para Merge (/): Usa a PRÓXIMA cor do array baseada na coluna de origem
          const mergeColorIndex = (originCol + 0) % colors.length;
          
          segments.push({
            col: originCol,
            nextCol: col,
            color: colors[mergeColorIndex], // Pega explicitamente a próxima cor
            isBranch: false,
            isMerge: true
          });
        }
      }

      return { segments, commitCol };
    });

    return { rows, maxCol: globalMaxCol };
  });

  const svgWidth = createMemo(() => {
    return (graphData().maxCol + 1) * (colWidth - 3) + xOffset * 2;
  });

  return (
    <svg width={svgWidth()} height="100%" class="pointer-events-none overflow-visible flex-shrink-0">
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

                  // Se a coluna não muda, desenha linha reta do topo até a base da célula
                  if (seg.col === seg.nextCol) {
                    return (
                      <line 
                        x1={x} y1={yTop} 
                        x2={x} y2={yBot} 
                        stroke={seg.color} stroke-width="2" stroke-linecap="round"
                      />
                    );
                  } 
                  
                  // Configuração de Origem/Destino para a curva
                  let xOrigin = x;
                  let yOrigin = yTop;
                  let xDest = xNext;
                  let yDest = yBot;

                  // Lógica de Saída/Entrada centralizada solicitada
                  if (seg.isBranch) {
                    // Saída (\): A linha nasce do centro da trilha vertical atual
                    yOrigin = yMid;
                  }
                  if (seg.isMerge) {
                    // Entrada (/): A linha termina no centro da trilha vertical receptora (baleadinha)
                    yDest = yMid;
                  }

                  // Desenha a curva de transição (\ ou /) com os pontos de controle ajustados
                  // C <xControl1> <yControl1>, <xControl2> <yControl2>, <xDest> <yDest>
                  return (
                    <path 
                      d={`M ${xOrigin} ${yOrigin} C ${xOrigin} ${yMid}, ${xDest} ${yMid}, ${xDest} ${yDest}`}
                      fill="none" stroke={seg.color} stroke-width="2" stroke-linecap="round"
                    />
                  );
                }}
              </For>

              {row.commitCol !== null && (
                <circle 
                  cx={row.commitCol * colWidth + xOffset} 
                  cy={yMid} 
                  r={circleRadius}
                  // Círculo com a cor estável da coluna onde o commit está
                  fill={colors[row.commitCol % colors.length]} 
                  stroke="white" 
                  stroke-width="1.5"
                />
              )}
            </g>
          );
        }}
      </For>
    </svg>
  );
}