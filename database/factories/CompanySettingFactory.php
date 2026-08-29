<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\CompanySetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\CompanySetting>
 */
class CompanySettingFactory extends Factory
{
    protected $model = CompanySetting::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'timezone' => 'Australia/Sydney',
            'date_format' => 'Y-m-d',
            'time_format' => '24h',
            'week_start_day' => 'Monday',
            'default_shift_duration' => 480,
            'default_break_minutes' => 30,
            'currency' => 'AUD',
            'language' => 'en',
            'allow_shift_swap' => true,
            'allow_employee_availability' => true,
            'allow_leave_requests' => true,
            'allow_push_notifications' => true,
            'logo' => null,
            'primary_color' => '#4F46E5',
            'secondary_color' => '#06B6D4',
        ];
    }
}
