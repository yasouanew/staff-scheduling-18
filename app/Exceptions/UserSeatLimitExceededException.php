<?php

namespace App\Exceptions;

use Exception;

/**
 * Raised when an operation would activate a user account that would push the
 * company over its entitled plan's seat allowance.
 *
 * Under the per-seat model a "seat" is one active user account (any role except
 * the platform-wide `super_admin`, with or without an employee profile). This is
 * thrown wherever an invited/pending account would flip to `status = 'active'`
 * (e.g. setting an employee Active in the directory, or accepting an invite)
 * while the company is already at its plan limit.
 *
 * Controllers translate this into a structured API response:
 *
 *     {
 *         "success": false,
 *         "message": "Seat limit reached. Upgrade your plan to add more members.",
 *         "code": "EMPLOYEE_CAPACITY_REACHED",
 *         "errors": { "used": 25, "capacity": 25, "remaining": 0 }
 *     }
 *
 * Using a dedicated exception (rather than a bare boolean) keeps the decision
 * in the service layer while letting each HTTP context format it the same way.
 */
class UserSeatLimitExceededException extends Exception
{
    /**
     * The machine-readable error code, e.g. `EMPLOYEE_CAPACITY_REACHED`.
     */
    public readonly string $errorCode;

    /**
     * Structured diagnostic details (used, capacity, remaining).
     *
     * @var array<string, mixed>
     */
    public readonly array $context;

    /**
     * @param  array<string, mixed>  $context
     */
    public function __construct(
        string $message = 'Seat limit reached. Upgrade your plan to add more members.',
        string $errorCode = 'EMPLOYEE_CAPACITY_REACHED',
        array $context = [],
        int $status = 422,
    ) {
        $this->errorCode = $errorCode;
        $this->context = $context;

        parent::__construct($message, $status);
    }
}
