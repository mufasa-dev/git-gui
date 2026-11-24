export type Diff = {
    diff: string;
    oldFile?: string;
    newFile?: string;
    size?: number;
    lineCount?: number | null;
    isBinary?: boolean;
    isPreviewable?: boolean;
    truncated?: boolean;
    hasConflict?: boolean;
    reason?: string;
    lineEndingOnly?: boolean;
    eol?: { index: string; worktree: string } | null;
}