<?php

namespace App\Notifications;

use App\Models\Company;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TrialExpiredNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public Company $company,
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
            'type' => 'billing.trial_expired',
            'company_id' => $this->company->id,
            'title' => 'Your trial has ended',
            'body' => $this->body(),
            'action_url' => $this->subscriptionUrl(),
        ];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Your Rosterly trial has ended')
            ->greeting('Hello '.$notifiable->name.',')
            ->line($this->body())
            ->action('Choose a subscription', $this->subscriptionUrl())
            ->line('Your team data remains secure. Activate a subscription to restore uninterrupted access.');
    }

    protected function body(): string
    {
        return "The trial for {$this->company->name} has ended. Your data is safe — choose a plan to restore access to your team scheduling workspace.";
    }

    protected function subscriptionUrl(): string
    {
        $baseUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        return $baseUrl.'/companies/'.$this->company->id.'/subscriptions';
    }
}
