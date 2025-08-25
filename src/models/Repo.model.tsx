export type Repo = {
  path: string;
  name: string;
  branches: string[];
  remoteBranches?: string[];
};