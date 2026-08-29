<?php

namespace App\Http\Resources;

use App\Models\Branch;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;


class BranchResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'manager_id' => $this->manager_id,
            'name' => $this->name,
            'phone' => $this->phone,
            'address' => $this->address,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'timezone' => $this->timezone,

            // Trading hours and break policy. `HH:MM` throughout, because that is
            // what the form's time inputs both emit and expect — the client should
            // never have to trim seconds off a value it is about to render.
            'default_opens_at' => $this->time($this->default_opens_at),
            'default_closes_at' => $this->time($this->default_closes_at),
            'default_break_minutes' => $this->default_break_minutes,
            'default_break_paid' => (bool) $this->default_break_paid,
            'day_schedules' => $this->daySchedules(),

            'status' => $this->status,

            'company' => new CompanyResource($this->whenLoaded('company')),
            'manager' => $this->whenLoaded('manager', fn () => $this->manager ? [
                'id' => $this->manager->id,
                'name' => $this->manager->full_name,
            ] : null),
            'users_count' => $this->whenCounted('users'),
            'employees_count' => $this->whenCounted('employees'),
            'shifts_count' => $this->whenCounted('shifts'),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Normalise a time column to `HH:MM`.
     *
     * MySQL returns `TIME` as `HH:MM:SS`; emitting that would make every
     * consumer trim the seconds before it could populate a time input.
     */
    private function time(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return substr($value, 0, 5);
    }

    /**
     * Per-weekday overrides, always as a complete week.
     *
     * The column stores only the days that differ, but a *sparse* map would
     * force the client to re-implement the default-merging logic just to render
     * a row per day. Emitting all seven resolved days keeps that rule in one
     * place (the model) and lets the UI stay presentational.
     *
     * @return array<string, array{is_open: bool, opens_at: ?string, closes_at: ?string, break_minutes: ?int, break_paid: bool, is_custom: bool}>
     */
    private function daySchedules(): array
    {
        $stored = is_array($this->day_schedules) ? $this->day_schedules : [];
        $resolved = [];

        foreach (Branch::WEEKDAYS as $weekday) {
            $resolved[$weekday] = [
                ...$this->resource->scheduleForWeekday($weekday),
                // Distinguishes "deliberately customised" from "inherits the
                // standard day", so the form knows which rows to pre-expand.
                'is_custom' => array_key_exists($weekday, $stored),
            ];
        }

        return $resolved;
    }
}

