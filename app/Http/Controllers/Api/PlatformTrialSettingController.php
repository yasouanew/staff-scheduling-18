<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformTrialSettingController extends Controller
{
    use ApiResponse;

    /**
     * Return the registration trial duration configured for the platform.
     */
    public function show(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        return $this->successResponse([
            'trial_period_days' => PlatformSetting::current()->trial_period_days,
        ], 'Trial period setting retrieved successfully.');
    }

    /**
     * Update the registration trial duration used for future company sign-ups.
     */
    public function update(Request $request): JsonResponse
    {
        $this->ensureSuperAdmin($request);

        $validated = $request->validate([
            'trial_period_days' => ['required', 'integer', 'min:1', 'max:365'],
        ]);

        $setting = PlatformSetting::current();
        $setting->update($validated);

        return $this->successResponse([
            'trial_period_days' => $setting->trial_period_days,
        ], 'Trial period setting updated successfully.');
    }

    private function ensureSuperAdmin(Request $request): void
    {
        $user = $request->user();

        abort_unless(
            $user && ($user->hasRole('super_admin') || $user->role === 'super_admin'),
            403,
            'Only super administrators can manage the trial period.'
        );
    }
}
