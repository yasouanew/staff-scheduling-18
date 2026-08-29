<?php

namespace App\Http\Requests\Position;

use Illuminate\Foundation\Http\FormRequest;

class StorePositionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the PositionPolicy via the controller.
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:1000'],
            'default_hourly_rate' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            'color' => ['nullable', 'string', 'regex:/^#([A-Fa-f0-9]{6})$/'],
            'status' => ['nullable', 'string', 'in:active,inactive'],
        ];
    }
}
