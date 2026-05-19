import { createSignal, onMount, onCleanup, For, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext";

import printCommit from "../../assets/print.png";
import printDash from "../../assets/print2.png";
import printTest from "../../assets/print3.png";

type AuthTranslationKeys = 
  | "carousel_git_title" 
  | "carousel_git_desc" 
  | "carousel_tests_title" 
  | "carousel_tests_desc" 
  | "carousel_dash_title" 
  | "carousel_dash_desc";

interface Slide {
  id: string;
  titleKey: AuthTranslationKeys;
  descKey: AuthTranslationKeys;
  icon: string;
}

export default function FeaturesCarousel() {
  const { t } = useApp();
  const [activeIndex, setActiveIndex] = createSignal(0);
  let timer: number;

  const slides: Slide[] = [
    {
      id: "git",
      titleKey: "carousel_git_title", 
      descKey: "carousel_git_desc",
      icon: "fa-code-commit text-blue-500"
    },
    {
      id: "tests",
      titleKey: "carousel_tests_title",
      descKey: "carousel_tests_desc",
      icon: "fa-vial text-green-500"
    },
    {
      id: "dashboard",
      titleKey: "carousel_dash_title",
      descKey: "carousel_dash_desc",
      icon: "fa-chart-pie text-cyan-500"
    }
  ];

  const nextSlide = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  onMount(() => {
    timer = window.setInterval(nextSlide, 8000);
  });

  onCleanup(() => {
    clearInterval(timer);
  });

  return (
    // Largura máxima aumentada para dar espaço às imagens em telas grandes
    <div class="w-full max-w-[320px] md:max-w-[460px] lg:max-w-[560px] xl:max-w-[680px] px-4 flex flex-col items-center text-center select-none transition-all duration-300">
      
      {/* VISUAL PREVIEW - Altura dinâmica baseada na largura (aspect-ratio) */}
      <div class="w-full aspect-[16/10] relative mb-8 flex items-center justify-center overflow-hidden rounded-2xl bg-white/[0.02] dark:bg-black/20 border border-white/10 backdrop-blur-xl shadow-[0_24px_50px_-12px_rgba(0,0,0,0.5)]">
        <For each={slides}>
          {(slide, index) => (
            <div 
              class="absolute inset-0 flex flex-col items-center justify-center p-2 md:p-4 lg:p-6 transition-all duration-700 ease-in-out"
              style={{
                opacity: activeIndex() === index() ? "1" : "0",
                transform: activeIndex() === index() ? "scale(1) translateY(0)" : "scale(0.95) translateY(15px)",
                "pointer-events": activeIndex() === index() ? "auto" : "none"
              }}
            >
              <Switch>
                <Match when={slide.id === "git"}>
                  <img src={printCommit} alt="Git Preview" class="w-full h-full object-contain rounded-lg border border-gray-500/10 dark:border-white/10" />
                </Match>

                <Match when={slide.id === "tests"}>
                  <img src={printTest} alt="Tests Preview" class="w-full h-full object-contain rounded-lg border border-gray-500/10 dark:border-white/10" />
                </Match>

                <Match when={slide.id === "dashboard"}>
                  <img src={printDash} alt="Dashboard Preview" class="w-full h-full object-contain rounded-lg border border-gray-500/10 dark:border-white/10" />
                </Match>
              </Switch>
            </div>
          )}
        </For>
      </div>

      {/* TEXTS - Altura adaptável e fontes maiores em displays generosos */}
      <div class="min-h-[80px] lg:min-h-[100px] flex flex-col justify-start max-w-[480px]">
        <h3 class="text-base md:text-lg lg:text-xl font-bold mb-2 text-gray-900 dark:text-white flex items-center justify-center gap-2">
          <i class={`fa-solid ${slides[activeIndex()].icon} text-sm md:text-base lg:text-lg`}></i>
          { t('carousel')[slides[activeIndex()].titleKey as AuthTranslationKeys] || "Feature" }
        </h3>
        <p class="text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          { t('carousel')[slides[activeIndex()].descKey as AuthTranslationKeys] || "Description not found." }
        </p>
      </div>

      {/* DOTS INDICATORS */}
      <div class="flex gap-2.5 mt-4 lg:mt-6">
        <For each={slides}>
          {(_, index) => (
            <button
              onClick={() => setActiveIndex(index())}
              class={`h-1.5 md:h-2 rounded-full transition-all duration-300 ${
                activeIndex() === index() 
                  ? "w-6 bg-blue-600 dark:bg-blue-400" 
                  : "w-1.5 md:w-2 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-500"
              }`}
              aria-label={`Go to slide ${index() + 1}`}
            />
          )}
        </For>
      </div>

    </div>
  );
}