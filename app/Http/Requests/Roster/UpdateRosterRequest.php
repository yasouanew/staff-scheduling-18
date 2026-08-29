<?php

namespace App\Http\Requests\Roster;

use Illuminate\Foundation\Http\FormRequest;

class UpdateRosterRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * Authorization is handled by the RosterPolicy via the controller.
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
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'week_start' => ['sometimes', 'required', 'date'],
            'week_end' => ['sometimes', 'required', 'date', 'after_or_equal:week_start'],
            'status' => ['nullable', 'string', 'in:draft,published,archived'],
        ];
    }
}
