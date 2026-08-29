<?php

namespace App\Http\Requests\Roster;

use Illuminate\Foundation\Http\FormRequest;

class CopyPreviousWeekRequest extends FormRequest
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
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            // The Monday (or any day) that begins the NEW week being created.
            'week_start' => ['required', 'date'],
            // Optionally point at a specific source roster to copy from. If not
            // provided the service will locate the most recent prior roster.
            'source_roster_id' => ['nullable', 'integer', 'exists:rosters,id'],
        ];
    }
}
