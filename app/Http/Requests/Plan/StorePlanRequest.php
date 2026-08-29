<?php

namespace App\Http\Requests\Plan;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class StorePlanRequest extends FormRequest
{
    /**
     * Authorization handled by the PlanPolicy via the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Prepare the data for validation.
     */
    protected function prepareForValidation(): void
    {
        if ($this->filled('name') && ! $this->filled('slug')) {
            $this->merge(['slug' => Str::slug($this->input('name'))]);
        }
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'unique:plans,slug'],
            'price_monthly' => ['required', 'numeric', 'min:0'],
            'price_six_monthly' => ['nullable', 'numeric', 'min:0'],
            'price_yearly' => ['required', 'numeric', 'min:0'],
            'stripe_monthly_price_id' => ['nullable', 'string', 'max:255'],
            'stripe_six_monthly_price_id' => ['nullable', 'string', 'max:255'],
            'stripe_yearly_price_id' => ['nullable', 'string', 'max:255'],
            'stripe_product_id' => ['nullable', 'string', 'max:255'],
            'max_employees' => ['nullable', 'integer', 'min:1'],
            'max_branches' => ['nullable', 'integer', 'min:1'],
            'features' => ['nullable', 'array'],
            'features.*' => ['string', 'max:255'],
            'is_active' => ['boolean'],
        ];
    }
}
