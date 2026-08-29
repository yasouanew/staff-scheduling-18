<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PlatformSetting extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'trial_period_days',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'trial_period_days' => 'integer',
        ];
    }

    /**
     * Return the singleton platform settings row, creating it with the safe
     * standard trial period on first use.
     */
    public static function current(): self
    {
        return static::query()->firstOrCreate(
            ['id' => 1],
            ['trial_period_days' => 14],
        );
    }
}
