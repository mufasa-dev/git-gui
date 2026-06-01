import { createSignal } from "solid-js";
import Dialog from "../ui/Dialog";

type AzureMergeOptions = {
  mergeStrategy: string;
  deleteSourceBranch: boolean;
  completeWorkItems: boolean;
  customizeMessage: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: AzureMergeOptions) => void;
  sourceBranch: string;
  isMerging: boolean;
};

export default function AzureMergeDialog(props: Props) {
  const [mergeStrategy, setMergeStrategy] = createSignal("noFastForward");
  const [deleteSourceBranch, setDeleteSourceBranch] = createSignal(true);
  const [completeWorkItems, setCompleteWorkItems] = createSignal(true);
  const [customizeMessage, setCustomizeMessage] = createSignal(false);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    props.onConfirm({
      mergeStrategy: mergeStrategy(),
      deleteSourceBranch: deleteSourceBranch(),
      completeWorkItems: completeWorkItems(),
      customizeMessage: customizeMessage(),
    });
  };

  return (
    <Dialog
      open={props.open}
      title="Complete pull request"
      width="480px"
      onClose={props.onClose}
    >
      <form onSubmit={handleSubmit} class="flex flex-col gap-5 text-gray-800 dark:text-gray-200 text-sm">
        
        {/* Merge Type Select */}
        <div class="flex flex-col gap-1.5">
          <label class="font-medium text-gray-600 dark:text-gray-400">Merge type</label>
          <select
            value={mergeStrategy()}
            onChange={(e) => setMergeStrategy(e.currentTarget.value)}
            class="w-full input-select p-2"
          >
            <option value="noFastForward">Merge (no fast forward)</option>
            <option value="squash">Squash merge</option>
            <option value="rebase">Rebase and fast-forward</option>
            <option value="rebaseMerge">Semi-linear merge</option>
          </select>
        </div>

        {/* Mini Gráfico Visual Estilo Azure */}
        <div class="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg flex items-center justify-center border border-gray-100 dark:border-gray-800">
          <span class="text-xs text-gray-400 font-mono">
            {mergeStrategy() === "noFastForward" && "───●───●─── (main) \\n  \\─●───●─/ (branch)"}
            {mergeStrategy() === "squash" && "───●───●───● (main, single squash commit)"}
            {mergeStrategy() === "rebase" && "───●───●───●───● (linear history)"}
            {mergeStrategy() === "rebaseMerge" && "───●───●───● (semi-linear)"}
          </span>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-700 pt-3">
          <span class="font-medium text-gray-600 dark:text-gray-400 block mb-2">Post-completion options</span>
          
          <div class="flex flex-col gap-3">
            {/* Checkbox: Work Items */}
            <label class="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={completeWorkItems()}
                onChange={(e) => setCompleteWorkItems(e.currentTarget.checked)}
                class="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span>Complete associated work items after merging</span>
            </label>

            {/* Checkbox: Delete Branch */}
            <label class="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteSourceBranch()}
                onChange={(e) => setDeleteSourceBranch(e.currentTarget.checked)}
                class="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span class="break-all">Delete <span class="font-semibold text-blue-500 dark:text-blue-400">{props.sourceBranch}</span> after merging</span>
            </label>

            {/* Checkbox: Customize Commit Message */}
            <label class="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={customizeMessage()}
                onChange={(e) => setCustomizeMessage(e.currentTarget.checked)}
                class="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span>Customize merge commit message</span>
            </label>
          </div>
        </div>

        {/* Rodapé com botões de ação */}
        <div class="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.isMerging}
            class="px-4 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={props.isMerging}
            class="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-95 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {props.isMerging ? (
              <>
                <i class="fa-solid fa-spinner animate-spin"></i>
                Merging...
              </>
            ) : (
              "Complete merge"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}