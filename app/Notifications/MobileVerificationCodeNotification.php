<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * The one-time code the mobile app requests after an employee enters their email.
 *
 * Deliberately link-free: the code must be typed into the app that asked for it,
 * which is what proves the person holds both the mailbox and the device.
 */
class MobileVerificationCodeNotification extends Notification
{
    use Queueable;

    /**
     * @param  string  $code  The plain 6-digit code (only ever emailed).
     * @param  int  $expiresInMinutes  Validity window shown to the recipient.
     */
    public function __construct(
        public string $code,
        public int $expiresInMinutes = 15,
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
        return (new MailMessage)
            ->subject('Your verification code: '.$this->code)
            ->greeting('Hello '.($notifiable->name ?? 'there').'!')
            ->line('Enter this code in the app to verify your email address:')
            ->line('**'.$this->code.'**')
            ->line("The code expires in {$this->expiresInMinutes} minutes.")
            ->line('If you did not request this code, you can safely ignore this email.');
    }
}
