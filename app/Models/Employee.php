<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Employee extends Model
{
    use HasFactory, LogsActivity;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'user_id',
        'department_id',
        'position_id',
        'branch_id',
        'first_name',
        'last_name',
        'employee_number',
        'employment_type',
        'dob',
        'gender',
        'address',
        'emergency_contact',
        'emergency_phone',
        'hire_date',
        'termination_date',
        'hourly_rate',
        'photo',
        'status',
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
            'user_id' => 'integer',
            'department_id' => 'integer',
            'position_id' => 'integer',
            'branch_id' => 'integer',
            'dob' => 'date',
            'hire_date' => 'date',
            'termination_date' => 'date',
            'hourly_rate' => 'decimal:2',
        ];
    }

    /**
     * Get the activity log options for the model.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['first_name', 'last_name', 'employment_type', 'status', 'department_id', 'position_id', 'branch_id'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs();
    }

    /**
     * Get the employee's full name.
     */
    public function getFullNameAttribute(): string
    {
        return "{$this->first_name} {$this->last_name}";
    }

    /**
     * Scope a query to only include active employees.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Get the company that owns the employee.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the user linked to this employee profile.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the department of the employee.
     */
    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    /**
     * Get the position of the employee.
     */
    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    /**
     * Get the primary branch of the employee.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Get the onboarding invitation issued for this employee, when one exists.
     */
    public function invitation(): \Illuminate\Database\Eloquent\Relations\HasOne
    {
        return $this->hasOne(EmployeeInvitation::class);
    }

    /**
     * Get availability preferences for the employee.
     */
    public function availabilities(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(EmployeeAvailability::class);

    }

    /**
     * Get shifts assigned to the employee.
     */
    public function shifts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Shift::class);
    }

    /**
     * Get leave requests submitted by the employee.
     */
    public function leaveRequests(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
