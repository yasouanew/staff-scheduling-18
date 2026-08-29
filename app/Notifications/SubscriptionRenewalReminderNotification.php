<?php

namespace App\Notifications;

use App\Models\Subscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionRenewalReminderNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Subscription $subscription,
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
            'type' => 'billing.subscription_renewal_reminder',
            'subscription_id' => $this->subscription->id,
            'company_id' => $this->subscription->company_id,
            'plan_name' => $this->subscription->plan?->name,
            'ends_at' => $this->subscription->ends_at?->toIso8601String(),
            'days_remaining' => $this->daysRemaining,
            'title' => 'Subscription renewal is approaching',
            'body' => $this->body(),
            'action_url' => $this->subscriptionUrl(),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Rosterly subscription renewal is approaching')
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->body())
            ->action('Review subscription', $this->subscriptionUrl())
            ->line('Review your subscription before its renewal date to avoid any interruption to your scheduling workspace.');
    }

    protected function body(): string
    {
        $dayLabel = $this->daysRemaining === 1 ? 'day' : 'days';
        $planName = $this->subscription->plan?->name ?? 'current';

        return "Your {$planName} subscription reaches its renewal date in {$this->daysRemaining} {$dayLabel}.";
    }

    protected function subscriptionUrl(): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$this->subscription->company_id.'/subscriptions';
    }
}
