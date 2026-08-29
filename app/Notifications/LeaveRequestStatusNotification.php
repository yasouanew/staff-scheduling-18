<?php

namespace App\Notifications;

use App\Models\LeaveRequest;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Notifies an employee that their leave request was approved or rejected.
 *
 * Delivered over two channels:
 *  - database: surfaced in the web dashboard notification bell.
 *  - fcm: pushed to the employee's mobile devices.
 */
class LeaveRequestStatusNotification extends Notification implements ShouldQueue
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
            'type' => 'leave_request.'.$this->leaveRequest->status,
            'leave_request_id' => $this->leaveRequest->id,
            'status' => $this->leaveRequest->status,
            'start_date' => optional($this->leaveRequest->start_date)->toDateString(),
            'end_date' => optional($this->leaveRequest->end_date)->toDateString(),
            'total_days' => $this->leaveRequest->total_days,
            'rejection_reason' => $this->leaveRequest->rejection_reason,
            'title' => $this->title(),
            'body' => $this->body(),
        ];
    }

    /**
     * Get the FCM push representation.
     */
    public function toFcm(object $notifiable): FcmMessage
    {
        return (new FcmMessage)
            ->title($this->title())
            ->body($this->body())
            ->data([
                'type' => 'leave_request.'.$this->leaveRequest->status,
                'leave_request_id' => $this->leaveRequest->id,
                'status' => $this->leaveRequest->status,
            ]);
    }

    /**
     * Build the human-readable notification title.
     */
    protected function title(): string
    {
        return $this->leaveRequest->status === 'approved'
            ? 'Leave request approved'
            : 'Leave request rejected';
    }

    /**
     * Build the human-readable notification body.
     */
    protected function body(): string
    {
        $start = optional($this->leaveRequest->start_date)->toFormattedDateString();
        $end = optional($this->leaveRequest->end_date)->toFormattedDateString();
        $range = $start === $end ? $start : "{$start} - {$end}";

        if ($this->leaveRequest->status === 'approved') {
            return "Your leave for {$range} has been approved.";
        }

        $reason = $this->leaveRequest->rejection_reason;

        return "Your leave for {$range} was rejected.".($reason ? " Reason: {$reason}" : '');
    }
}
