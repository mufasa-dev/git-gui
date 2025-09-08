import Button from "../ui/Button";
import Dialog from "../ui/Dialog";

type Props = {
  open: boolean;
  branch: string;
  onCancel: () => void;
  onDiscard: () => void;
  onStashAndApply: () => void;
};

export default function BranchSwitchModal(props: Props) {
  return (
    <Dialog open={props.open} title="Mudar de Branch" onClose={props.onCancel}>
        <h2 class="text-lg font-semibold">
          Alterar para <span class="text-blue-600">{props.branch}</span>?
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Você tem mudanças locais. O que deseja fazer com elas?
        </p>

        <div class="flex flex-col gap-2 mt-4">
          <Button
            class="bg-blue-600 text-white hover:bg-blue-700"
            onClick={props.onStashAndApply}
          >
            Stash e aplicar depois
          </Button>

          <Button
            class="bg-red-600 text-white hover:bg-red-700"
            onClick={props.onDiscard}
          >
            Descartar mudanças
          </Button>

          <Button
            class="border-gray-400 dark:border-gray-700"
            onClick={props.onCancel}
          >
            Cancelar
          </Button>
        </div>
    </Dialog>
  );
}
