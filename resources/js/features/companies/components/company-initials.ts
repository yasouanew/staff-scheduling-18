/**
 * Derives up-to-two uppercase initials from a company name, used as the
 * fallback avatar when a company has no uploaded logo.
 *
 * @example getCompanyInitials('Acme Hospitality Group') // => 'AH'
 */
export function getCompanyInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
}

/** Backwards-compatible alias used by the detail page header. */
export const CompaniesTableInitials = getCompanyInitials;
