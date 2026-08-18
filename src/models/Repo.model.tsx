import { Branch } from "./Banch.model";
import { LocalChange } from "./LocalChanges.model";
import { Stash } from "./Stash.model";
import { Tag } from "./Tag.model";

export type Repo = {
  path: string;
  name: string;
  branches: Branch[];
  activeBranch?: string;
  remoteBranches?: string[];
  localChanges?: LocalChange[];
  stashes?: Stash[];
  tags?: Tag[];
};