export interface BillingPlan {
    id: string;
    name: string;
    slug: string;
    priceMonthly: number;
    priceSixMonthly: number | null;
    priceYearly: number;
    maxEmployees: number | null;
    maxBranches: number | null;
    features: string[];
    isActive: boolean;
    stripeMonthlyPriceId: string | null;
    stripeSixMonthlyPriceId: string | null;
    stripeYearlyPriceId: string | null;
    stripeProductId: string | null;
    subscriptionsCount: number | null;
}

export interface BillingSubscription {
    id: string;
    companyId: string;
    planId: string;
    status: string;
    stripeStatus: string | null;
    billingCycle: 'monthly' | 'six_month' | 'yearly';
    startsAt: string | null;
    endsAt: string | null;
    trialEndsAt: string | null;
    cancelledAt: string | null;
    isActive: boolean;
    isCancelled: boolean;
    onTrial: boolean;
    plan: Pick<BillingPlan, 'id' | 'name' | 'priceMonthly' | 'priceSixMonthly' | 'priceYearly'> | null;
}

export interface BillingPayment {
    id: string;
    amount: number;
    amountRefunded: number;
    currency: string;
    provider: string;
    reference: string | null;
    status: string;
    paidAt: string | null;
    refundedAt: string | null;
    isRefundable: boolean;
    isRefunded: boolean;
}

export interface BillingPage<T> {
    data: T[];
    currentPage: number;
    lastPage: number;
    total: number;
}

export interface PlanInput {
    name: string;
    slug?: string;
    priceMonthly: number;
    priceSixMonthly: number | null;
    priceYearly: number;
    maxEmployees: number | null;
    maxBranches: number | null;
    features: string[];
    isActive: boolean;
    stripeMonthlyPriceId: string | null;
    stripeSixMonthlyPriceId: string | null;
    stripeYearlyPriceId: string | null;
    stripeProductId: string | null;
}
