<?php

namespace App\Notifications;

use App\Models\EmployeeInvitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Invitation email for the `employee` role.
 *
 * Employees have no browser access, so this email does not contain a password
 * link. Instead it guides them to download the mobile app; once installed they
 * enter this same email address in the app, receive a one-time code by email,
 * verify it and then choose their password.
 */
class MobileInvitationNotification extends Notification
{
    use Queueable;

    /**
     * @param  string|null  $companyName  The inviting company's name.
     * @param  string|null  $inviterName  Who sent the invitation.
     */
    public function __construct(
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
        $appName = config('app.name');

        $message = (new MailMessage)
            ->subject("Download the {$appName} app to join {$company}")
            ->greeting('Hello '.($notifiable->name ?? 'there').'!');

        $message = $this->inviterName !== null
            ? $message->line("{$this->inviterName} has added you to the team at {$company}.")
            : $message->line("You have been added to the team at {$company}.");

        return $message
            ->line("Your roster, shifts and leave all live in the {$appName} mobile app. Get started in three quick steps.")
            ->action('Download the app', $this->downloadUrl($notifiable))
            ->line("1. Install the {$appName} app on your phone.")
            ->line("2. Open the app and enter your email address: {$notifiable->email}")
            ->line('3. We will email you a 6-digit code — enter it in the app, then choose your password.')
            ->line('If you were not expecting this invitation, no action is required.');
    }

    /**
     * Build the "download the app" landing URL.
     *
     * The address is carried through so the landing page (and the app store deep
     * link) can pre-fill the sign-in email and remove a step for the employee.
     */
    protected function downloadUrl(object $notifiable): string
    {
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        return $frontendUrl.'/download-app?'.http_build_query([
            'email' => $notifiable->email,
        ]);
    }

    /**
     * Channel recorded on the invitation this notification represents.
     */
    public function channelName(): string
    {
        return EmployeeInvitation::CHANNEL_MOBILE;
    }
}
