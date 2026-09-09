<?php

namespace App\Notifications;

use App\Models\Company;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Warns company admins that their plan's active-user seat allowance is full.
 *
 * Fired by {@see \App\Services\SeatCapacityService} the moment a seat-consuming
 * action (sending a new invitation) is refused because every seat is taken. The
 * notification:
 *
 *  - lands in the in-app inbox (database channel) so the admin sees it on the
 *    next dashboard load, and
 *  - is emailed, so the administrator learns about the blocked onboarding even
 *    if they are not signed in.
 *
 * Outstanding invitations are force-expired at the same moment (see
 * SeatCapacityService::expireOutstandingInvitations()), so the copy also tells
 * the admin that pending invites no longer work.
 */
class SeatLimitReachedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Company $company,
        public int $seatsUsed,
        public int $seatsLimit,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'broadcast', 'mail'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            // `billing_alert` is one of the categories the web inbox renders
            // (see resources/js/types/notification.ts NOTIFICATION_TYPES).
            'type' => 'billing_alert',
            'company_id' => $this->company->id,
            'seats_used' => $this->seatsUsed,
            'seats_limit' => $this->seatsLimit,
            'title' => 'Seat limit reached',
            'body' => $this->body(),
            'action_url' => $this->subscriptionUrl(),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Rosterly plan is out of seats')
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->body())
            ->line('Any invitations that were still waiting to be accepted have been expired, so their links and codes no longer work.')
            ->action('Upgrade plan', $this->subscriptionUrl())
            ->line('Upgrade your plan to add more members, or deactivate a member to free a seat.');
    }

    protected function body(): string
    {
        return "Your plan allows {$this->seatsLimit} active members and all {$this->seatsLimit} seats are in use. New invitations are blocked until a seat is freed.";
    }

    protected function subscriptionUrl(): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$this->company->id.'/subscriptions';
    }
}
