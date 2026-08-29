<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleAndPermissionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Define permissions grouped by module
        $permissions = [
            // Company management
            'company.view', 'company.create', 'company.edit', 'company.delete',

            // Branch management
            'branch.view', 'branch.create', 'branch.edit', 'branch.delete',

            // User management
            'user.view', 'user.create', 'user.edit', 'user.delete',

            // Employee management
            'employee.view', 'employee.create', 'employee.edit', 'employee.delete',

            // Department management
            'department.view', 'department.create', 'department.edit', 'department.delete',

            // Position management
            'position.view', 'position.create', 'position.edit', 'position.delete',

            // Roster & shift management
            'roster.view', 'roster.create', 'roster.edit', 'roster.delete', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'shift_template.view', 'shift_template.create', 'shift_template.edit', 'shift_template.delete',

            // Leave management
            'leave_type.view', 'leave_type.create', 'leave_type.edit', 'leave_type.delete',
            'leave_request.view', 'leave_request.create', 'leave_request.approve', 'leave_request.reject',

            // Subscription & billing management
            'subscription.view', 'subscription.manage', 'subscription.refund',


            // Reports
            'report.view',

            // Settings
            'settings.view', 'settings.edit',
        ];

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // Super Admin — all permissions
        $superAdmin = Role::updateOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        $superAdmin->syncPermissions(Permission::all());

        // Company Admin — all except company create/delete. The business owner
        // manages the company's own subscription (upgrade/downgrade/cancel) via
        // the Subscription & Billing dashboard, so `subscription.manage` stays.
        $companyAdmin = Role::updateOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
        $companyAdmin->syncPermissions(Permission::whereNotIn('name', [
            'company.create', 'company.delete',
        ])->get());

        // Scheduler — roster, shift, employee view, leave view/approve
        $scheduler = Role::updateOrCreate(['name' => 'scheduler', 'guard_name' => 'web']);
        $scheduler->syncPermissions([
            'branch.view',
            'employee.view',
            'department.view',
            'position.view',
            'roster.view', 'roster.create', 'roster.edit', 'roster.publish',
            'shift.view', 'shift.create', 'shift.edit', 'shift.delete',
            'shift_template.view', 'shift_template.create', 'shift_template.edit',
            'leave_request.view', 'leave_request.approve', 'leave_request.reject',
            'report.view',
        ]);

        // Employee — view own data, submit leave
        $employee = Role::updateOrCreate(['name' => 'employee', 'guard_name' => 'web']);
        $employee->syncPermissions([
            'shift.view',
            'roster.view',
            'leave_request.view', 'leave_request.create',
        ]);
    }
}
