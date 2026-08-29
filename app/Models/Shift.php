<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Shift extends Model
{
    use HasFactory, LogsActivity;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'branch_id',
        'roster_id',
        'employee_id',
        'position_id',
        'department_id',
        'date',
        'start_time',
        'end_time',
        'break_minutes',
        'paid_break',
        'required_staff',
        'status',
        'notes',
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
            'branch_id' => 'integer',
            'roster_id' => 'integer',
            'employee_id' => 'integer',
            'position_id' => 'integer',
            'department_id' => 'integer',
            'date' => 'date',
            'break_minutes' => 'integer',
            'paid_break' => 'boolean',
            'required_staff' => 'integer',
        ];
    }

    /**
     * Get the activity log options for the model.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['employee_id', 'date', 'start_time', 'end_time', 'status'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs();
    }

    /**
     * Scope a query to only scheduled shifts.
     */
    public function scopeScheduled(Builder $query): Builder
    {
        return $query->where('status', 'scheduled');
    }

    /**
     * Get the company that owns the shift.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the branch associated with the shift.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Get the roster that owns the shift.
     */
    public function roster(): BelongsTo
    {
        return $this->belongsTo(Roster::class);
    }

    /**
     * Get the employee assigned to the shift.
     */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * Get the position associated with the shift.
     */
    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    /**
     * Get the department associated with the shift.
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}
