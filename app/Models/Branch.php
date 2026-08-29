<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class Branch extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'manager_id',
        'name',
        'phone',
        'address',
        'latitude',
        'longitude',
        'timezone',
        'default_opens_at',
        'default_closes_at',
        'default_break_minutes',
        'default_break_paid',
        'day_schedules',
        'status',
    ];

    /**
     * Weekday keys used by {@see $day_schedules}, in roster order.
     *
     * @var list<string>
     */
    public const WEEKDAYS = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
    ];


    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'manager_id' => 'integer',
            'latitude' => 'decimal:8',
            'longitude' => 'decimal:8',
            'default_break_minutes' => 'integer',
            'default_break_paid' => 'boolean',
            'day_schedules' => 'array',
        ];
    }

    /**
     * Resolve the operating hours and break policy for one weekday.
     *
     * A branch states one standard day and, optionally, overrides for the days
     * that differ. Callers (rostering, payroll, the API) should never have to
     * know which of the two applies, so the merge happens here exactly once.
     *
     * A day marked `closed` returns null opening times rather than being omitted,
     * so "we do not trade on Sunday" stays distinguishable from "nobody has
     * configured Sunday yet".
     *
     * @param  string  $weekday  One of {@see self::WEEKDAYS}.
     * @return array{is_open: bool, opens_at: ?string, closes_at: ?string, break_minutes: ?int, break_paid: bool}
     */
    public function scheduleForWeekday(string $weekday): array
    {
        $override = $this->day_schedules[$weekday] ?? null;

        $default = [
            'is_open' => true,
            'opens_at' => $this->formatTime($this->default_opens_at),
            'closes_at' => $this->formatTime($this->default_closes_at),
            'break_minutes' => $this->default_break_minutes,
            'break_paid' => (bool) $this->default_break_paid,
        ];

        if (! is_array($override)) {
            return $default;
        }

        // A closed day has no hours to report; returning the defaults would
        // wrongly imply the branch trades that day.
        if (array_key_exists('is_open', $override) && $override['is_open'] === false) {
            return [
                'is_open' => false,
                'opens_at' => null,
                'closes_at' => null,
                'break_minutes' => null,
                'break_paid' => false,
            ];
        }

        return [
            'is_open' => true,
            // Each field falls back independently: a day that only overrides its
            // break should keep the standard trading hours.
            'opens_at' => $this->formatTime($override['opens_at'] ?? null) ?? $default['opens_at'],
            'closes_at' => $this->formatTime($override['closes_at'] ?? null) ?? $default['closes_at'],
            'break_minutes' => $override['break_minutes'] ?? $default['break_minutes'],
            'break_paid' => (bool) ($override['break_paid'] ?? $default['break_paid']),
        ];
    }

    /**
     * Normalise a stored time to `HH:MM`.
     *
     * MySQL returns `TIME` columns as `HH:MM:SS`, while the JSON overrides hold
     * whatever the client sent. Both are reduced to the single format the API
     * and the `<input type="time">` control agree on.
     */
    private function formatTime(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return substr($value, 0, 5);
    }


    /**
     * Scope a query to only include active branches.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Get the company that owns the branch.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the employee who manages the branch.
     */
    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    /**
     * Get the users belonging to the branch.
     */
    public function users(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Get the employees assigned to the branch.
     *
     * Employees carry the authoritative branch assignment (`employees.branch_id`);
     * `users.branch_id` is only populated for directly provisioned accounts, so
     * staff totals for a branch must be derived from this relation.
     */
    public function employees(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Employee::class);
    }


    /**
     * Get the shifts belonging to the branch.
     */
    public function shifts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Shift::class);
    }

    /**
     * Get the branch subscriptions covering this branch.
     *
     * A branch may be covered by multiple subscriptions over time; the current
     * one can be resolved via {@see activeBranchSubscription()}.
     */
    public function branchSubscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(BranchSubscription::class);
    }

    /**
     * Get the branch subscription that currently covers this branch, if any.
     *
     * A branch may exist in the database while its paid service is inactive —
     * this returns null in that case.
     */
    public function activeBranchSubscription(): ?BranchSubscription
    {
        return $this->branchSubscriptions()
            ->entitled()
            ->latest('started_at')
            ->first();
    }
}
