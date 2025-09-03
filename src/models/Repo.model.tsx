import { Branch } from "./Banch.model";
import { LocalChange } from "./LocalChanges.model";

export type Repo = {
  path: string;
  name: string;
  branches: Branch[];
  activeBranch?: string;
  remoteBranches?: string[];
  localChanges?: LocalChange[];
};