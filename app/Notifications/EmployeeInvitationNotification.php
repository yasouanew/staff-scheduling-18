<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EmployeeInvitationNotification extends Notification
{
    use Queueable;

    /**
     * Create a new notification instance.
     *
     * @param  string  $token  The password-reset token used to set the initial password.
     * @param  string|null  $companyName  The inviting company's name.
     */
    public function __construct(public string $token, public ?string $companyName = null) {}

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->invitationUrl($notifiable);

        $expire = config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60);

        $companyName = $this->companyName ?? config('app.name');

        return (new MailMessage)
            ->subject("You've been invited to join {$companyName}")
            ->greeting('Hello '.($notifiable->name ?? '').'!')
            ->line("You have been invited to join {$companyName} on ".config('app.name').'.')
            ->line('Click the button below to set your password and activate your account.')
            ->action('Accept Invitation', $url)
            ->line("This invitation link will expire in {$expire} minutes.")
            ->line('If you were not expecting this invitation, no action is required.');
    }

    /**
     * Build the frontend invitation acceptance URL.
     */
    protected function invitationUrl(object $notifiable): string
    {
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        return $frontendUrl.'/accept-invitation?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);
    }
}
