import { ParsedEvent } from "../../models/ProjectType.model";

let lastDetectedSuite = "Geral";

export const dotnetParser = (line: string): ParsedEvent => {
  const cleanLine = line.trim();
  console.log('line', cleanLine)
  // 1. Detectar mudança de Suíte/Projeto no log do xUnit
  if (cleanLine.includes("Starting:") || cleanLine.includes("Discovering:")) {
    const parts = cleanLine.split(':');
    const fullPath = parts[parts.length - 1].trim();
    // Pega os últimos dois segmentos (ex: Domain.Test)
    lastDetectedSuite = fullPath.split('.').slice(-2).join('.');
    return { type: 'LOG' };
  }

  // 2. Tentar capturar o resultado do teste
  const resultMatch = cleanLine.match(/^(Aprovado|Passed|Reprovado|Failed)\s+(.+)\s+\[(.+?)\]/i);

  if (resultMatch) {
    const isPass = !cleanLine.toLowerCase().includes('failed') && !cleanLine.toLowerCase().includes('reprovado');
    const rawName = resultMatch[2].trim();
    const duration = resultMatch[3].trim();

    let suiteName = lastDetectedSuite;
    let methodName = rawName;

    // Se a linha contiver a classe (ex: Classe.Metodo ou Namespace.Classe.Metodo)
    if (rawName.includes('.') && !rawName.includes('(')) {
      const parts = rawName.split('.');
      methodName = parts.pop()!;
      suiteName = parts.pop()!; // Pega a Classe
    } 
    // Heurística para o seu caso específico:
    // Se o nome do teste começa com algo como "KanbanItems_", assume que a classe é KanbanItems
    else if (rawName.includes('_')) {
        suiteName = rawName.split('_')[0];
        methodName = rawName.split('_').slice(1).join('_');
    }
    // Se o teste for um método direto (Ex: "Delete - Deve falhar")
    else if (rawName.includes(' - ')) {
        suiteName = rawName.split(' - ')[0];
        methodName = rawName.split(' - ')[1];
    }

    return {
      type: 'RESULT',
      data: {
        name: `${suiteName} > ${methodName}`,
        status: isPass ? 'pass' : 'fail',
        duration,
        log: []
      }
    };
  }

  return { type: 'LOG' };
};