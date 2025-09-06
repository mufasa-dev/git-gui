import { createSignal } from "solid-js";

type Option = {
  label: string;
  action: () => void;
};

type Props = {
  label: string;
  img?: string;
  class?: string;
  btnClass?: string;
  options: Option[];
};

export default function DropdownButton(props: Props) {
  const [open, setOpen] = createSignal(false);

  const toggle = () => setOpen(!open());

  return (
    <div class={props.class + " relative"}>
      <button
        onClick={toggle}
        class={props.btnClass + " top-btn flex flex-col justify-center items-center"}
      >
        {<img src={props.img} class="inline h-6 mr-2" />}
        <div class="flex items-center">
            {props.label}
            <i class="fa fa-carret-down"></i>
        </div>
      </button>

      {open() && (
        <div class="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white dark:bg-gray-700 border dark:border-gray-600 z-50">
          <ul class="py-1">
            {props.options.map(opt => (
              <li>
                <button
                  class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-white"
                  onClick={() => {
                    opt.action();
                    setOpen(false);
                  }}
                >
                    {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
