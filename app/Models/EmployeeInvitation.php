<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An outstanding onboarding invitation for a team member.
 *
 * The record is the single source of truth for "has this person been invited,
 * when, through which channel, and is the link still valid?" — which is what the
 * team page surfaces on each row and what the public accept endpoints validate.
 */
class EmployeeInvitation extends Model
{
    /** Browser roles that set their password inside the web app. */
    public const WEB_ROLES = ['company_admin', 'scheduler'];

    /** Invitation delivered as a tokenised link into the web app. */
    public const CHANNEL_WEB = 'web';

    /** Invitation delivered as a "download the app" guide + one-time code. */
    public const CHANNEL_MOBILE = 'mobile';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'company_id',
        'employee_id',
        'user_id',
        'invited_by',
        'email',
        'role',
        'channel',
        'token_hash',
        'expires_at',
        'code_hash',
        'code_expires_at',
        'code_attempts',
        'setup_token_hash',
        'setup_token_expires_at',
        'send_count',
        'last_sent_at',
        'accepted_at',
    ];

    /**
     * Hidden from serialisation: secrets must never reach a JSON response.
     *
     * @var list<string>
     */
    protected $hidden = [
        'token_hash',
        'code_hash',
        'setup_token_hash',
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
            'employee_id' => 'integer',
            'user_id' => 'integer',
            'invited_by' => 'integer',
            'code_attempts' => 'integer',
            'send_count' => 'integer',
            'expires_at' => 'datetime',
            'code_expires_at' => 'datetime',
            'setup_token_expires_at' => 'datetime',
            'last_sent_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    /**
     * Resolve the delivery channel for a role.
     *
     * Employees have no browser access at all, so they can only be onboarded
     * through the mobile app; admins and schedulers work in the web dashboard.
     */
    public static function channelForRole(string $role): string
    {
        return in_array($role, self::WEB_ROLES, true)
            ? self::CHANNEL_WEB
            : self::CHANNEL_MOBILE;
    }

    /** Whether the invitation link has already been used. */
    public function isAccepted(): bool
    {
        return $this->accepted_at !== null;
    }

    /** Whether the emailed link is still within its validity window. */
    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** Whether the invitation can still be accepted. */
    public function isPending(): bool
    {
        return ! $this->isAccepted() && ! $this->isExpired();
    }

    /** Scope to invitations that are still awaiting acceptance. */
    public function scopePending(Builder $query): Builder
    {
        return $query->whereNull('accepted_at');
    }

    /** The company the invitation was issued for. */
    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /** The employee profile this invitation onboards. */
    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** The login account the invitation activates. */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** The administrator who sent the invitation. */
    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }
}
