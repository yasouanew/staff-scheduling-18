<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            // Foundation data
            FeatureSeeder::class,
            PlanSeeder::class,
            PlanFeatureSeeder::class,
            CompanySeeder::class,

            // Roles & permissions (must be before users)
            RoleAndPermissionSeeder::class,

            // Company structure
            BranchSeeder::class,
            DepartmentSeeder::class,
            PositionSeeder::class,

            // Users & employees
            UserSeeder::class,
            EmployeeSeeder::class,
            EmployeeAvailabilitySeeder::class,

            // Subscriptions & payments
            SubscriptionSeeder::class,
            SubscriptionPaymentSeeder::class,

            // Scheduling
            ShiftTemplateSeeder::class,
            RosterSeeder::class,
            ShiftSeeder::class,

            // Leave management
            LeaveTypeSeeder::class,
            LeaveRequestSeeder::class,

            // Device tokens
            DeviceTokenSeeder::class,
        ]);
    }
}
