<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    use ApiResponse;

    /**
     * List the authenticated user's notifications (most recent first).
     *
     * Pass ?filter=unread to only return unread notifications.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = match ($request->query('filter')) {
            'unread' => $user->unreadNotifications(),
            'read' => $user->readNotifications(),
            default => $user->notifications(),
        };

        $perPage = max(1, min((int) $request->query('per_page', 15), 100));
        $notifications = $query->paginate($perPage);

        return $this->successResponse([
            'notifications' => NotificationResource::collection($notifications),
            'unread_count' => $user->unreadNotifications()->count(),
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
            ],
        ], 'Notifications retrieved successfully.');
    }

    /**
     * Mark a single notification as read.
     */
    public function markAsRead(Request $request, string $notification): JsonResponse
    {
        $model = $request->user()->notifications()->findOrFail($notification);

        $model->markAsRead();

        return $this->successResponse(
            new NotificationResource($model->refresh()),
            'Notification marked as read.'
        );
    }

    /**
     * Mark all of the user's unread notifications as read.
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return $this->successResponse(null, 'All notifications marked as read.');
    }

    /**
     * Delete a single notification.
     */
    public function destroy(Request $request, string $notification): JsonResponse
    {
        $model = $request->user()->notifications()->findOrFail($notification);

        $model->delete();

        return $this->successResponse(null, 'Notification deleted successfully.');
    }
}
