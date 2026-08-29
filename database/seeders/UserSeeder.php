<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $company = Company::first();
        $branch = $company?->branches()->first();

        // Super Admin (no company)
        $superAdmin = User::updateOrCreate(
            ['email' => 'superadmin@staffsaas.com'],
            [
                'company_id' => null,
                'branch_id' => null,
                'name' => 'Super Admin',
                'phone' => '+61 400 000 001',
                'password' => Hash::make('password'),
                'role' => 'super_admin',
                'status' => 'active',
                'email_verified_at' => now(),
            ]
        );
        $superAdmin->syncRoles('super_admin');

        // Company Admin
        $companyAdmin = User::updateOrCreate(
            ['email' => 'admin@demo-corp.com'],
            [
                'company_id' => $company?->id,
                'branch_id' => $branch?->id,
                'name' => 'Company Admin',
                'phone' => '+61 400 000 002',
                'password' => Hash::make('password'),
                'role' => 'company_admin',
                'status' => 'active',
                'email_verified_at' => now(),
            ]
        );
        $companyAdmin->syncRoles('company_admin');

        // Scheduler
        $scheduler = User::updateOrCreate(
            ['email' => 'scheduler@demo-corp.com'],
            [
                'company_id' => $company?->id,
                'branch_id' => $branch?->id,
                'name' => 'Scheduler User',
                'phone' => '+61 400 000 003',
                'password' => Hash::make('password'),
                'role' => 'scheduler',
                'status' => 'active',
                'email_verified_at' => now(),
            ]
        );
        $scheduler->syncRoles('scheduler');

        // Employee users
        if ($company) {
            $employees = User::factory(10)->create([
                'company_id' => $company->id,
                'branch_id' => $branch?->id,
                'role' => 'employee',
            ]);
            foreach ($employees as $employee) {
                $employee->syncRoles('employee');
            }
        }
    }
}
