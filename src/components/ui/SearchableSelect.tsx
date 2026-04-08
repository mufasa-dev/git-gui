import { createSignal, For, Show, createMemo, onMount, onCleanup } from "solid-js";

export interface SearchableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SearchableSelectOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
  initialValue?: string;
  class?: string;
}

export const SearchableSelect = (props: SelectProps) => {
  const [isOpen, setIsOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [selected, setSelected] = createSignal(props.initialValue || "");
  let selectRef: HTMLDivElement | undefined;

  const filteredOptions = createMemo(() => 
    props.options.filter(opt => 
      opt.label.toLowerCase().includes(search().toLowerCase())
    )
  );

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    setSelected(option.value);
    props.onSelect(option.value);
    setIsOpen(false);
    setSearch("");
  };

  onMount(() => {
    document.addEventListener("mousedown", handleClickOutside);
    
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  const handleClickOutside = (e: MouseEvent) => {
    if (selectRef && !selectRef.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  return (
    <div ref={selectRef} class={"relative text-sm " + props.class}>
      {/* Botão do Select */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen())}
        class="w-full border rounded p-1 px-2 bg-white dark:bg-gray-800 flex justify-between items-center dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        <span class="truncate pr-2">
          {props.options.find(o => o.value === selected())?.label || props.placeholder}
        </span>
        <i class={`fa text-xs opacity-50 ${isOpen() ? "fa-caret-down" : "fa-caret-right"}`}></i>
      </button>

      <Show when={isOpen()}>
        <div class="absolute z-50 w-full mt-1 border rounded shadow-xl bg-white dark:bg-gray-800 max-h-72 overflow-y-auto dark:border-gray-700">
          <input
            type="text"
            placeholder="Filtrar..."
            class="w-full p-2 border-b border-gray-300 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 outline-none focus:bg-blue-50 dark:focus:bg-gray-700"
            onInput={(e) => setSearch(e.currentTarget.value)}
            value={search()}
            autofocus
          />
          <div class="flex flex-col p-1">
            <For each={filteredOptions()} fallback={<div class="p-4 text-center text-gray-500 italic">Nada encontrado</div>}>
              {(option) => (
                <button
                  disabled={option.disabled}
                  class={`p-2 text-left rounded transition-colors ${
                    option.disabled 
                      ? 'text-xs font-bold uppercase tracking-wider text-gray-500 mt-2 mb-1 cursor-default bg-transparent' 
                      : selected() === option.value 
                        ? 'bg-blue-600 text-white font-bold' 
                        : 'hover:bg-blue-100 dark:hover:bg-blue-900'
                  }`}
                  onClick={() => handleSelect(option)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};