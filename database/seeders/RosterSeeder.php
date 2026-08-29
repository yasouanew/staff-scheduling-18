<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use App\Models\Roster;
use Illuminate\Database\Seeder;
use Carbon\Carbon;

class RosterSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::first();

        if (! $company) {
            return;
        }

        $branches = Branch::where('company_id', $company->id)->get();

        foreach ($branches as $branch) {
            // Current week roster (published)
            $currentMonday = Carbon::now()->startOfWeek();
            Roster::updateOrCreate(
                ['company_id' => $company->id, 'branch_id' => $branch->id, 'week_start' => $currentMonday->toDateString()],
                [
                    'week_end' => $currentMonday->copy()->endOfWeek()->toDateString(),
                    'status' => 'published',
                    'published_at' => now()->subDays(2),
                ]
            );

            // Next week roster (draft)
            $nextMonday = $currentMonday->copy()->addWeek();
            Roster::updateOrCreate(
                ['company_id' => $company->id, 'branch_id' => $branch->id, 'week_start' => $nextMonday->toDateString()],
                [
                    'week_end' => $nextMonday->copy()->endOfWeek()->toDateString(),
                    'status' => 'draft',
                    'published_at' => null,
                ]
            );
        }
    }
}
