import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import "flatpickr/dist/themes/dark.css";

export function datepicker(el: HTMLElement, accessor: () => any) {
  const { onChange, value } = accessor();
  
  const instance = flatpickr(el, {
    defaultDate: value(),
    onOpen: (selectedDates, dateStr, instance) => {
      instance.calendarContainer.classList.add("dark");
    },
    onChange: (_, dateStr) => onChange(dateStr),
    onClose: () => el.blur(),
    dateFormat: "d-m-Y",
    allowInput: true,
    locale: "pt", 
  });

  return {
    destroy() {
      instance.destroy();
    },
  };
}