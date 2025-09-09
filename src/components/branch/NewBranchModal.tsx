import { createSignal } from "solid-js/types/server/reactive.js";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

type Props = {
  open: boolean;
  branch: string;
  onCancel: () => void;
  onCreate: (branchName: string, branchType: string, checkout: boolean) => void;
};

export default function BranchSwitchModal(props: Props) {
  const [branchName, setBranchName] = createSignal("");
  const [branchType, setBranchType] = createSignal("local");
  const [checkout, setCheckout] = createSignal(true);

  return (
    <Dialog open={props.open} title="Mudar de Branch" onClose={props.onCancel}>
        <h2 class="text-lg font-semibold">
          Nova Branch
        </h2>
        <div>
          <label>Nome:</label>
          <input type="text" class="w-full input-text" placeholder="Mensagem do commit"
            value={branchName()}
            onInput={(e) => setBranchName(e.currentTarget.value)} />
        </div>

        <div>
          <label>Tipo:</label>
          <select class="w-full input-text" value={branchType()} onChange={(e) => setBranchType(e.currentTarget.value)}>
            <option value="branch">Branch</option>
            <option value="feature">Feature</option>
            <option value="hotfix">Hotfix</option>
            <option value="release">Release</option>
          </select>
        </div>

        <div>
          <input
            type="checkbox" id="checkout" name="checkout"
            checked={checkout()} onChange={(e) => setCheckout(e.currentTarget.checked)}
          />
          <label for="checkout" class="ml-1">Fazer checkout para a nova branch</label>
        </div>

        <div class="flex flex-col gap-2 mt-4">
          <Button
            class="border-gray-400 dark:border-gray-700"
            onClick={props.onCancel}
          >
            Cancelar
          </Button>

          <Button
            class="bg-blue-600 text-white hover:bg-blue-700 ml-2"
            onClick={() => props.onCreate(branchName(), branchType(), checkout())}
          >
            Criar
          </Button>

        </div>
    </Dialog>
  );
}
