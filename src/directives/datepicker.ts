import { createEffect } from "solid-js";
import flatpickr from "flatpickr";
import { english } from "flatpickr/dist/l10n/default.js";
import { Italian } from "flatpickr/dist/l10n/it.js";
import { Japanese } from "flatpickr/dist/l10n/ja.js";
import { Portuguese } from "flatpickr/dist/l10n/pt.js";
import "flatpickr/dist/flatpickr.css";
import "flatpickr/dist/themes/dark.css";

interface DatepickerOptions {
  value: () => string;
  onChange: (value: string) => void;
  locale?: () => string;
  isDark?: () => boolean;
  minDate?: () => string;
  maxDate?: () => string;
}

const locales = {
  pt: Portuguese,
  en: english,
  it: Italian,
  jp: Japanese,
};

function getLocale(locale: string | undefined) {
  return locales[locale as keyof typeof locales] || Portuguese;
}

function getAltFormat(locale: string | undefined) {
  return locale === "en" ? "m/d/Y" : locale === "jp" ? "Y/m/d" : "d/m/Y";
}

export function datepicker(el: HTMLElement, accessor: () => DatepickerOptions) {
  const options = accessor();
  const instance = flatpickr(el, {
    defaultDate: options.value() || undefined,
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: getAltFormat(options.locale?.()),
    allowInput: true,
    locale: getLocale(options.locale?.()),
    minDate: options.minDate?.() || undefined,
    maxDate: options.maxDate?.() || undefined,
    onChange: (_, dateStr) => options.onChange(dateStr),
    onOpen: () => {
      syncCalendar();
      el.blur();
    },
    onClose: () => el.blur(),
  });

  const syncCalendar = (darkOverride?: boolean) => {
    const calendar = instance.calendarContainer;
    if (calendar) {
      const dark = darkOverride ?? (
        document.documentElement.classList.contains("dark") ||
        (options.isDark?.() === true && localStorage.getItem("theme") !== "light")
      );
      calendar.classList.toggle("dark", dark);
    }
    instance.set("locale", getLocale(options.locale?.()));
    instance.redraw();
  };

  const handleThemeChanged = () => {
    syncCalendar(document.documentElement.classList.contains("dark"));
  };
  window.addEventListener("theme-changed", handleThemeChanged);

  createEffect(() => {
    const value = options.value();
    if (value !== instance.input.value) {
      if (value) {
        instance.setDate(value, false, "Y-m-d");
      } else {
        instance.clear(false);
      }
    }
  });

  createEffect(() => {
    const locale = options.locale?.();
    const contextDark = options.isDark?.();
    const dark = document.documentElement.classList.contains("dark") ||
      (contextDark === true && localStorage.getItem("theme") !== "light");
    const minDate = options.minDate?.() || undefined;
    const maxDate = options.maxDate?.() || undefined;

    instance.set("locale", getLocale(locale));
    instance.set("altFormat", getAltFormat(locale));
    instance.set("minDate", minDate);
    instance.set("maxDate", maxDate);
    instance.calendarContainer?.classList.toggle("dark", dark);
    if (instance.input.value) {
      instance.setDate(instance.input.value, false, "Y-m-d");
    } else {
      instance.redraw();
    }
  });

  return {
    destroy() {
      window.removeEventListener("theme-changed", handleThemeChanged);
      instance.destroy();
    },
  };
}
