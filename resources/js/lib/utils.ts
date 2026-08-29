import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Coerce an API `features` value into a list of display strings.
 *
 * Plan features are stored as a JSON column, so the payload cannot be trusted to
 * be a string array: legacy rows may hold a `{ feature_key: boolean }` map. Any
 * non-array value is normalised here (keeping only enabled keys, humanised) so a
 * single malformed row can never break rendering.
 */
export function normalizeFeatureList(features: unknown): string[] {
    if (Array.isArray(features)) {
        return features.filter((feature): feature is string => typeof feature === 'string');
    }

    if (features !== null && typeof features === 'object') {
        return Object.entries(features as Record<string, unknown>)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([key]) => key.replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase()));
    }

    return [];
}

