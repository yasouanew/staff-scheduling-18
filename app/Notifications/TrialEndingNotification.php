<?php

namespace App\Notifications;

use App\Models\Company;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TrialEndingNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Company $company,
        public int $daysRemaining,
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
            'type' => 'billing.trial_ending',
            'company_id' => $this->company->id,
            'trial_ends_at' => $this->company->trial_ends_at?->toIso8601String(),
            'days_remaining' => $this->daysRemaining,
            'title' => 'Your trial is ending soon',
            'body' => $this->body(),
            'action_url' => $this->subscriptionUrl(),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Rosterly trial is ending soon')
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->body())
            ->action('Choose a subscription', $this->subscriptionUrl())
            ->line('Your roster data will remain secure. Activate a subscription before the trial ends to keep uninterrupted access.');
    }

    protected function body(): string
    {
        $dayLabel = $this->daysRemaining === 1 ? 'day' : 'days';

        return "Your {$this->company->name} trial ends in {$this->daysRemaining} {$dayLabel}. Choose a plan to keep your team scheduling workspace active.";
    }

    protected function subscriptionUrl(): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$this->company->id.'/subscriptions';
    }
}
