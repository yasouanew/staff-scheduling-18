import { Info, PencilRuler, Send } from 'lucide-react';

/**
 * Explains the draft → published lifecycle that governs the whole calendar.
 *
 * Every other publication signal on this page (chip tints, the "Draft"/"Sent"
 * labels, the publish action) assumes the reader already knows that a *saved*
 * shift is not a *communicated* shift. That assumption is the most expensive
 * misunderstanding in rostering: a manager who thinks saving is enough leaves
 * staff with no roster, while one who publishes too early sends notifications
 * for a plan that is still moving.
 *
 * Stating the rule once, immediately above the grid, removes the guesswork
 * before the manager touches a cell. It is deliberately static and always
 * visible — it costs one line of vertical space and acts as the legend for
 * everything below it.
 */
export function CalendarVisibilityNotice(): JSX.Element {
    return (
        <section
            aria-label="How draft and published shifts work"
            className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 lg:flex-row lg:items-center lg:gap-6"
        >
            <p className="flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground">
                <Info className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                Staff only see a shift once you publish it
            </p>

            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground lg:flex-1 lg:flex-row lg:gap-6">
                <li className="flex items-start gap-1.5">
                    <PencilRuler
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <span>
                        <span className="font-medium text-foreground">Draft</span> — planning only.
                        Not visible to staff and no notifications are sent.
                    </span>
                </li>

                <li className="flex items-start gap-1.5">
                    <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                    <span>
                        <span className="font-medium text-foreground">Published</span> — everyone
                        rostered is notified and the shifts appear in their app.
                    </span>
                </li>
            </ul>
        </section>
    );
}
