import { Branch } from "./Banch.model";

export type Repo = {
  path: string;
  name: string;
  branches: Branch[];
  activeBranch?: string;
  remoteBranches?: string[];
};