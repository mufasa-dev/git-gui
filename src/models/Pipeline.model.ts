export interface UnifiedPipelineRun {
  id: string | number;
  number: string | number;
  name: string;
  status: string; 
  result: string; 
  url: string;    
  sourceBranch: string;
  startTime: string;
  triggerType?: string; // "manual" | "ci"
  author?: {
    name: string;
    avatarUrl: string;
  };
  commitId?: string;
}

export interface PipelineDefinition {
  id: string | number;
  name: string;
  folder: string;
}