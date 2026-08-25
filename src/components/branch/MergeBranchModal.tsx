import Dialog from "../ui/Dialog";

type Props = {
  open: boolean;
  sourceBranch: string;
  targetBranch: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function MergeBranchModal(props: Props) {
  return (
    <Dialog
      open={props.open}
      title="Confirmar merge"
      icon="fa-solid fa-code-merge"
      iconColor="text-blue-600 dark:text-blue-300"
      width="460px"
      panelClass="overflow-hidden"
      onClose={props.onCancel}
    >
      <div class="space-y-5">
        <div>
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">
            Mesclar esta branch?
          </h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A branch de origem será mesclada na branch de destino. Essa ação altera o histórico da branch de destino.
          </p>
        </div>

        <div class="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/60">
          <div class="min-w-0 flex-1">
            <span class="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Origem
            </span>
            <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-gray-800">
              <i class="fa-solid fa-code-branch shrink-0 text-blue-500"></i>
              <span class="truncate font-semibold text-gray-800 dark:text-gray-100" title={props.sourceBranch}>
                {props.sourceBranch}
              </span>
            </div>
          </div>

          <i class="fa-solid fa-arrow-right shrink-0 text-lg text-blue-500" aria-hidden="true"></i>

          <div class="min-w-0 flex-1">
            <span class="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Destino
            </span>
            <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-gray-800">
              <i class="fa-solid fa-code-branch shrink-0 text-emerald-500"></i>
              <span class="truncate font-semibold text-gray-800 dark:text-gray-100" title={props.targetBranch}>
                {props.targetBranch}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <i class="fa-solid fa-circle-info mt-0.5 shrink-0"></i>
          <span>A branch de destino será selecionada automaticamente para realizar o merge.</span>
        </div>

        <div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={props.onCancel}
            class="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500 active:scale-95"
          >
            <i class="fa-solid fa-code-merge mr-2"></i>
            Confirmar merge
          </button>
        </div>
      </div>
    </Dialog>
  );
}
