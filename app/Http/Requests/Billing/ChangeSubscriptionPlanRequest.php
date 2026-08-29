<?php

namespace App\Http\Requests\Billing;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a subscription plan-change request (upgrade or downgrade).
 *
 * The same shape serves both directions; the service decides whether the
 * change is an upgrade or a downgrade by comparing the target plan's
 * allowances against the business's current usage — never the other way round,
 * and never trusting a client-supplied price.
 */
class ChangeSubscriptionPlanRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is enforced by the SubscriptionPolicy via the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'plan_id' => ['required', 'integer', 'exists:plans,id'],
            'billing_cycle' => ['nullable', 'in:monthly,six_month,yearly'],
        ];
    }
}
