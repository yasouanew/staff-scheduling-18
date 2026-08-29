<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single, immutable record of a roster change.
 *
 * Every post-publication mutation writes one row here with JSONB snapshots of
 * the affected shift before and after the change. This is the authoritative
 * audit history (distinct from the generic Spatie activity log), and it also
 * drives the grouped per-employee notifications.
 */
class RosterChange extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'roster_id',
        'shift_id',
        'employee_id',
        'action',
        'old_data',
        'new_data',
        'performed_by',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'roster_id' => 'integer',
            'shift_id' => 'integer',
            'employee_id' => 'integer',
            'old_data' => 'array',
            'new_data' => 'array',
            'performed_by' => 'integer',
        ];
    }

    /**
     * Get the roster this change belongs to.
     */
    public function roster(): BelongsTo
    {
        return $this->belongsTo(Roster::class);
    }

    /**
     * Get the shift affected by this change (null when it was since deleted).
     */
    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    /**
     * Get the employee this change directly affects.
     */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /**
     * Get the user who performed the change.
     */
    public function performer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
