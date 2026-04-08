import { createSignal, createMemo } from "solid-js";
import Button from "../ui/Button";
import Dialog from "../ui/Dialog";
import { SearchableSelect } from "../ui/SearchableSelect"; // Ajuste o path conforme seu projeto

type Props = {
  open: boolean;
  repoPath?: string;
  branches: string[]; // Aqui você pode passar as branches já formatadas ou apenas os nomes
  onCancel: () => void;
  onCreate: (branchName: string, branchType: string, checkout: boolean, baseBranch: string) => void;
  refreshBranches: (repoPath: string) => Promise<void>;
};

export default function BranchSwitchModal(props: Props) {
  const [branchName, setBranchName] = createSignal("");
  const [branchType, setBranchType] = createSignal("branch");
  const [checkout, setCheckout] = createSignal(true);
  const [baseBranch, setBaseBranch] = createSignal("main");

  // Opções fixas para o Tipo de Branch
  const typeOptions = [
    { value: "branch", label: "Branch" },
    { value: "feature", label: "Feature" },
    { value: "hotfix", label: "Hotfix" },
    { value: "release", label: "Release" },
  ];

  // Memo para formatar as branches vindas das props
  const branchOptions = createMemo(() => {
    return props.branches.map(b => ({
      value: b,
      label: b
    }));
  });

  return (
    <Dialog open={props.open} title="Nova Branch" onClose={props.onCancel}>
      <div class="flex flex-col gap-4">
        {/* Nome da Branch */}
        <div>
          <label class="block text-sm font-medium mb-1">Nome da branch:</label>
          <input 
            type="text" 
            class="w-full input-text" 
            placeholder="Ex: minha-nova-task"
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

        {/* Tipo da Branch */}
        <div>
          <label class="block text-sm font-medium mb-1">Tipo:</label>
          <SearchableSelect 
            options={typeOptions}
            initialValue={branchType()}
            onSelect={(val) => setBranchType(val)}
          />
        </div>

        {/* Branch Base */}
        <div>
          <label class="block text-sm font-medium mb-1">Baseada em:</label>
          <SearchableSelect 
            options={branchOptions()}
            initialValue={baseBranch()}
            placeholder="Selecione a branch base..."
            onSelect={(val) => setBaseBranch(val)}
          />
        </div>

        {/* Checkout Checkbox */}
        <div class="flex items-center gap-2 mt-1">
          <input
            type="checkbox" 
            id="checkout" 
            class="cursor-pointer"
            checked={checkout()} 
            onChange={(e) => setCheckout(e.currentTarget.checked)}
          />
          <label for="checkout" class="text-sm cursor-pointer select-none">
            Fazer checkout para a nova branch
          </label>
        </div>

        {/* Ações */}
        <div class="flex gap-2 mt-2">
          <Button
            class="border rounded border-gray-400 dark:border-gray-700 flex-1 py-2"
            onClick={props.onCancel}
          >
            Cancelar
          </Button>

          <Button
            class="btn-primary flex-1 py-2 font-bold"
            onClick={() => props.onCreate(branchName(), branchType(), checkout(), baseBranch())}
          >
            Criar Branch
          </Button>
        </div>
      </div>
    </Dialog>
  );
}