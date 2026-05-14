import { ParsedEvent } from "../../models/ProjectType.model";

interface GoTestEvent {
  Action: 'run' | 'pause' | 'cont' | 'pass' | 'bench' | 'fail' | 'output' | 'skip';
  Package: string;
  Test?: string;
  Elapsed?: number;
  Output?: string;
}

export const goParser = (line: string): ParsedEvent => {
  try {
    const event: GoTestEvent = JSON.parse(line);

    if (event.Action === 'output' || !event.Test) {
      return { type: 'LOG' };
    }

    // Só processamos resultados finais de testes ou subtestes
    if (event.Action === 'pass' || event.Action === 'fail' || event.Action === 'skip') {
      
      let suiteName = "";
      let testName = "";

      // Lógica para separar Suite de Subteste
      if (event.Test.includes('/')) {
        // Ex: "TestSubscribeToNewsletter/Falha_ao_se_inscrever"
        const parts = event.Test.split('/');
        suiteName = parts[0]; // "TestSubscribeToNewsletter"
        testName = parts.slice(1).join(' / '); // "Falha_ao_se_inscrever"
      } else {
        // Se não tem barra, é o teste pai. 
        // Para não duplicar na lista, podemos colocar o nome do pacote simplificado como suíte
        const packageParts = event.Package.split('/');
        suiteName = packageParts[packageParts.length - 1]; // ex: "repository"
        testName = event.Test;
      }

      return {
        type: 'RESULT',
        data: {
          // Resultado final: "TestSubscribeToNewsletter > Falha_ao_se_inscrever"
          name: `${suiteName} > ${testName}`,
          status: event.Action === 'pass' ? 'pass' : (event.Action === 'skip' ? 'skip' : 'fail'),
          duration: event.Elapsed ? `${(event.Elapsed * 1000).toFixed(2)}ms` : '0ms',
          log: []
        }
      };
    }
  } catch (e) {
    return { type: 'LOG' };
  }

  return { type: 'LOG' };
};