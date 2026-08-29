<?php

namespace App\Notifications\Messages;

/**
 * A simple value object describing an FCM push notification payload.
 *
 * Returned from a notification's `toFcm()` method and consumed by the
 * FcmChannel, which delivers it to all of the notifiable's active device
 * tokens via Firebase Cloud Messaging.
 */
class FcmMessage
{
    /**
     * The notification title.
     */
    public string $title = '';

    /**
     * The notification body.
     */
    public string $body = '';

    /**
     * Arbitrary key/value data payload (all values must be strings for FCM).
     *
     * @var array<string, string>
     */
    public array $data = [];

    /**
     * Set the notification title.
     */
    public function title(string $title): self
    {
        $this->title = $title;

        return $this;
    }

    /**
     * Set the notification body.
     */
    public function body(string $body): self
    {
        $this->body = $body;

        return $this;
    }

    /**
     * Set the data payload. Values are cast to strings as required by FCM.
     *
     * @param  array<string, mixed>  $data
     */
    public function data(array $data): self
    {
        $this->data = array_map(static fn ($value) => (string) $value, $data);

        return $this;
    }
}
