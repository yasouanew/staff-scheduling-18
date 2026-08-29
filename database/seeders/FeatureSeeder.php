<?php

namespace Database\Seeders;

use App\Enums\Feature;
use App\Models\Feature as FeatureModel;
use Illuminate\Database\Seeder;

class FeatureSeeder extends Seeder
{
    /**
     * Seed every feature definition from the Feature enum.
     *
     * Adding a feature to the enum and running this seeder is all that is
     * required to make it available to plans — no schema change.
     */
    public function run(): void
    {
        $sortOrder = 0;

        foreach (Feature::cases() as $feature) {
            FeatureModel::updateOrCreate(
                ['key' => $feature->value],
                [
                    'label' => $feature->label(),
                    'description' => $feature->label(),
                    'is_active' => true,
                    'sort_order' => $sortOrder++,
                ]
            );
        }
    }
}
