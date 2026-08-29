<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Roster extends Model
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
        'week_start',
        'week_end',
        'status',
        'version',
        'published_at',
        'published_by',
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
            'week_start' => 'date',
            'week_end' => 'date',
            'version' => 'integer',
            'published_at' => 'datetime',
            'published_by' => 'integer',
        ];
    }

    /**
     * Get the activity log options for the model.
     */
    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['status', 'published_at', 'published_by'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs();
    }

    /**
     * Scope a query to only include published rosters.
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', 'published');
    }

    /**
     * Scope a query to only include draft rosters.
     */
    public function scopeDraft(Builder $query): Builder
    {
        return $query->where('status', 'draft');
    }

    /**
     * Check if the roster is published.
     */
    public function isPublished(): bool
    {
        return $this->status === 'published';
    }

    /**
     * Get the company that owns the roster.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Get the branch associated with the roster.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Get the user who published the roster.
     */
    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    /**
     * Get the shifts included in this roster.
     */
    public function shifts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Shift::class);
    }

    /**
     * Get the change/audit history records for this roster.
     */
    public function changes(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(RosterChange::class);
    }
}
