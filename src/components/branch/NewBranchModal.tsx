import { createSignal, createMemo, createEffect } from "solid-js";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useApp } from "../../context/AppContext";

type Props = {
  open: boolean;
  repoPath?: string;
  branches: string[];
  onCancel: () => void;
  onCreate: (branchName: string, branchType: string, checkout: boolean, baseBranch: string) => void;
  refreshBranches: (repoPath: string) => Promise<void>;
};

export default function BranchSwitchModal(props: Props) {
  const [branchName, setBranchName] = createSignal("");
  const [branchType, setBranchType] = createSignal("branch");
  const [checkout, setCheckout] = createSignal(true);
  const [baseBranch, setBaseBranch] = createSignal("main");
  const { t } = useApp();

  const typeOptions = [
    { value: "branch", label: "Branch" },
    { value: "feature", label: "Feature" },
    { value: "hotfix", label: "Hotfix" },
    { value: "release", label: "Release" },
  ];

  const branchOptions = createMemo(() => {
    return props.branches.map(b => ({
      value: b,
      label: b
    }));
  });

  const preferredBaseBranch = createMemo(() => {
    const mainBranch = props.branches.find(branch => branch.toLowerCase() === "main");
    if (mainBranch) return mainBranch;

    const masterBranch = props.branches.find(branch => branch.toLowerCase() === "master");
    return masterBranch || props.branches[0] || "main";
  });

  createEffect(() => {
    const availableBranches = props.branches;
    const preferred = preferredBaseBranch();
    if (availableBranches.length > 0 && !availableBranches.includes(baseBranch())) {
      setBaseBranch(preferred);
    }
  });

  return (
    <Dialog
      open={props.open}
      title={t('git').new_branch}
      icon="fa-solid fa-code-branch"
      iconColor="text-blue-600 dark:text-blue-300"
      onClose={props.onCancel}
      width="min(520px, 92vw)"
      bodyClass="p-0"
    >
      <div class="rounded-b-xl text-gray-700 dark:text-gray-200">
        <div class="relative overflow-hidden border-b border-gray-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-5 dark:border-gray-700 dark:from-blue-950/40 dark:via-gray-800 dark:to-indigo-950/30">
          <div class="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl"></div>
          <div class="relative flex items-start gap-4">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-100 text-blue-600 shadow-sm dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
              <i class="fa-solid fa-code-branch text-lg"></i>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
                {t('git').new_branch}
              </p>
              <p class="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                {t('git').new_branch_description}
              </p>
            </div>
          </div>
        </div>

        <div class="space-y-5 p-6">
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              <i class="fa-solid fa-pen-to-square text-blue-500"></i>
              {t('git').name_branch}
            </label>
            <input
              type="text"
              class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:bg-gray-900"
              placeholder={t("common").example + ": login-page"}
              value={branchName()}
              onInput={(e) => {
                const sanitized = e.currentTarget.value
                  .replace(/\s/g, "_")
                  .replace(/[~^:?*\[\\]/g, "");

                e.currentTarget.value = sanitized;
                setBranchName(sanitized);
              }}
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                <i class="fa-solid fa-layer-group text-blue-500"></i>
                {t('common').type}
              </label>
              <SearchableSelect
                options={typeOptions}
                initialValue={branchType()}
                onSelect={(val) => setBranchType(val)}
                class="w-full"
              />
            </div>

            <div class="space-y-2">
              <label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                <i class="fa-solid fa-code-branch text-blue-500"></i>
                {t('git').base_branch}
              </label>
              <SearchableSelect
                options={branchOptions()}
                initialValue={baseBranch()}
                placeholder="Selecione a branch base..."
                onSelect={(val) => setBaseBranch(val)}
                class="w-full"
              />
            </div>
          </div>

          <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-900/40 dark:hover:border-blue-700 dark:hover:bg-blue-950/20">
            <input
              type="checkbox"
              id="checkout"
              class="h-4 w-4 cursor-pointer accent-blue-600"
              checked={checkout()}
              onChange={(e) => setCheckout(e.currentTarget.checked)}
            />
            <span class="flex-1">
              <span class="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                {t('git').checkout_new_branch}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">
                {t('git').checkout_new_branch_description}
              </span>
            </span>
            <i class="fa-solid fa-arrow-right-to-bracket text-blue-500"></i>
          </label>
        </div>

        <div class="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
          <Button
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400"
            onClick={props.onCancel}
          >
            {t('common').cancel}
          </Button>
          <Button
            class="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-500 hover:shadow-md active:scale-[0.98]"
            onClick={() => props.onCreate(branchName(), branchType(), checkout(), baseBranch())}
          >
            <i class="fa-solid fa-code-branch"></i>
            {t('git').create_branch}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
