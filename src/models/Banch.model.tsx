export type Branch = {
  name: string;
  ahead: number;
  behind: number;
};

export type BranchFileContentResponse = {
    isImage: boolean;
    content: string;
    size: number;
    lineCount: number;
}