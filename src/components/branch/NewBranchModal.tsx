import { createSignal, For } from "solid-js";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

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

  return (
    <Dialog open={props.open} title="Nova Branch" onClose={props.onCancel}>
        <div>
          <label>Nome da branch:</label>
          <input type="text" class="w-full input-text" placeholder="Nome da nova branch"
            value={branchName()}
            onInput={(e) => setBranchName(e.currentTarget.value)} />
        </div>

        <div>
          <label>Tipo:</label>
          <select class="w-full input-select" value={branchType()} onChange={(e) => setBranchType(e.currentTarget.value)}>
            <option value="branch">Branch</option>
            <option value="feature">Feature</option>
            <option value="hotfix">Hotfix</option>
            <option value="release">Release</option>
          </select>
        </div>

        <div>
          <label>Base:</label>
          <select
            class="w-full input-select"
            value={baseBranch()}
            onChange={(e) => setBaseBranch(e.currentTarget.value)}
          >
            <For each={props.branches}>
              {(b) => <option value={b}>{b}</option>}
            </For>
          </select>
        </div>

        <div class="mt-2">
          <input
            type="checkbox" id="checkout" name="checkout"
            checked={checkout()} onChange={(e) => setCheckout(e.currentTarget.checked)}
          />
          <label for="checkout" class="ml-1">Fazer checkout para a nova branch</label>
        </div>

        <div class="flex gap-2 mt-4">
          <Button
            class="border rounded border-gray-400 dark:border-gray-700 flex-1"
            onClick={props.onCancel}
          >
            Cancelar
          </Button>

          <Button
            class="btn-primary ml-2 flex-1"
            onClick={() => props.onCreate(branchName(), branchType(), checkout(), baseBranch())}
          >
            Criar
          </Button>

        </div>
    </Dialog>
  );
}
