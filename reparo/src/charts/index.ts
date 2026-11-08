/* API pública de gráficos de Reparo (SVG propio, sin dependencias). */
export { AreaChart, type AreaChartProps } from './AreaChart';
export { BarChart, type BarChartProps } from './BarChart';
export { DonutChart, type DonutChartProps, type DonutDatum, type DonutCenterContext } from './DonutChart';
export { Sparkline, type SparklineProps } from './Sparkline';
export { ProgressRing, type ProgressRingProps } from './ProgressRing';
export { HBarList, type HBarListProps, type HBarItem } from './HBarList';
export { Legend, type LegendProps, type LegendItem } from './Legend';
export { ChartTooltip, type ChartTooltipProps, type TooltipRow } from './ChartTooltip';
export { ChartEmpty } from './ChartEmpty';
export { SrTable } from './SrTable';
export { useMeasure, useReducedMotion, useTweenedArray, useCountUp, type Size } from './lib/hooks';
export { niceDomain } from './lib/scale';
export { compact as formatCompactNumber } from './lib/format';
export { TONE_COLOR, type ChartTone } from './lib/tone';
export type { ChartSeries, ReferenceLine, ValueFormatter, CartesianProps } from './lib/types';
