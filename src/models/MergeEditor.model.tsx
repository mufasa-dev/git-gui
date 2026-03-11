type MergeLineType = "normal" | "current" | "incoming" | "separator" | "header";

interface MergeEditorLine {
  content: string;
  type: MergeLineType;
  conflictId?: string;
}