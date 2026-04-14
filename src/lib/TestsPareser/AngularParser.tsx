import { ParsedEvent } from "../../models/ProjectType.model";

export const angularParser = (line: string, buffer: string[]): ParsedEvent => {
  if (line.includes('SPEC_RESULT|')) {
    const parts = line.split('|');
    const status = parts[3]?.trim();
    return {
      type: 'RESULT',
      data: {
        name: `${parts[1]} > ${parts[2]}`,
        status: status === 'PASS' ? 'pass' : 'fail',
        log: status === 'FAIL' ? [...buffer] : []
      }
    };
  }

  if (line.includes("TOTAL:") || line.includes("Done")) return { type: 'FINISH' };
  
  const isSystem = line.includes("INFO [") || line.includes("Connected");
  return isSystem ? { type: 'IGNORE' } : { type: 'LOG' };
};