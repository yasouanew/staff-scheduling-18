<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Company;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
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

        $branches = [
            [
                'name' => 'Sydney CBD',
                'phone' => '+61 2 9000 1001',
                'address' => '100 George St, Sydney NSW 2000',
                'latitude' => -33.86785,
                'longitude' => 151.20732,
                'timezone' => 'Australia/Sydney',
            ],
            [
                'name' => 'Melbourne Central',
                'phone' => '+61 3 9000 2001',
                'address' => '300 Collins St, Melbourne VIC 3000',
                'latitude' => -37.81621,
                'longitude' => 144.96399,
                'timezone' => 'Australia/Melbourne',
            ],
            [
                'name' => 'Brisbane South',
                'phone' => '+61 7 3000 3001',
                'address' => '200 Adelaide St, Brisbane QLD 4000',
                'latitude' => -27.46794,
                'longitude' => 153.02809,
                'timezone' => 'Australia/Brisbane',
            ],
        ];

        foreach ($branches as $branchData) {
            Branch::updateOrCreate(
                ['company_id' => $company->id, 'name' => $branchData['name']],
                array_merge($branchData, [
                    'company_id' => $company->id,
                    'status' => 'active',
                ])
            );
        }
    }
}
