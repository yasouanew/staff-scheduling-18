<?php

namespace App\Notifications;

use Illuminate\Auth\Notifications\VerifyEmail as BaseVerifyEmail;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Branded email-verification notification.
 *
 * Extends the framework notification so we keep its battle-tested temporary
 * signed URL generation (pointing at the `verification.verify` route) while
 * customising the mail copy for the ShiftFlow brand.
 */
class VerifyEmailNotification extends BaseVerifyEmail
{
    /**
     * Build the verification mail message shown to the user.
     */
    protected function buildMailMessage($url): MailMessage
    {
        return (new MailMessage)
            ->subject('Verify Your Email Address')
            ->greeting('Welcome to ShiftFlow!')
            ->line('Please confirm your email address to activate your account and secure it against unauthorised access.')
            ->action('Verify Email Address', $url)
            ->line('This verification link will expire in 60 minutes.')
            ->line('If you did not create an account, no further action is required.');
    }
}
