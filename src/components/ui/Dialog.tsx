import { JSX, Show } from "solid-js";

type Props = {
  open: boolean;
  onClose?: () => void;
  children: JSX.Element;
};

export default function Dialog(props: Props) {
  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={props.onClose}
      >
        <div
          class="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-[400px] relative"
          onClick={(e) => e.stopPropagation()}
        >
          {props.children}
        </div>
      </div>
    </Show>
  );
}
