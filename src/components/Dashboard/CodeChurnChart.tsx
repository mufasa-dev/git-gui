import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { getCodeChurn } from "../../services/gitService";
import { CodeChurnPoint } from "../../models/Dashboard.model";
import { formatCompactDate } from "../../utils/date";
import { useApp } from "../../context/AppContext";

interface Props {
  path: string;
  branch: string;
}

interface ChartPoint extends CodeChurnPoint {
  x: number;
  additionsY: number;
  deletionsY: number;
}

const chartConfig = {
  width: 500,
  height: 180,
  padding: { top: 12, right: 12, bottom: 30, left: 34 },
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createPath = (points: ChartPoint[], value: "additionsY" | "deletionsY") => {
  if (!points.length) return "";

  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point[value]}`;

    const previous = points[index - 1];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous[value]}, ${midpoint} ${point[value]}, ${point.x} ${point[value]}`;
  }, "");
};

const createAreaPath = (points: ChartPoint[], value: "additionsY" | "deletionsY", baseline: number) => {
  if (!points.length) return "";
  const line = createPath(points, value);
  return `${line} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
};

export default function CodeChurnChart(props: Props) {
  const { t, locale } = useApp();
  const [days, setDays] = createSignal(30);
  const [hoveredPoint, setHoveredPoint] = createSignal<ChartPoint | null>(null);

  const [data] = createResource(
    () => ({ path: props.path, branch: props.branch, days: days() }),
    async (params) => {
      if (!params.path || !params.branch) return [];
      return getCodeChurn(params.path, params.branch, params.days);
    },
  );

  const chartData = createMemo(() => {
    const source = new Map((data() || []).map(point => [point.date, point]));
    const visibleDays = days();
    const dateRange: CodeChurnPoint[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let index = visibleDays - 1; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      const dateKey = toDateKey(date);
      dateRange.push(source.get(dateKey) || {
        date: dateKey,
        additions: 0,
        deletions: 0,
        commits: 0,
      });
    }

    const maxValue = Math.max(
      10,
      ...dateRange.flatMap(point => [point.additions, point.deletions]),
    );
    const drawWidth = chartConfig.width - chartConfig.padding.left - chartConfig.padding.right;
    const drawHeight = chartConfig.height - chartConfig.padding.top - chartConfig.padding.bottom;
    const baseline = chartConfig.padding.top + drawHeight;
    const points: ChartPoint[] = dateRange.map((point, index) => ({
      ...point,
      x: chartConfig.padding.left + (index / Math.max(dateRange.length - 1, 1)) * drawWidth,
      additionsY: chartConfig.padding.top + drawHeight - (point.additions / maxValue) * drawHeight,
      deletionsY: chartConfig.padding.top + drawHeight - (point.deletions / maxValue) * drawHeight,
    }));

    return {
      points,
      maxValue,
      baseline,
      drawHeight,
      additionsPath: createPath(points, "additionsY"),
      deletionsPath: createPath(points, "deletionsY"),
      additionsArea: createAreaPath(points, "additionsY", baseline),
      deletionsArea: createAreaPath(points, "deletionsY", baseline),
      yTicks: [0, Math.round(maxValue / 2), maxValue],
    };
  });

  const totals = createMemo(() => chartData().points.reduce(
    (summary, point) => ({
      additions: summary.additions + point.additions,
      deletions: summary.deletions + point.deletions,
      commits: summary.commits + point.commits,
    }),
    { additions: 0, deletions: 0, commits: 0 },
  ));

  const formatPeriod = (value: number) => {
    if (value < 31) return t("date").last_days.replace("{{count}}", String(value));
    const months = Math.round(value / 30);
    return t("date").last_months.replace("{{count}}", String(months));
  };

  const updateHoveredPoint = (event: MouseEvent) => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * chartConfig.width;
    const points = chartData().points;
    if (!points.length) return;

    setHoveredPoint(points.reduce((closest, point) =>
      Math.abs(point.x - x) < Math.abs(closest.x - x) ? point : closest,
    ));
  };

  return (
    <div class="relative flex h-full flex-col overflow-hidden p-2">
      <div class="mb-3 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-code-branch text-cyan-400 text-xs"></i>
            <h4 class="truncate font-bold tracking-wide text-gray-900 dark:text-gray-100">
              {t("dashboard").code_churn}
            </h4>
          </div>
          <p class="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            {totals().commits} {t("dashboard").commits_analyzed}
          </p>
        </div>

        <select
          value={days()}
          onInput={(event) => setDays(Number(event.currentTarget.value))}
          class="input-select mt-0 shrink-0 py-1 text-[10px]"
          aria-label={t("dashboard").churn_period}
        >
          <option value={30}>{formatPeriod(30)}</option>
          <option value={90}>{formatPeriod(90)}</option>
          <option value={180}>{formatPeriod(180)}</option>
        </select>
      </div>

      <Show when={!data.loading} fallback={
        <div class="flex flex-1 items-center justify-center">
          <i class="fa-solid fa-spinner animate-spin text-cyan-400"></i>
        </div>
      }>
        <Show when={totals().commits > 0} fallback={
          <div class="flex flex-1 items-center justify-center text-xs italic text-gray-500">
            {t("dashboard").no_churn_data}
          </div>
        }>
          <div class="mb-2 flex flex-wrap items-center gap-3 text-[10px]">
            <span class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span class="h-2 w-2 rounded-full bg-cyan-400"></span>
              {t("dashboard").additions}
              <strong class="font-mono text-cyan-400">+{totals().additions}</strong>
            </span>
            <span class="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span class="h-2 w-2 rounded-full bg-rose-400"></span>
              {t("dashboard").deletions}
              <strong class="font-mono text-rose-400">-{totals().deletions}</strong>
            </span>
          </div>

          <div class="relative min-h-0 flex-1">
            <div class="pointer-events-none absolute inset-0 flex flex-col justify-between pb-7 pl-0 pr-1 pt-1 text-[9px] font-mono text-gray-500">
              <For each={chartData().yTicks.slice().reverse()}>
                {(tick) => <span class="text-right">{tick}</span>}
              </For>
            </div>

            <svg
              viewBox={`0 0 ${chartConfig.width} ${chartConfig.height}`}
              preserveAspectRatio="none"
              class="block h-full w-full"
              onMouseMove={updateHoveredPoint}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <linearGradient id="churnAdditionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.28" />
                  <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
                </linearGradient>
                <linearGradient id="churnDeletionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#fb7185" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#fb7185" stop-opacity="0" />
                </linearGradient>
              </defs>

              <For each={chartData().yTicks}>
                {(tick) => {
                  const y = chartConfig.padding.top + chartData().drawHeight - (tick / chartData().maxValue) * chartData().drawHeight;
                  return (
                    <line
                      x1={chartConfig.padding.left}
                      y1={y}
                      x2={chartConfig.width - chartConfig.padding.right}
                      y2={y}
                      stroke="currentColor"
                      stroke-width="0.5"
                      stroke-dasharray="2 3"
                      class="text-gray-700/70"
                    />
                  );
                }}
              </For>

              <path d={chartData().additionsArea} fill="url(#churnAdditionsGradient)" />
              <path d={chartData().deletionsArea} fill="url(#churnDeletionsGradient)" />
              <path d={chartData().additionsPath} fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              <path d={chartData().deletionsPath} fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />

              <Show when={hoveredPoint()}>
                <line
                  x1={hoveredPoint()!.x}
                  y1={chartConfig.padding.top}
                  x2={hoveredPoint()!.x}
                  y2={chartData().baseline}
                  stroke="#94a3b8"
                  stroke-width="1"
                  stroke-dasharray="3 3"
                  opacity="0.55"
                  vector-effect="non-scaling-stroke"
                />
                <circle cx={hoveredPoint()!.x} cy={hoveredPoint()!.additionsY} r="3" fill="#22d3ee" stroke="#0f172a" stroke-width="1.5" />
                <circle cx={hoveredPoint()!.x} cy={hoveredPoint()!.deletionsY} r="3" fill="#fb7185" stroke="#0f172a" stroke-width="1.5" />
              </Show>

              <rect
                x="0"
                y="0"
                width={chartConfig.width}
                height={chartConfig.height}
                fill="transparent"
              />
            </svg>

            <div class="pointer-events-none absolute bottom-0 left-9 right-3 flex justify-between text-[9px] text-gray-500">
              <span>{formatCompactDate(chartData().points[0]?.date || "", locale())}</span>
              <span>{formatCompactDate(chartData().points[Math.floor(chartData().points.length / 2)]?.date || "", locale())}</span>
              <span>{formatCompactDate(chartData().points[chartData().points.length - 1]?.date || "", locale())}</span>
            </div>

            <Show when={hoveredPoint()}>
              <div
                class="pointer-events-none absolute z-10 rounded-lg border border-gray-700 bg-gray-950/95 px-2.5 py-2 text-[10px] text-white shadow-xl"
                style={{
                  left: `${(hoveredPoint()!.x / chartConfig.width) * 100}%`,
                  top: `${(Math.min(hoveredPoint()!.additionsY, hoveredPoint()!.deletionsY) / chartConfig.height) * 100}%`,
                  transform: "translate(-50%, -115%)",
                }}
              >
                <div class="mb-1 border-b border-gray-800 pb-1 font-semibold text-gray-300">
                  {formatCompactDate(hoveredPoint()!.date, locale())}
                </div>
                <div class="flex items-center gap-2"><span class="h-1.5 w-1.5 rounded-full bg-cyan-400"></span>+{hoveredPoint()!.additions}</div>
                <div class="flex items-center gap-2"><span class="h-1.5 w-1.5 rounded-full bg-rose-400"></span>-{hoveredPoint()!.deletions}</div>
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
