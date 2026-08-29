<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;

class Plan extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'slug',
        'description',
        'price_monthly',
        'price_six_monthly',
        'price_yearly',
        'currency',
        'stripe_monthly_price_id',
        'stripe_six_monthly_price_id',
        'stripe_yearly_price_id',
        'stripe_product_id',
        'max_employees',
        'max_branches',
        'features',
        'is_active',
        'sort_order',
        'metadata',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_monthly' => 'decimal:2',
            'price_six_monthly' => 'decimal:2',
            'price_yearly' => 'decimal:2',
            'currency' => 'string',
            'max_employees' => 'integer',
            'max_branches' => 'integer',
            'features' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'metadata' => 'array',
        ];
    }

    /**
     * Scope a query to only include active plans.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /**
     * Check if the plan allows unlimited employees.
     */
    public function hasUnlimitedEmployees(): bool
    {
        return is_null($this->max_employees);
    }

    /**
     * Check if the plan allows unlimited branches.
     */
    public function hasUnlimitedBranches(): bool
    {
        return is_null($this->max_branches);
    }

    /**
     * Get the subscriptions using this plan.
     */
    public function subscriptions(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    /**
     * The feature links configured for this plan.
     *
     * Named `planFeatures` (not `features`) because the plan already carries a
     * `features` jsonb column for display strings.
     */
    public function planFeatures(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PlanFeature::class);
    }

    /**
     * The features enabled by this plan, through the plan_features pivot.
     */
    public function features(): \Illuminate\Database\Eloquent\Relations\BelongsToMany
    {
        return $this->belongsToMany(Feature::class, 'plan_features')
            ->withPivot('is_enabled', 'limit_value', 'configuration')
            ->withTimestamps();
    }
}
