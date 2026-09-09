<?php

namespace App\Exceptions;

use Exception;

/**
 * Raised when an administrator tries to hand-flip a directory row to `active`
 * while the linked login account is still `invited` — i.e. the person has not
 * yet accepted their invitation (chosen a password).
 *
 * Under the aligned per-seat model an `active` member must always mean a real,
 * accepted login: it is the only status that consumes a seat. Acceptance (the
 * web set-password link, the mobile code flow, or the reset-password promotion)
 * is the *only* path that flips an invited account and its pending row to
 * `active` — the seat guard runs there. An admin flipping the status dropdown
 * to Active on a member who has not accepted would re-introduce the mismatch
 * where a member shows as Active while consuming no seat, so it is refused
 * regardless of how many seats are free (it is not a capacity problem).
 *
 * Controllers translate this into a structured API response:
 *
 *     {
 *         "success": false,
 *         "message": "This member hasn't accepted their invitation yet. They become Active automatically once they accept.",
 *         "code": "INVITATION_PENDING",
 *         "errors": { "status": "pending" }
 *     }
 */
class InvitationPendingException extends Exception
{
    /**
     * The machine-readable error code, e.g. `INVITATION_PENDING`.
     */
    public readonly string $errorCode;

    /**
     * Structured diagnostic details.
     *
     * @var array<string, mixed>
     */
    public readonly array $context;

    /**
     * @param  array<string, mixed>  $context
     */
    public function __construct(
        string $message = "This member hasn't accepted their invitation yet. They become Active automatically once they accept.",
        string $errorCode = 'INVITATION_PENDING',
        array $context = [],
        int $status = 422,
    ) {
        $this->errorCode = $errorCode;
        $this->context = $context;

        parent::__construct($message, $status);
    }
}
