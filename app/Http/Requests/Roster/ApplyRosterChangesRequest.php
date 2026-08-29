<?php

namespace App\Http\Requests\Roster;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ApplyRosterChangesRequest extends FormRequest
{
    /**
     * Authorization is handled by the RosterPolicy via the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'version' => ['required', 'integer', 'min:1'],
            'mutations' => ['required', 'array', 'min:1'],
            'mutations.*.type' => [
                'required',
                'string',
                Rule::in(['add', 'update', 'cancel', 'reassign']),
            ],
            // `add` mutations carry a client-generated placeholder id (e.g.
            // `temp-...`) that does not exist in the database yet — it is only
            // used to reconcile the staged shift in the UI before it is saved.
            // Exclude it here so it is not cast/validated against the `shifts`
            // bigint id column (which would otherwise fail with a 22P02 or
            // validation error in the Review Changes dialog).
            'mutations.*.id' => ['exclude_if:mutations.*.type,add', 'required_if:mutations.*.type,update,cancel,reassign', 'integer', 'exists:shifts,id'],
            'mutations.*.employee_id' => ['required_if:mutations.*.type,reassign', 'nullable', 'integer', 'exists:employees,id'],
            'mutations.*.shift' => ['required_if:mutations.*.type,add,update', 'array'],
            'mutations.*.shift.employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'mutations.*.shift.position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'mutations.*.shift.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'mutations.*.shift.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'mutations.*.shift.date' => ['nullable', 'date'],
            'mutations.*.shift.start_time' => ['nullable', 'date_format:H:i'],
            'mutations.*.shift.end_time' => ['nullable', 'date_format:H:i'],
            'mutations.*.shift.break_minutes' => ['nullable', 'integer', 'min:0'],
            'mutations.*.shift.paid_break' => ['nullable', 'boolean'],
            'mutations.*.shift.required_staff' => ['nullable', 'integer', 'min:1', 'max:99'],
            'mutations.*.shift.notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
