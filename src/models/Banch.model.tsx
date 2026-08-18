export type Branch = {
  name: string;
  ahead: number;
  behind: number;
};

export type BranchFileContentResponse = {
    isImage: boolean;
    isBinary: boolean;
    isPreviewable: boolean;
    content: string;
    size: number;
    lineCount: number | null;
    truncated: boolean;
}

export type BranchFileMetadataResponse = {
    isBinary: boolean;
    isPreviewable: boolean;
    size: number;
}