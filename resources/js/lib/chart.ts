import type { ChartTone } from '@/types/analytics';

/**
 * Shared chart theming + formatting helpers.
 *
 * Colors are never hardcoded: every tone resolves to a semantic CSS custom
 * property (e.g. `var(--color-primary)`), so charts adapt automatically between
 * light and dark mode without any JS theme detection.
 */

/** Maps a semantic chart tone to its CSS custom-property reference. */
export const CHART_TONE_VAR: Record<ChartTone, string> = {
    primary: 'var(--color-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
};

/** Resolve a tone to a CSS var string usable in SVG `fill`/`stroke`. */
export function chartToneToVar(tone: ChartTone): string {
    return CHART_TONE_VAR[tone];
}

/**
 * Structural chart colors, all backed by design-system variables so grids,
 * axes and tooltips re-theme instantly under `.dark`.
 */
export const CHART_COLORS = {
    grid: 'var(--color-border)',
    axis: 'var(--color-muted-foreground)',
    cursor: 'var(--color-border)',
    tooltipSurface: 'var(--color-popover)',
    tooltipBorder: 'var(--color-border)',
} as const;

/** Consistent pixel height shared by charts and their loading skeletons. */
export const CHART_HEIGHT = 288;

/* -------------------------------------------------------------------------- */
/* Formatters (Australian locale)                                             */
/* -------------------------------------------------------------------------- */

const audWhole = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const audCompact = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const wholeNumber = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });

/** Format a value as a clean AUD string with no cents, e.g. `$42,300`. */
export function formatAud(value: number): string {
    return audWhole.format(value);
}

/** Format a value as a compact AUD string for axis ticks, e.g. `$42K`. */
export function formatAudCompact(value: number): string {
    return audCompact.format(value);
}

/** Format an hours value with a localized separator + unit, e.g. `1,024 hrs`. */
export function formatHours(value: number): string {
    return `${wholeNumber.format(value)} hrs`;
}

/** Format a ratio (0–100) as a whole-number percentage, e.g. `32%`. */
export function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

/**
 * Shared Tailwind classes for the custom tooltip shell — rounded borders, soft
 * shadow and popover surface tokens to match the design system.
 */
export const CHART_TOOLTIP_CLASS =
    'min-w-[9rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg';
