import { createMemo, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext";

export default function ContributionGraph(props: { calendar?: any, loading?: boolean }) {
    const { t } = useApp();

    const daysOfWeek = [t('date').sun, t('date').mon, t('date').tue, t('date').wed, t('date').thu, t('date').fri, t('date').sat];

    const getLevel = (count: number) => {
        if (count === 0) return 0;
        if (count <= 3) return 1;
        if (count <= 6) return 2;
        if (count <= 9) return 3;
        return 4;
    };

    const calendarData = createMemo(() => {
        if (!props.calendar) return [];
        return props.calendar.weeks.map((week: any, i: number) => {
        const firstDay = new Date(week.contributionDays[0].date + "T00:00:00");
        let monthLabel = null;
        if (firstDay.getDate() <= 7) {
            monthLabel = firstDay.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        }
        return { 
            days: week.contributionDays, 
            label: monthLabel,
            index: i 
        };
        });
    });

    return (
        <div class="p-6 flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl transition-all duration-300 overflow-auto">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-4">
                    <span class="text-sm font-bold dark:text-gray-200">
                        <i class="fa fa-code-commit text-green-500"></i> 
                        {props.calendar?.totalContributions.toLocaleString('pt-BR')} 
                        {t('dashboard').contributions_last_year}
                    </span>
                </div>
            </div>

            <div class="flex gap-1">
                {/* DIAS DA SEMANA - Removido o mt-7 e usando a mesma estrutura de grid vertical */}
                <div class="flex flex-col mb-[16px]"> {/* Compensa a altura do label dos meses */}
                    <div class="h-5 mb-2"></div> {/* Espaço vazio para alinhar com os meses */}
                    <div class="grid grid-rows-7 h-full gap-[3px] py-[2px]">
                        <For each={daysOfWeek}>
                            {(day) => (
                                <div class="text-[9px] font-bold text-gray-400 flex items-center pr-2 uppercase select-none leading-none">
                                    {day}
                                </div>
                            )}
                        </For>
                    </div>
                </div>

                <div class="flex-1 flex flex-col min-w-0">
                    {/* MESES */}
                    <div class="relative h-5 mb-2 text-[10px] font-bold text-gray-400 select-none uppercase tracking-tight">
                        <For each={calendarData()}>
                            {(week) => (
                                <Show when={week.label}>
                                    <div class="absolute" style={{ left: `${(week.index / 53) * 100}%` }}>
                                        {week.label}
                                    </div>
                                </Show>
                            )}
                        </For>
                    </div>

                    <div class="w-full">
                        <div 
                            class="grid grid-rows-7 grid-flow-col gap-[3px] w-full"
                            style={{ "grid-template-columns": "repeat(53, 1fr)" }}
                        >
                            <For each={calendarData()}>
                                {(week) => (
                                    <For each={week.days}>
                                        {(day: any) => {
                                            const level = getLevel(day.contributionCount);
                                            return (
                                                <div 
                                                    class="rounded-[2px] transition-colors duration-200 hover:ring-1 hover:ring-white/20"
                                                    data-level={level}
                                                    style={{ 
                                                        "aspect-ratio": "1 / 1",
                                                        "width": "100%",
                                                        "background-color": `var(--level-${level})`
                                                    }}
                                                    title={`${day.contributionCount} ${t('dashboard').contributions_in} ${new Date(day.date + "T00:00:00").toLocaleDateString()}`}
                                                />
                                            );
                                        }}
                                    </For>
                                )}
                            </For>
                        </div>
                    </div>

                    {/* LEGENDA */}
                    <div class="flex justify-end items-center mt-4">
                        <div class="flex items-center gap-2 text-[9px] text-gray-500 font-black uppercase tracking-widest">
                            <span>{t('date').less}</span>
                            <div class="flex gap-[3px]">
                                <div class="w-2.5 h-2.5 rounded-[1px] bg-[var(--level-0)]" />
                                <div class="w-2.5 h-2.5 rounded-[1px] bg-[var(--level-1)]" />
                                <div class="w-2.5 h-2.5 rounded-[1px] bg-[var(--level-2)]" />
                                <div class="w-2.5 h-2.5 rounded-[1px] bg-[var(--level-3)]" />
                                <div class="w-2.5 h-2.5 rounded-[1px] bg-[var(--level-4)]" />
                            </div>
                            <span>{t('date').more}</span>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                :root {
                --level-0: #ebedf0;
                --level-1: #9be9a8;
                --level-2: #40c463;
                --level-3: #30a14e;
                --level-4: #216e39;
                }

                .dark {
                --level-0: #161b22;
                --level-1: #0e4429;
                --level-2: #006d32;
                --level-3: #26a641;
                --level-4: #39d353;
                }
            `}</style>
        </div>
    );
}