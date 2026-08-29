<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;

class LeaveType extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'name',
        'code',
        'description',
        'allowance_days',
        'is_paid',
        'allows_rollover',
        'max_rollover_days',
        'requires_approval',
        'allow_half_day',
        'max_days_per_request',
        'color',
        'status',
        'created_by',
        'updated_by',
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
            'allowance_days' => 'decimal:1',
            'is_paid' => 'boolean',
            'allows_rollover' => 'boolean',
            'max_rollover_days' => 'decimal:1',
            'requires_approval' => 'boolean',
            'allow_half_day' => 'boolean',
            'max_days_per_request' => 'integer',
            'created_by' => 'integer',
            'updated_by' => 'integer',
        ];
    }

    /**
     * Scope a query to only include active leave types.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /**
     * Get the company that owns the leave type.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the user who created the leave type.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who updated the leave type.
     */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get leave requests associated with this leave type.
     */
    public function leaveRequests(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
