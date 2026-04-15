import { ParsedEvent } from "../../models/ProjectType.model";

export const angularParser = (line: string, buffer: string[]): ParsedEvent => {
  if (line.includes('SPEC_RESULT|')) {
    const parts = line.split('|');
    console.log('line', line)
    return {
      type: 'RESULT',
      data: {
        name: `${parts[1]} > ${parts[2]}`,
        status: parts[3]?.trim() === 'PASS' ? 'pass' : 'fail',
        filePath: parts[4]?.trim(), // O arquivo
        duration: parts[5]?.trim(), // O tempo (ms)
        log: parts[3]?.trim() === 'FAIL' ? [...buffer] : []
      }
    };
  }

  if (line.includes("TOTAL:") || line.includes("Done")) return { type: 'FINISH' };
  
  const isSystem = line.includes("INFO [") || line.includes("Connected");
  return isSystem ? { type: 'IGNORE' } : { type: 'LOG' };
};