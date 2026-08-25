export type LocalChange = {
    path: string;
    status: string;
    staged: boolean;
    extension?: string;
    size?: number;
    lineCount?: number | null;
    isBinary?: boolean;
    isPreviewable?: boolean;
}