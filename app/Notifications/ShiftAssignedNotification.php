<?php

namespace App\Notifications;

use App\Models\Shift;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

/**
 * Notifies an employee that they have been assigned to a shift.
 *
 * Delivered over the database channel (web dashboard) and fcm (mobile).
 */
class ShiftAssignedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Shift $shift) {}

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
            'type' => 'shift.assigned',
            'shift_id' => $this->shift->id,
            'date' => optional($this->shift->date)->toDateString(),
            'start_time' => $this->shift->start_time,
            'end_time' => $this->shift->end_time,
            'title' => 'New shift assigned',
            'body' => $this->body(),
        ];
    }

    /**
     * Get the FCM push representation.
     */
    public function toFcm(object $notifiable): FcmMessage
    {
        return (new FcmMessage)
            ->title('New shift assigned')
            ->body($this->body())
            ->data([
                'type' => 'shift.assigned',
                'shift_id' => $this->shift->id,
            ]);
    }

    /**
     * Build the human-readable notification body.
     */
    protected function body(): string
    {
        $date = optional($this->shift->date)->toFormattedDateString();

        return trim("You have been assigned a shift on {$date} from {$this->shift->start_time} to {$this->shift->end_time}.");
    }
}
