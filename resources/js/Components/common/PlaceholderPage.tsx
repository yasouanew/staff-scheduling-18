import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
    /** Section title, typically mirrors the sidebar label. */
    title: string;
    /** Optional supporting copy describing the upcoming feature. */
    description?: string;
}

/**
 * Neutral "coming soon" surface for navigation destinations whose dedicated
 * page has not been built yet. Keeps every sidebar link routable so the shell
 * never dead-ends on a blank screen.
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps): JSX.Element {
    return (
        <section className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-16 text-center shadow-sm">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Construction className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
                <p className="text-sm text-muted-foreground">
                    {description ??
                        `The ${title} workspace is coming soon. This area is wired into the app shell and ready for its dedicated experience.`}
                </p>
            </div>
        </section>
    );
}
