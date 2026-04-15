export type ProjectType = {
    framework: string;
    testRunner: string;
}

export interface ParsedEvent {
  type: 'RESULT' | 'LOG' | 'FINISH' | 'IGNORE';
  data?: {
    name?: string;
    status?: 'pass' | 'fail';
    filePath?: string;
    duration?: string;
    log?: string[];
  };
}