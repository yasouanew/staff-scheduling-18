<?php

namespace App\Exceptions;

use Exception;

/**
 * Thrown when an operation would exceed a branch's allocated employee capacity
 * or the plan's branch limit.
 *
 * Controllers translate this into a structured API response:
 *
 *     {
 *         "success": false,
 *         "message": "This branch has reached its employee capacity.",
 *         "code": "EMPLOYEE_CAPACITY_REACHED",
 *         "errors": { "used": 25, "capacity": 25 }
 *     }
 *
 * Using a dedicated exception (rather than a bare boolean) keeps the decision
 * in the service layer while letting each HTTP context format it the same way.
 */
class BranchCapacityException extends Exception
{
    /**
     * The machine-readable error code, e.g. `EMPLOYEE_CAPACITY_REACHED`.
     */
    public readonly string $errorCode;

    /**
     * Structured diagnostic details (used, capacity, remaining, etc).
     *
     * @var array<string, mixed>
     */
    public readonly array $context;

    /**
     * @param  array<string, mixed>  $context
     */
    public function __construct(
        string $message,
        string $errorCode = 'EMPLOYEE_CAPACITY_REACHED',
        array $context = [],
        int $status = 422,
    ) {
        $this->errorCode = $errorCode;
        $this->context = $context;

        parent::__construct($message, $status);
    }
}
