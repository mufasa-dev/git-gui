import Dialog from "../ui/Dialog";

type ViewMode = "tree" | "list";

type Props = {
  open: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onClose: () => void;
  t: any;
};

export default function LocalChangesSettingsModal(props: Props) {
  const isTreeView = () => props.viewMode === "tree";

  return (
    <Dialog
      open={props.open}
      title={props.t('git').settings}
      onClose={props.onClose}
      width="min(520px, 92vw)"
      bodyClass="p-0"
    >
      <div class="overflow-hidden rounded-b-xl text-gray-700 dark:text-gray-200">
        <div class="relative overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-5 dark:from-blue-950/40 dark:via-gray-800 dark:to-indigo-950/30">
          <div class="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl"></div>
          <div class="relative flex items-start gap-4">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 text-blue-600 shadow-sm dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
              <i class="fa-solid fa-sliders text-lg"></i>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                {props.t('file').updates}
              </p>
              <p class="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                {props.t('git').settings_description}
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-4 p-6">
          <div>
            <div class="mb-1 text-sm font-bold text-gray-900 dark:text-white">
              {props.t('git').view_mode}
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {props.t('git').choose_view}
            </p>
          </div>

          <div class="grid gap-3" role="radiogroup" aria-label={props.t('git').view_mode}>
            <label
              class="group flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all duration-200"
              classList={{
                "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30": isTreeView(),
                "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20": !isTreeView(),
              }}
            >
              <input
                class="sr-only"
                type="radio"
                name="local-changes-view-mode"
                value="tree"
                checked={isTreeView()}
                onChange={() => props.onViewModeChange("tree")}
              />
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                classList={{
                  "bg-blue-600 text-white shadow-sm": isTreeView(),
                  "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300": !isTreeView(),
                }}
              >
                <i class="fa-solid fa-folder-tree"></i>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-gray-900 dark:text-white">
                  {props.t('git').tree_view}
                </span>
                <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {props.t('git').tree_view_description}
                </span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                classList={{
                  "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400": isTreeView(),
                  "border-gray-300 dark:border-gray-600": !isTreeView(),
                }}
              >
                <i class="fa-solid fa-check text-[10px]" classList={{ hidden: !isTreeView() }}></i>
              </span>
            </label>

            <label
              class="group flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-all duration-200"
              classList={{
                "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30": !isTreeView(),
                "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20": isTreeView(),
              }}
            >
              <input
                class="sr-only"
                type="radio"
                name="local-changes-view-mode"
                value="list"
                checked={!isTreeView()}
                onChange={() => props.onViewModeChange("list")}
              />
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                classList={{
                  "bg-blue-600 text-white shadow-sm": !isTreeView(),
                  "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300": isTreeView(),
                }}
              >
                <i class="fa-solid fa-list"></i>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-gray-900 dark:text-white">
                  {props.t('git').list_view}
                </span>
                <span class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  {props.t('git').list_view_description}
                </span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                classList={{
                  "border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400": !isTreeView(),
                  "border-gray-300 dark:border-gray-600": isTreeView(),
                }}
              >
                <i class="fa-solid fa-check text-[10px]" classList={{ hidden: isTreeView() }}></i>
              </span>
            </label>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
          <span class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <i class="fa-solid fa-circle-check text-emerald-500"></i>
            {props.t('git').settings_saved}
          </span>
          <button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:text-blue-300"
            onClick={props.onClose}
          >
            {props.t('common').close}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
