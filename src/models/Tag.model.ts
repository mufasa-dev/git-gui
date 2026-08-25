export type TagKind = "lightweight" | "annotated";

export type Tag = {
  name: string;
  targetCommit: string;
  shortCommit: string;
  kind: TagKind;
  message: string;
  tagger: string;
  createdAt: string;
};
