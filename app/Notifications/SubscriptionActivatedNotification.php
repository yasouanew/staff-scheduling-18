<?php

namespace App\Notifications;

use App\Models\Subscription;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionActivatedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Subscription $subscription) {}

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
            'type' => 'billing.subscription_activated',
            'subscription_id' => $this->subscription->id,
            'company_id' => $this->subscription->company_id,
            'plan_name' => $this->subscription->plan?->name,
            'billing_cycle' => $this->subscription->billing_cycle,
            'ends_at' => $this->subscription->ends_at?->toIso8601String(),
            'title' => 'Subscription activated',
            'body' => $this->body(),
            'action_url' => $this->subscriptionUrl(),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Rosterly subscription is active')
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->body())
            ->action('View subscription', $this->subscriptionUrl())
            ->line('Your workspace is active and ready for your team.');
    }

    protected function body(): string
    {
        $planName = $this->subscription->plan?->name ?? 'selected';
        $term = match ($this->subscription->billing_cycle) {
            'six_month' => 'six-month',
            'yearly' => 'annual',
            default => 'monthly',
        };

        return "Your {$planName} {$term} subscription has been activated. Your Rosterly workspace is now unlocked.";
    }

    protected function subscriptionUrl(): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$this->subscription->company_id.'/subscriptions';
    }
}
