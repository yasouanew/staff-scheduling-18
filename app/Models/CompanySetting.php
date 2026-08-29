<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanySetting extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'timezone',
        'date_format',
        'time_format',
        'week_start_day',
        'default_shift_duration',
        'default_break_minutes',
        'currency',
        'language',
        'allow_shift_swap',
        'allow_employee_availability',
        'allow_leave_requests',
        'allow_push_notifications',
        'logo',
        'primary_color',
        'secondary_color',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'company_id' => 'integer',
            'default_shift_duration' => 'integer',
            'default_break_minutes' => 'integer',
            'allow_shift_swap' => 'boolean',
            'allow_employee_availability' => 'boolean',
            'allow_leave_requests' => 'boolean',
            'allow_push_notifications' => 'boolean',
        ];
    }

    /**
     * Get the company that owns the settings.
     */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
