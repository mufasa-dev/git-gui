import { For, Show } from "solid-js";

interface CommitGraphProps {
  commits: any[];
  rowHeight: number;
}

export default function CommitGraph(props: CommitGraphProps) {
  const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  const colWidth = 12; // Largura de cada "canal" do git
  const xOffset = 20;

  return (
    <svg 
      width="120" 
      height={props.commits.length * props.rowHeight} 
      class="pointer-events-none overflow-visible"
    >
      <For each={props.commits}>
        {(commit, i) => {
          const yMid = i() * props.rowHeight + props.rowHeight / 2;
          const yTop = i() * props.rowHeight;
          const yBot = (i() + 1) * props.rowHeight;
          
          // Tratamos a string como um array de células
          const chars = (commit.graph_symbol || "").split("");

          return (
            <g>
              {chars.map((char: string, col: number) => {
                const x = col * colWidth + xOffset;
                const color = colors[Math.floor(col / 2) % colors.length];

                if (char === " ") return null;

                return (
                  <g>
                    {/* 1. CONTINUIDADE VERTICAL (| ou *) */}
                    {/* Se houver um pipe ou um commit, a linha vertical DEVE passar por essa célula */}
                    {(char === "|" || char === "*") && (
                      <line 
                        x1={x} y1={yTop} 
                        x2={x} y2={yBot} 
                        stroke={color} 
                        stroke-width="2.5" 
                        stroke-linecap="round"
                      />
                    )}

                    {/* 2. RAMIFICAÇÃO PARA A DIREITA (\) */}
                    {/* Quando o git envia '\', ele conecta o canal atual com o da direita no próximo nível */}
                    {char === "\\" && (
                      <path 
                        d={`M ${x} ${yTop} L ${x + colWidth} ${yBot}`}
                        fill="none" stroke={color} stroke-width="2.5" stroke-linecap="round"
                      />
                    )}

                    {/* 3. MERGE PARA A ESQUERDA (/) */}
                    {/* Quando o git envia '/', ele conecta o canal atual com o da esquerda no próximo nível */}
                    {char === "/" && (
                      <path 
                        d={`M ${x} ${yTop} L ${x - colWidth} ${yBot}`}
                        fill="none" 
                        stroke={colors[Math.floor((col - 1) / 2) % colors.length] || color} 
                        stroke-width="2.5" 
                        stroke-linecap="round"
                      />
                    )}

                    {/* 4. O NÓ DO COMMIT */}
                    <Show when={char === "*"}>
                      <circle 
                        cx={x} cy={yMid} r="5" 
                        fill={color} 
                        stroke="#f3f4f6" /* DEVE ser a cor de fundo do seu card de commit */
                        stroke-width="2" 
                      />
                    </Show>
                  </g>
                );
              })}
            </g>
          );
        }}
      </For>
    </svg>
  );
}