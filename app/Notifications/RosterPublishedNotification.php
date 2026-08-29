<?php

namespace App\Notifications;

use App\Enums\RosterChangeType;
use App\Models\Roster;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Notifications\Notification;

/**
 * Notifies an employee that a roster affecting them has been published.
 *
 * The database notification row is created inside the publishing transaction
 * (atomic with the roster state); this class is then dispatched through a
 * queued job after commit to deliver broadcast + push without blocking or
 * rolling back the publish.
 */
class RosterPublishedNotification extends Notification
{
    public function __construct(public Roster $roster) {}

    /**
     * The database channel is handled explicitly in the transaction, so this
     * notification only pushes to realtime and mobile when sent via a job.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['broadcast', 'fcm'];
    }

    /**
     * Get the array representation (used for the in-transaction DB row).
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => RosterChangeType::RosterPublished->value,
            'roster_id' => $this->roster->id,
            'week_start' => optional($this->roster->week_start)->toDateString(),
            'week_end' => optional($this->roster->week_end)->toDateString(),
            'title' => 'Roster published',
            'body' => $this->body(),
        ];
    }

    /**
     * Get the FCM push representation.
     */
    public function toFcm(object $notifiable): FcmMessage
    {
        return (new FcmMessage)
            ->title('Roster published')
            ->body($this->body())
            ->data([
                'type' => RosterChangeType::RosterPublished->value,
                'roster_id' => $this->roster->id,
            ]);
    }

    /**
     * Build the human-readable notification body.
     */
    protected function body(): string
    {
        $weekStart = optional($this->roster->week_start)->toFormattedDateString();

        return trim("Your roster for the week starting {$weekStart} has been published.");
    }
}
