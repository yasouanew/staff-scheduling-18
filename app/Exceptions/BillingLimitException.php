<?php

namespace App\Exceptions;

use Exception;

/**
 * Raised when a subscription change (upgrade / downgrade) violates a plan
 * allowance that the business currently exceeds.
 *
 * Unlike a generic validation error, this carries a stable `errorCode` the SPA
 * can match on (e.g. `DOWNGRADE_BRANCH_LIMIT_EXCEEDED`) plus the usage context
 * (used vs limit / capacity) so the UI can render exactly what must change
 * before the plan switch is allowed.
 */
class BillingLimitException extends Exception
{
    public readonly string $errorCode;

    public readonly array $context;

    public function __construct(
        string $message,
        string $errorCode = 'PLAN_CHANGE_REJECTED',
        array $context = [],
        int $status = 422,
    ) {
        $this->errorCode = $errorCode;
        $this->context = $context;

        parent::__construct($message, $status);
    }
}
