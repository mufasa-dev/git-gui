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
    console.log('Parsed Go event:', event);

    // ALTERAÇÃO AQUI: Só processa se event.Test existir E começar com "Test"
    if (event.Action === 'output' || !event.Test || !event.Test.startsWith('Test')) {
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
        suiteName = parts[0]; 
        testName = parts.slice(1).join('/'); 
      } else {
        // Se não tem barra, é a função de teste principal (ex: "TestUserRepository")
        // que mapeamos como a própria Suite/Arquivo na listagem física
        suiteName = event.Test;
        testName = event.Test;
      }

      return {
        type: 'RESULT',
        data: {
          name: `${suiteName.trim()} > ${testName.trim()}`,
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