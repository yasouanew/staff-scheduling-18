<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DeviceToken\DeleteDeviceTokenRequest;
use App\Http\Requests\DeviceToken\RegisterDeviceTokenRequest;
use App\Http\Resources\DeviceTokenResource;
use App\Services\DeviceTokenService;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;

class DeviceTokenController extends Controller
{
    use ApiResponse;

    public function __construct(private DeviceTokenService $deviceTokenService) {}

    /**
     * Register the authenticated user's device token for push notifications.
     */
    public function store(RegisterDeviceTokenRequest $request): JsonResponse
    {
        $deviceToken = $this->deviceTokenService->register(
            $request->user(),
            $request->validated()
        );

        return $this->successResponse(
            new DeviceTokenResource($deviceToken),
            'Device token registered successfully.',
            201
        );
    }

    /**
     * Unregister the authenticated user's device token.
     */
    public function destroy(DeleteDeviceTokenRequest $request): JsonResponse
    {
        $this->deviceTokenService->unregister(
            $request->user(),
            $request->validated()['token']
        );

        return $this->successResponse(null, 'Device token unregistered successfully.');
    }
}
