import { useApp } from "../../context/AppContext";
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
  const { t } = useApp();

  return (
    <Dialog open={props.open} title={t('branch').change_branch} bodyClass="px-4 pt-2 pb-4" onClose={props.onCancel}>
        <h2 class="text-lg font-semibold">
          {t('branch').change_to_branch} <span class="text-blue-600">{props.branch}</span>?
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {t('branch').you_have_changes}
        </p>

        <div class="flex flex-col gap-2 mt-2">
          <Button
            class="border border-blue-500 text-white hover:bg-blue-500 rounded-xl p-2"
            onClick={props.onStashAndApply}
          >
            <i class="fa fa-box-archive"></i> {t('branch').stash_changes}
          </Button>

          <Button
            class="border border-red-500 text-white hover:bg-red-500 rounded-xl p-2"
            onClick={props.onDiscard}
          >
            <i class="fa fa-trash"></i> {t('branch').discart_changes}
          </Button>

          <Button
            class="border-gray-400 dark:border-gray-700 hover:text-yellow-500"
            onClick={props.onCancel}
          >
            {t('common').cancel}
          </Button>
        </div>
    </Dialog>
  );
}
