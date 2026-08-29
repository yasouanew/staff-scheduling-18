<?php

namespace App\Models;

use App\Enums\Feature as FeatureKey;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Feature extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'key',
        'label',
        'description',
        'is_active',
        'sort_order',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /**
     * Resolve the enum instance for this feature's key.
     */
    public function keyEnum(): ?FeatureKey
    {
        return FeatureKey::tryFrom($this->key);
    }

    /**
     * The plans that enable this feature.
     */
    public function plans(): BelongsToMany
    {
        return $this->belongsToMany(Plan::class, 'plan_features')
            ->withPivot('is_enabled', 'limit_value', 'configuration')
            ->withTimestamps();
    }

    /**
     * The pivot rows linking this feature to plans.
     */
    public function planFeatures(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PlanFeature::class);
    }
}
