import { ParsedEvent } from "../../models/ProjectType.model";

interface KarmaSpecResult {
  id?: string;
  suite?: string[];
  description?: string;
  success?: boolean;
  time?: number;
  filePath?: string;
  log?: string[];
}

export const angularParser = (line: string, buffer: string[]): ParsedEvent => {
  const marker = 'SPEC_RESULT|';
  const markerIndex = line.indexOf(marker);

  if (markerIndex !== -1) {
    const payload = line.slice(markerIndex + marker.length);

    try {
      const result = JSON.parse(payload) as KarmaSpecResult;
      const suite = result.suite?.filter(Boolean).join(' > ') || 'Unknown Suite';
      const description = result.description?.trim() || 'Unnamed test';
      const status = result.success ? 'pass' : 'fail';

      return {
        type: 'RESULT',
        data: {
          name: `${suite} > ${description}`,
          status,
          filePath: result.filePath?.trim(), // O arquivo
          duration: result.time !== undefined ? `${result.time}` : undefined, // O tempo (ms)
          resultId: result.id,
          log: status === 'fail' ? [...(result.log || buffer)] : []
        }
      };
    } catch {
      const parts = payload.split('|');
      const suite = parts[0]?.trim() || 'Unknown Suite';
      const description = parts[1]?.trim() || 'Unnamed test';
      const status = parts[2]?.trim() === 'PASS' ? 'pass' : 'fail';

      return {
        type: 'RESULT',
        data: {
          name: `${suite} > ${description}`,
          status,
          filePath: parts[3]?.trim(), // O arquivo
          duration: parts[4]?.trim(), // O tempo (ms)
          log: status === 'fail' ? [...buffer] : []
        }
      };
    }
  }

  if (line.includes("TOTAL:") || line.includes("Done")) return { type: 'FINISH' };

  const isSystem = line.includes("INFO [") || line.includes("Connected");
  return isSystem ? { type: 'IGNORE' } : { type: 'LOG' };
};