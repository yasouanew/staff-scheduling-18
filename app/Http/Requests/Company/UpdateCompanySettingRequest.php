<?php

namespace App\Http\Requests\Company;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompanySettingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the CompanyPolicy via the controller.
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
            'timezone' => ['sometimes', 'string', 'max:64'],
            'date_format' => ['sometimes', 'string', 'max:32'],
            'time_format' => ['sometimes', 'string', 'in:12h,24h'],
            'week_start_day' => ['sometimes', 'string', 'in:Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday'],
            'default_shift_duration' => ['sometimes', 'integer', 'min:0', 'max:1440'],
            'default_break_minutes' => ['sometimes', 'integer', 'min:0', 'max:480'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'language' => ['sometimes', 'string', 'max:10'],
            'allow_shift_swap' => ['sometimes', 'boolean'],
            'allow_employee_availability' => ['sometimes', 'boolean'],
            'allow_leave_requests' => ['sometimes', 'boolean'],
            'allow_push_notifications' => ['sometimes', 'boolean'],
            'logo' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'primary_color' => ['sometimes', 'nullable', 'string', 'regex:/^#([A-Fa-f0-9]{6})$/'],
            'secondary_color' => ['sometimes', 'nullable', 'string', 'regex:/^#([A-Fa-f0-9]{6})$/'],
        ];
    }
}
