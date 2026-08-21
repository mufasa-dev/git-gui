export type TestRunnerOption = {
  id: string;
  label: string;
  kind: 'angular' | 'go' | 'dotnet' | 'vitest' | 'rust' | string;
  framework: string;
  targetPath?: string | null;
};

export type ProjectType = {
  framework: string;
  testRunner: string;
  runners: TestRunnerOption[];
};

export interface ParsedEvent {
  type: 'RESULT' | 'LOG' | 'FINISH' | 'IGNORE';
  data?: {
    name?: string;
    status?: 'pass' | 'fail' | 'skip';
    filePath?: string;
    duration?: string;
    resultId?: string;
    executionName?: string;
    log?: string[];
  };
}
