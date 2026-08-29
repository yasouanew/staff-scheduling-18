<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Company;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Branch>
 */
class BranchFactory extends Factory
{
    protected $model = Branch::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'name' => fake()->city() . ' Branch',
            'phone' => fake()->phoneNumber(),
            'address' => fake()->streetAddress() . ', ' . fake()->city() . ' ' . fake()->postcode(),
            'latitude' => fake()->latitude(-37, -27),
            'longitude' => fake()->longitude(140, 153),
            'timezone' => 'Australia/Sydney',
            'status' => 'active',
        ];
    }
}
