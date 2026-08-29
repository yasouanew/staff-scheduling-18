<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class ApiLoginRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
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
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:255'],
            'platform' => ['nullable', 'string', 'in:web,ios,android'],
            'fcm_token' => ['nullable', 'string', 'max:500'],
            'app_version' => ['nullable', 'string', 'max:50'],
            'os_version' => ['nullable', 'string', 'max:50'],
        ];
    }

    /**
     * Get the device name used for the issued token.
     */
    public function deviceName(): string
    {
        return $this->input('device_name') ?: ($this->userAgent() ?? 'unknown-device');
    }
}
