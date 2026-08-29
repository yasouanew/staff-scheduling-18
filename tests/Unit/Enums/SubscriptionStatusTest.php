<?php

namespace Tests\Unit\Enums;

use App\Enums\SubscriptionStatus;
use PHPUnit\Framework\TestCase;

class SubscriptionStatusTest extends TestCase
{
    public function test_enum_contains_all_required_states(): void
    {
        $values = array_column(SubscriptionStatus::cases(), 'value');

        $this->assertContains('trialing', $values);
        $this->assertContains('active', $values);
        $this->assertContains('past_due', $values);
        $this->assertContains('paused', $values);
        $this->assertContains('cancelled', $values);
        $this->assertContains('expired', $values);
    }

    public function test_values_are_strings(): void
    {
        $this->assertSame('trialing', SubscriptionStatus::Trial->value);
        $this->assertSame('active', SubscriptionStatus::Active->value);
        $this->assertSame('past_due', SubscriptionStatus::PastDue->value);
        $this->assertSame('paused', SubscriptionStatus::Paused->value);
        $this->assertSame('cancelled', SubscriptionStatus::Cancelled->value);
        $this->assertSame('expired', SubscriptionStatus::Expired->value);
    }

    public function test_trial_and_active_grant_access(): void
    {
        $this->assertTrue(SubscriptionStatus::Trial->grantsAccess());
        $this->assertTrue(SubscriptionStatus::Active->grantsAccess());
    }

    public function test_non_entitled_states_do_not_grant_access(): void
    {
        $this->assertFalse(SubscriptionStatus::PastDue->grantsAccess());
        $this->assertFalse(SubscriptionStatus::Paused->grantsAccess());
        $this->assertFalse(SubscriptionStatus::Cancelled->grantsAccess());
        $this->assertFalse(SubscriptionStatus::Expired->grantsAccess());
    }
}
