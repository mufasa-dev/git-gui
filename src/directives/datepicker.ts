import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import "flatpickr/dist/themes/dark.css";

export function datepicker(el: HTMLElement, accessor: () => any) {
  const { onChange, value } = accessor();
  
  const instance = flatpickr(el, {
    defaultDate: value(),
    onOpen: (selectedDates, dateStr, instance) => {
      // Garante que o calendário tenha a classe dark para o nosso CSS funcionar
      instance.calendarContainer.classList.add("dark");
    },
    onChange: (_, dateStr) => onChange(dateStr),
    onClose: () => el.blur(),
    dateFormat: "Y-m-d",
    allowInput: true,
    locale: "pt", 
  });

  return {
    destroy() {
      instance.destroy();
    },
  };
}