<?php

namespace App\Notifications\Channels;

use App\Models\DeviceToken;
use App\Notifications\Messages\FcmMessage;
use Illuminate\Contracts\Container\Container;
use Illuminate\Notifications\Notification;

use Illuminate\Support\Facades\Log;
use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Exception\Messaging\NotFound;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification as FirebaseNotification;
use Throwable;

/**
 * Delivers notifications to the mobile app via Firebase Cloud Messaging.
 *
 * The channel resolves all active device tokens for the notifiable and sends
 * an individual message to each. Tokens that Firebase reports as invalid or
 * unregistered are automatically deactivated so we stop targeting dead devices.
 */
class FcmChannel
{
    public function __construct(protected Container $container) {}

    /**
     * Send the given notification.
     */
    public function send(object $notifiable, Notification $notification): void
    {
        if (! method_exists($notification, 'toFcm')) {
            return;
        }

        $tokens = $this->tokensFor($notifiable);

        if ($tokens->isEmpty()) {
            return;
        }

        // Firebase credentials are optional (they are absent in local/test
        // environments), so resolve the messaging client lazily and skip
        // delivery instead of failing the request that triggered it.
        $messaging = $this->messaging();

        if (! $messaging instanceof Messaging) {
            return;
        }

        /** @var FcmMessage $message */
        $message = $notification->toFcm($notifiable);

        foreach ($tokens as $deviceToken) {
            $this->sendToToken($messaging, $deviceToken, $message);
        }
    }

    /**
     * Resolve the Firebase messaging client, or null when it is unavailable.
     */
    protected function messaging(): ?Messaging
    {
        try {
            return $this->container->make(Messaging::class);
        } catch (Throwable $e) {
            Log::warning('FCM push notifications are disabled: Firebase is not configured.', [
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }


    /**
     * Resolve the active device tokens for the notifiable.
     *
     * @return \Illuminate\Support\Collection<int, DeviceToken>
     */
    protected function tokensFor(object $notifiable)
    {
        // Allow a notifiable to customise how its device tokens are resolved.
        if (method_exists($notifiable, 'routeNotificationForFcm')) {
            return collect($notifiable->routeNotificationForFcm());
        }

        if (method_exists($notifiable, 'deviceTokens')) {
            return $notifiable->deviceTokens()->active()->get();
        }

        return collect();
    }

    /**
     * Send a single message to one device token.
     */
    protected function sendToToken(Messaging $messaging, DeviceToken $deviceToken, FcmMessage $message): void
    {
        $cloudMessage = CloudMessage::withTarget('token', $deviceToken->token)
            ->withNotification(FirebaseNotification::create($message->title, $message->body))
            ->withData($message->data);

        try {
            $messaging->send($cloudMessage);
        } catch (NotFound) {

            // The token is no longer registered on this device; stop using it.
            $deviceToken->update(['is_active' => false]);
        } catch (Throwable $e) {
            Log::warning('FCM push notification failed.', [
                'device_token_id' => $deviceToken->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
