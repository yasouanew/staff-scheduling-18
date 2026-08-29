<?php

namespace App\Http\Requests\Branch\Concerns;

use App\Models\Branch;

/**
 * Validation rules for a branch's trading hours and break policy.
 *
 * Shared by the store and update requests so the two can never disagree about
 * what a valid schedule is.
 */
trait ValidatesBranchSchedule
{
    /**
     * Rules for the default day plus the optional per-weekday overrides.
     *
     * Times are accepted as `HH:MM` only — the format `<input type="time">`
     * produces and the model stores — so a mixed set of `HH:MM` and `HH:MM:SS`
     * values can never end up in the JSON column.
     *
     * Note there is deliberately no "closing must be after opening" rule: a
     * venue that opens at 18:00 and closes at 02:00 is trading past midnight,
     * which is ordinary in hospitality. Only an *identical* pair is rejected,
     * because a zero-length trading day is always a mistake.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    protected function scheduleRules(): array
    {
        $rules = [
            'default_opens_at' => ['nullable', 'date_format:H:i'],
            'default_closes_at' => ['nullable', 'date_format:H:i', 'different:default_opens_at'],
            // Capped at 8 hours: anything longer is a split shift, not a break.
            'default_break_minutes' => ['nullable', 'integer', 'min:0', 'max:480'],
            'default_break_paid' => ['nullable', 'boolean'],
            'day_schedules' => ['nullable', 'array'],
        ];

        // Each weekday is declared explicitly rather than with a wildcard, so an
        // unknown key (a typo, or a client inventing "funday") is rejected by
        // `array` validation instead of being silently persisted.
        foreach (Branch::WEEKDAYS as $weekday) {
            $rules["day_schedules.{$weekday}"] = ['nullable', 'array'];
            $rules["day_schedules.{$weekday}.is_open"] = ['nullable', 'boolean'];
            $rules["day_schedules.{$weekday}.opens_at"] = ['nullable', 'date_format:H:i'];
            $rules["day_schedules.{$weekday}.closes_at"] = [
                'nullable',
                'date_format:H:i',
                "different:day_schedules.{$weekday}.opens_at",
            ];
            $rules["day_schedules.{$weekday}.break_minutes"] = ['nullable', 'integer', 'min:0', 'max:480'];
            $rules["day_schedules.{$weekday}.break_paid"] = ['nullable', 'boolean'];
        }

        return $rules;
    }

    /**
     * Messages that name the offending day, since a generic
     * "day_schedules.tuesday.closes_at is invalid" is unreadable in a toast.
     *
     * @return array<string, string>
     */
    protected function scheduleMessages(): array
    {
        $messages = [
            'default_closes_at.different' => 'Closing time must differ from opening time.',
            'default_break_minutes.max' => 'A default break cannot exceed 8 hours.',
        ];

        foreach (Branch::WEEKDAYS as $weekday) {
            $label = ucfirst($weekday);

            $messages["day_schedules.{$weekday}.opens_at.date_format"] = "{$label}'s opening time must be a valid time.";
            $messages["day_schedules.{$weekday}.closes_at.date_format"] = "{$label}'s closing time must be a valid time.";
            $messages["day_schedules.{$weekday}.closes_at.different"] = "{$label}'s closing time must differ from its opening time.";
            $messages["day_schedules.{$weekday}.break_minutes.max"] = "{$label}'s break cannot exceed 8 hours.";
        }

        return $messages;
    }

    /**
     * Restore `day_schedules` to the validated payload.
     *
     * Laravel omits an array attribute from `validated()` when that attribute
     * also has nested rules and *none* of them matched any input. For this form
     * that situation has a real meaning: the user removed every exception, and
     * `day_schedules: []` is precisely how they say so. Left alone, the key
     * would never reach the model and the deleted exceptions would reappear on
     * the next load.
     *
     * The value is rebuilt from the raw input rather than passed through, so
     * unknown keys cannot slip into the JSON column behind validation's back.
     *
     * @param  string|null  $key
     * @param  mixed  $default
     * @return mixed
     */
    public function validated($key = null, $default = null)
    {
        $validated = parent::validated();

        if ($this->has('day_schedules')) {
            $validated['day_schedules'] = $this->daySchedulesFromInput();
        }

        return is_null($key) ? $validated : data_get($validated, $key, $default);
    }

    /**
     * Rebuild the weekday exceptions from the request, keyed by known weekdays.
     *
     * @return array<string, array<string, mixed>>
     */
    protected function daySchedulesFromInput(): array
    {
        $input = $this->input('day_schedules');

        if (! is_array($input)) {
            return [];
        }

        $schedules = [];

        foreach (Branch::WEEKDAYS as $weekday) {
            $day = $input[$weekday] ?? null;

            if (! is_array($day)) {
                continue;
            }

            // A day is open unless it says otherwise, so a client sending only
            // times does not accidentally close the branch.
            $isOpen = filter_var($day['is_open'] ?? true, FILTER_VALIDATE_BOOLEAN);

            if (! $isOpen) {
                // Times are dropped rather than stored: a closed day that still
                // carries hours is something a roster could schedule against.
                $schedules[$weekday] = ['is_open' => false];

                continue;
            }

            $schedules[$weekday] = [
                'is_open' => true,
                'opens_at' => $day['opens_at'] ?? null,
                'closes_at' => $day['closes_at'] ?? null,
                'break_minutes' => isset($day['break_minutes']) && $day['break_minutes'] !== ''
                    ? (int) $day['break_minutes']
                    : null,
                'break_paid' => filter_var($day['break_paid'] ?? false, FILTER_VALIDATE_BOOLEAN),
            ];
        }

        return $schedules;
    }
}


