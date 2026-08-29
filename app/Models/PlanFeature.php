<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlanFeature extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'plan_id',
        'feature_id',
        'is_enabled',
        'limit_value',
        'configuration',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'limit_value' => 'integer',
            'configuration' => 'array',
        ];
    }

    /**
     * The plan that owns this feature link.
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /**
     * The feature linked to the plan.
     */
    public function feature(): BelongsTo
    {
        return $this->belongsTo(Feature::class);
    }
}
