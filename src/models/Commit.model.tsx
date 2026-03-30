export interface Commit {
  hash: string;
  message: string;
  author: string;
  email: string;
  date: string;
}

export interface CommitDetail extends Commit {
  authorName: string;
  authorEmail: string;
  authorDate: string;
  subject: string;
  body: string;
  parents: string[];
  files: CommitFile[];
}

export interface CommitFile {
  file: string;
  status: string; // M, A, D, R...
  changes: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  lastCommit: Commit;
}