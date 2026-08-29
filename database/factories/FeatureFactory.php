<?php

namespace Database\Factories;

use App\Models\Feature;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Feature>
 */
class FeatureFactory extends Factory
{
    protected $model = Feature::class;

    /**
     * Define the model's default state.
     *
     * Note: no `unique()` guard here so the factory stays safe across a whole
     * test process — callers override `key` explicitly when they need a
     * specific feature.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $key = fake()->randomElement([
            'roster',
            'employee_management',
            'branch_management',
            'leave',
            'availability',
            'notifications',
            'shift_swap',
            'advanced_reporting',
            'analytics',
            'audit_log',
            'multi_branch',
            'api_access',
            'advanced_permissions',
            'payroll_integration',
        ]);

        return [
            'key' => $key,
            'label' => ucwords(str_replace('_', ' ', $key)),
            'description' => null,
            'is_active' => true,
            'sort_order' => 0,
        ];
    }
}
