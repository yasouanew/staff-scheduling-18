<?php

namespace App\Notifications;

use App\Enums\RosterChangeType;
use App\Models\Roster;
use App\Models\RosterChange;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

/**
 * One logical, grouped notification per affected employee per save.
 *
 * The database row is created inside the change transaction via
 * `Notification::create()` (database channel only, synchronous). This class is
 * then queued after commit to deliver the realtime (broadcast) and mobile (fcm)
 * channels without blocking or rolling back the change transaction.
 */
class RosterChangeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * @param  Collection<int, RosterChange>  $changes
     */
    public function __construct(
        public Roster $roster,
        public Collection $changes,
        public string $summary,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['broadcast', 'fcm'];
    }

    /**
     * Array representation — used for the in-transaction database row.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'type' => RosterChangeType::RosterUpdated->value,
            'roster_id' => $this->roster->id,
            'changes' => $this->changes->map(fn (RosterChange $change) => [
                'id' => $change->id,
                'action' => $change->action,
                'shift_id' => $change->shift_id,
                'employee_id' => $change->employee_id,
                'old_data' => $change->old_data,
                'new_data' => $change->new_data,
            ])->values()->all(),
            'title' => 'Roster updated',
            'body' => $this->summary,
        ];
    }

    /**
     * FCM push representation.
     */
    public function toFcm(object $notifiable): FcmMessage
    {
        return (new FcmMessage)
            ->title('Roster updated')
            ->body($this->summary)
            ->data([
                'type' => RosterChangeType::RosterUpdated->value,
                'roster_id' => $this->roster->id,
            ]);
    }
}
