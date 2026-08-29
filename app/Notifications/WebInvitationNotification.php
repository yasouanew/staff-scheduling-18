<?php

namespace App\Notifications;

use App\Models\EmployeeInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Invitation email for browser roles (company admin / scheduler).
 *
 * The link lands on the SPA's `/accept-invitation` screen with the plain token
 * and the invited address, so the set-password form is bound to that exact
 * email — the recipient can never choose which account they are activating.
 */
class WebInvitationNotification extends Notification
{
    use Queueable;

    /**
     * @param  string  $token  Plain single-use invitation token (only ever emailed).
     * @param  string  $roleLabel  Human-readable role, e.g. "Scheduler".
     * @param  string|null  $companyName  The inviting company's name.
     * @param  string|null  $inviterName  Who sent the invitation.
     */
    public function __construct(
        public string $token,
        public string $roleLabel,
        public ?string $companyName = null,
        public ?string $inviterName = null,
    ) {}

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
        $company = $this->companyName ?? config('app.name');
        $hours = (int) floor(config('invitations.web_expires_in_minutes', 2880) / 60);

        $message = (new MailMessage)
            ->subject("You've been invited to join {$company}")
            ->greeting('Hello '.($notifiable->name ?? 'there').'!');

        $message = $this->inviterName !== null
            ? $message->line("{$this->inviterName} has invited you to join {$company} as a {$this->roleLabel}.")
            : $message->line("You have been invited to join {$company} as a {$this->roleLabel}.");

        return $message
            ->line('Click the button below to set your password and activate your account.')
            ->action('Set your password', $this->invitationUrl($notifiable))
            ->line("For your security this link expires in {$hours} hours and can only be used once.")
            ->line('If you were not expecting this invitation, no action is required.');
    }

    /**
     * Build the SPA URL that renders the set-password form.
     */
    protected function invitationUrl(object $notifiable): string
    {
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        return $frontendUrl.'/accept-invitation?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->email,
        ]);
    }

    /**
     * Channel recorded on the invitation this notification represents.
     */
    public function channelName(): string
    {
        return EmployeeInvitation::CHANNEL_WEB;
    }
}
