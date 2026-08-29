<?php

namespace App\Notifications;

use App\Models\LeaveRequest;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Notifies company administrators that a new leave request needs review.
 *
 * Delivered over the database channel (web dashboard) and fcm (mobile).
 */
class LeaveRequestSubmittedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public LeaveRequest $leaveRequest) {}

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast', 'fcm'];
    }

    /**
     * Get the array representation stored in the database channel.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => 'leave_request.submitted',
            'leave_request_id' => $this->leaveRequest->id,
            'employee_id' => $this->leaveRequest->employee_id,
            'employee_name' => $this->employeeName(),
            'start_date' => optional($this->leaveRequest->start_date)->toDateString(),
            'end_date' => optional($this->leaveRequest->end_date)->toDateString(),
            'total_days' => $this->leaveRequest->total_days,
            'title' => 'New leave request',
            'body' => $this->body(),
        ];
    }

    /**
     * Get the FCM push representation.
     */
    public function toFcm(object $notifiable): FcmMessage
    {
        return (new FcmMessage)
            ->title('New leave request')
            ->body($this->body())
            ->data([
                'type' => 'leave_request.submitted',
                'leave_request_id' => $this->leaveRequest->id,
            ]);
    }

    /**
     * Resolve the requesting employee's name.
     */
    protected function employeeName(): string
    {
        $employee = $this->leaveRequest->employee;

        return $employee ? $employee->full_name : 'An employee';
    }

    /**
     * Build the human-readable notification body.
     */
    protected function body(): string
    {
        $start = optional($this->leaveRequest->start_date)->toFormattedDateString();
        $end = optional($this->leaveRequest->end_date)->toFormattedDateString();
        $range = $start === $end ? $start : "{$start} - {$end}";

        return "{$this->employeeName()} requested leave for {$range}.";
    }
}
