import { GitProvider } from "../utils/gitProvider";

export type PRMergeState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | 'BLOCKED' | 'STALE';

export type PRRepositoryContext = {
  provider: GitProvider;
  owner?: string;
  organization?: string;
  project?: string;
  name: string;
  webUrl?: string;
};

export interface UnifiedPR {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  updatedAt?: string;
  url?: string;
  author: {
    login: string;
    avatarUrl: string;
    name?: string;
  };
  headRefName: string;
  baseRefName: string;
  headRefOid?: string;
  baseRefOid?: string;
  headRepository?: PRRepositoryContext;
  comments?: { totalCount: number };
  changedFiles?: number;
  additions?: number;
  deletions?: number;
  mergeable?: PRMergeState;
  mergeableReason?: string;
  viewerCanMerge?: boolean;
  viewerCanUpdateBranch?: boolean;
}

export interface PRValidationResult {
  hasChanges: boolean;
  alreadyExists: boolean;
  existingPrId?: string | number;
  commits: Array<{ id: string; message: string; author: string }>;
  files: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
}

export interface ReviewerItem {
  id: string;
  login: string;
  avatarUrl?: string;
  isRequired: boolean;
}
