import { ParsedEvent } from "../../models/ProjectType.model";

interface GoTestEvent {
  Time: string;
  Action: 'run' | 'pause' | 'cont' | 'pass' | 'bench' | 'fail' | 'output' | 'skip';
  Package: string;
  Test?: string;
  Elapsed?: number; // em segundos
  Output?: string;
}

export const goParser = (line: string): ParsedEvent => {
  try {
    const event: GoTestEvent = JSON.parse(line);
    console.log('line', line)
    // Se for apenas uma saída de log (texto)
    if (event.Action === 'output' && event.Output) {
      return { type: 'LOG' };
    }

    // Só processamos se houver um nome de teste específico (event.Test)
    // para evitar as linhas de resumo do pacote (Package)
    if (event.Test && (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip')) {
      return {
        type: 'RESULT',
        data: {
          name: `${event.Package} > ${event.Test}`,
          status: event.Action === 'pass' ? 'pass' : (event.Action === 'skip' ? 'skip' : 'fail'),
          duration: event.Elapsed ? `${(event.Elapsed * 1000).toFixed(2)}ms` : '0ms',
          log: []
        }
      };
    }

    // Finalização do processo global
    if (!event.Test && (event.Action === 'pass' || event.Action === 'fail')) {
        // Opcional: tratar aqui se quiser mostrar o status global do pacote
    }

  } catch (e) {
    // Se não for JSON (erro de compilação ou log do sistema), trata como log
    return { type: 'LOG' };
  }

  return { type: 'LOG' };
};