<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Roster;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Roster>
 */
class RosterFactory extends Factory
{
    protected $model = Roster::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $start = Carbon::now()->startOfWeek();
        $end = (clone $start)->endOfWeek();

        return [
            'company_id' => Company::factory(),
            'branch_id' => Branch::factory(),
            'week_start' => $start->toDateString(),
            'week_end' => $end->toDateString(),
            'status' => 'draft',
            'version' => 1,
            'published_at' => null,
            'published_by' => null,
        ];
    }
}
