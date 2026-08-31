import { useState } from 'react';
import {
    Link,
    Navigate,
    Outlet,
    Route,
    Routes,
    useLocation,
    useNavigate,
    useSearchParams,
} from 'react-router-dom';
import { toast } from 'sonner';

import { DashboardLayout } from '@/Components/layout/DashboardLayout';
import { PlaceholderPage } from '@/Components/common/PlaceholderPage';
import { apiClient, getApiErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/features/auth/hooks/useAuth';


import LandingPage from '@/features/marketing/pages/LandingPage';
import GetStartedPage from '@/features/marketing/pages/GetStartedPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import {
    VerifyEmailPage,
    type VerifyEmailStatus,
} from '@/features/auth/pages/VerifyEmailPage';
import { ConfirmPasswordPage } from '@/features/auth/pages/ConfirmPasswordPage';
import AcceptInvitationPage from '@/features/invitations/pages/AcceptInvitationPage';
import DownloadAppPage from '@/features/invitations/pages/DownloadAppPage';

import CompanyAdminDashboard from '@/features/dashboard/pages/CompanyAdminDashboard';
import SchedulerDashboard from '@/features/dashboard/pages/SchedulerDashboard';
import { normalizeWebRole, useWebSession, type WebRole } from '@/features/auth/hooks/useWebSession';
import EmployeeListPage from '@/features/employees/pages/EmployeeListPage';
import AvailabilityDashboard from '@/features/availability/pages/AvailabilityDashboard';
import EmployeeAvailabilityPage from '@/features/availability/pages/EmployeeAvailabilityPage';
import RosterCalendarPage from '@/features/rosters/pages/RosterCalendarPage';
import RostersListPage from '@/features/rosters/pages/RostersListPage';
import RosterDetailPage from '@/features/rosters/pages/RosterDetailPage';
import ShiftsListPage from '@/features/shifts/pages/ShiftsListPage';
import LeaveTypesPage from '@/features/leave-types/pages/LeaveTypesPage';
import LeaveRequestsListPage from '@/features/leave-requests/pages/LeaveRequestsListPage';
import LeaveRequestNewPage from '@/features/leave-requests/pages/LeaveRequestNewPage';
import LeaveRequestDetailPage from '@/features/leave-requests/pages/LeaveRequestDetailPage';
import NotificationCenterPage from '@/features/notifications/pages/NotificationCenterPage';
import { SettingsDashboardPage } from '@/features/settings/pages/SettingsDashboardPage';
import SuperAdminDashboard from '@/features/super-admin/pages/SuperAdminDashboard';
import CompanyManagementPage from '@/features/super-admin/pages/CompanyManagementPage';
import SuperAdminCompanyDetailPage from '@/features/super-admin/pages/SuperAdminCompanyDetailPage';
import SuperAdminSubscriptionsPage from '@/features/super-admin/pages/SuperAdminSubscriptionsPage';
import SuperAdminPaymentsPage from '@/features/super-admin/pages/SuperAdminPaymentsPage';
import SuperAdminAuditPage from '@/features/super-admin/pages/SuperAdminAuditPage';
import SuperAdminPlatformSettingsPage from '@/features/super-admin/pages/SuperAdminPlatformSettingsPage';
import PlansPage from '@/features/billing/pages/PlansPage';
import { LockedCompanyPage } from '@/features/billing/pages/LockedCompanyPage';
import SubscriptionDashboardPage from '@/features/billing/pages/SubscriptionDashboardPage';

import CompaniesListPage from '@/features/companies/pages/CompaniesListPage';
import CompanyDetailPage from '@/features/companies/pages/CompanyDetailPage';
import CompanySettingsPage from '@/features/companies/pages/CompanySettingsPage';

import BranchesListPage from '@/features/branches/pages/BranchesListPage';
import BranchDetailPage from '@/features/branches/pages/BranchDetailPage';

import DepartmentsListPage from '@/features/departments/pages/DepartmentsListPage';

import PositionsListPage from '@/features/positions/pages/PositionsListPage';

import { ProtectedRoute } from './ProtectedRoute';


type BrowserRole = Exclude<WebRole, 'employee'>;

function RoleRoute({ roles }: { roles: readonly BrowserRole[] }): JSX.Element {
    const session = useWebSession();
    const role = normalizeWebRole(session.data);

    if (session.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading workspace…</div>;
    if (!role || role === 'employee' || !roles.includes(role)) return <Navigate to="/dashboard" replace />;
    return <Outlet />;
}

function RoleDashboardRoute(): JSX.Element {
    const session = useWebSession();
    const role = normalizeWebRole(session.data);
    if (session.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading dashboard…</div>;
    if (role === 'super_admin') return <SuperAdminDashboard />;
    if (role === 'scheduler') return <SchedulerDashboard />;
    return <CompanyAdminDashboard />;
}

/* -------------------------------------------------------------------------- */
/* Auth route containers (wire presentational pages to the API)               */
/* -------------------------------------------------------------------------- */

/** Location state set by {@link ProtectedRoute} when bouncing to `/login`. */
interface LocationState {
    from?: { pathname?: string };
}

/** Login screen wired to `POST /auth/login` via the shared session hook. */
function LoginRoute(): JSX.Element {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [serverError, setServerError] = useState<string | null>(null);

    // Return the user to wherever they were headed before the auth redirect,
    // falling back to the dashboard for a direct visit to `/login`.
    const state = location.state as LocationState | null;
    const redirectTo = state?.from?.pathname ?? '/dashboard';

    return (
        <LoginPage
            serverError={serverError}
            onDismissError={() => setServerError(null)}
            onSubmit={async (values) => {
                setServerError(null);
                try {
                    await login({
                        email: values.email,
                        password: values.password,
                        remember: values.rememberMe ?? false,
                    });
                    toast.success('Welcome back! Redirecting to your dashboard.');
                    navigate(redirectTo, { replace: true });
                } catch (error) {
                    // Surface the real server message: invalid credentials (401),
                    // inactive account (401), or rate limiting (429).
                    setServerError(
                        getApiErrorMessage(error, 'Invalid email or password. Please try again.'),
                    );
                }
            }}
        />
    );
}


/** Registration screen wired to `POST /auth/register` via the session hook. */
function RegisterRoute(): JSX.Element {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [serverError, setServerError] = useState<string | null>(null);

    return (
        <RegisterPage
            serverError={serverError}
            onDismissError={() => setServerError(null)}
            onSubmit={async (values) => {
                setServerError(null);
                try {
                    await register({
                        name: values.name,
                        companyName: values.companyName,
                        email: values.email,
                        phone: values.phone || undefined,
                        password: values.password,
                        passwordConfirmation: values.confirmPassword,
                    });
                    toast.success('Account created! Welcome to your new workspace.');
                    navigate('/dashboard', { replace: true });
                } catch (error) {
                    // Surface the real server message: validation (422, e.g. email
                    // already taken) or rate limiting (429).
                    setServerError(
                        getApiErrorMessage(
                            error,
                            'We could not create your account. Please try again.',
                        ),
                    );
                }
            }}
        />
    );
}

/** Forgot-password screen wired to `POST /auth/forgot-password`. */
function ForgotPasswordRoute(): JSX.Element {
    return (
        <ForgotPasswordPage
            onSubmit={async (values) => {
                // Swallow errors so we never reveal which emails are registered;
                // the page always advances to its confirmation state.
                try {
                    await apiClient.post('/auth/forgot-password', { email: values.email });
                } catch {
                    /* intentionally ignored */
                }
            }}
        />
    );
}

/** Reset-password screen wired to `POST /auth/reset-password`. */
function ResetPasswordRoute(): JSX.Element {
    const [params] = useSearchParams();
    const navigate = useNavigate();

    const token = params.get('token') ?? '';
    const email = params.get('email') ?? '';

    return (
        <ResetPasswordPage
            onSubmit={async (values) => {
                try {
                    await apiClient.post('/auth/reset-password', {
                        token,
                        email,
                        password: values.password,
                        password_confirmation: values.confirmPassword,
                    });
                    toast.success('Password updated. Please sign in.');
                    navigate('/login', { replace: true });
                } catch {
                    toast.error('Unable to reset password. The link may have expired.');
                }
            }}
        />
    );
}

/** Maps the backend `status` query param to a {@link VerifyEmailStatus}. */
function toVerifyStatus(raw: string | null): VerifyEmailStatus {
    switch (raw) {
        case 'verified':
        case 'already-verified':
        case 'invalid':
            return raw;
        default:
            return 'pending';
    }
}

/**
 * Email-verification result screen wired to `POST /auth/email/resend`.
 *
 * The backend redirects signed verification links to `/verify-email?status=...`;
 * this container reads that outcome and offers a resend action. Resending
 * requires an authenticated session, so the button is only shown when a token
 * is present.
 */
function VerifyEmailRoute(): JSX.Element {
    const { resendVerification, isAuthenticated } = useAuth();
    const [params] = useSearchParams();
    const [isResending, setIsResending] = useState(false);

    const status = toVerifyStatus(params.get('status'));

    return (
        <VerifyEmailPage
            status={status}
            isResending={isResending}
            onResend={
                isAuthenticated
                    ? async () => {
                        setIsResending(true);
                        try {
                            await resendVerification();
                            toast.success('Verification email sent. Please check your inbox.');
                        } catch (error) {
                            toast.error(
                                getApiErrorMessage(
                                    error,
                                    'Unable to resend the verification email. Please try again.',
                                ),
                            );
                        } finally {
                            setIsResending(false);
                        }
                    }
                    : undefined
            }
        />
    );
}

/** Confirm-password screen wired to `POST /auth/confirm-password`. */
function ConfirmPasswordRoute(): JSX.Element {
    const { confirmPassword } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [serverError, setServerError] = useState<string | null>(null);

    // Return the user to wherever they were headed before the confirmation gate,
    // falling back to the dashboard.
    const state = location.state as LocationState | null;
    const redirectTo = state?.from?.pathname ?? '/dashboard';

    return (
        <ConfirmPasswordPage
            serverError={serverError}
            onCancel={() => navigate(-1)}
            onSubmit={async (values) => {
                setServerError(null);
                try {
                    await confirmPassword(values.password);
                    toast.success('Password confirmed.');
                    navigate(redirectTo, { replace: true });
                } catch (error) {
                    setServerError(
                        getApiErrorMessage(
                            error,
                            'The password you entered is incorrect. Please try again.',
                        ),
                    );
                }
            }}
        />
    );
}

/* -------------------------------------------------------------------------- */
/* Authenticated shell                                                        */
/* -------------------------------------------------------------------------- */


/** Wraps the dashboard chrome and wires the sign-out action to the API. */
function ProtectedLayout(): JSX.Element {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleSignOut = async (): Promise<void> => {
        await logout();
        navigate('/login', { replace: true });
    };

    return <DashboardLayout onSignOut={handleSignOut} />;
}

/** Friendly 404 for unmatched client routes. */
function NotFound(): JSX.Element {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
            <p className="text-5xl font-bold tracking-tight text-foreground">404</p>
            <p className="text-sm text-muted-foreground">
                We couldn&apos;t find the page you were looking for.
            </p>
            <Link
                to="/dashboard"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
                Back to dashboard
            </Link>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Route tree                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Central application route map.
 *
 * Public auth routes sit at the top level; everything else is nested behind
 * {@link ProtectedRoute} (token guard) and rendered inside the persistent
 * {@link DashboardLayout} chrome.
 */
export function AppRoutes(): JSX.Element {
    return (
        <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/get-started" element={<GetStartedPage />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/register" element={<RegisterRoute />} />
            <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
            <Route path="/reset-password" element={<ResetPasswordRoute />} />
            <Route path="/verify-email" element={<VerifyEmailRoute />} />

            {/* Public onboarding for invited team members (no session yet). */}
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/download-app" element={<DownloadAppPage />} />

            {/* Protected application shell */}
            <Route element={<ProtectedRoute />}>
                {/* Full-screen auth gate (no dashboard chrome). */}
                <Route path="/confirm-password" element={<ConfirmPasswordRoute />} />

                <Route element={<ProtectedLayout />}>

                    <Route path="/account-locked" element={<LockedCompanyPage />} />
                    <Route path="/dashboard" element={<RoleDashboardRoute />} />

                    <Route element={<RoleRoute roles={['super_admin']} />}>
                        <Route path="/super-admin" element={<SuperAdminDashboard />} />
                        <Route path="/super-admin/companies" element={<CompanyManagementPage />} />
                        <Route path="/super-admin/companies/:id" element={<SuperAdminCompanyDetailPage />} />
                        <Route path="/super-admin/plans" element={<PlansPage />} />
                        <Route path="/super-admin/subscriptions" element={<SuperAdminSubscriptionsPage />} />
                        <Route path="/super-admin/payments" element={<SuperAdminPaymentsPage />} />
                        <Route path="/super-admin/audit" element={<SuperAdminAuditPage />} />
                        <Route path="/super-admin/settings" element={<SuperAdminPlatformSettingsPage />} />
                    </Route>

                    <Route element={<RoleRoute roles={['company_admin']} />}>
                        <Route path="/subscription" element={<SubscriptionDashboardPage />} />
                        <Route path="/companies" element={<CompaniesListPage />} />
                        <Route path="/companies/:id" element={<CompanyDetailPage />} />
                        <Route path="/companies/:id/settings" element={<CompanySettingsPage />} />
                        <Route path="/branches" element={<BranchesListPage />} />
                        <Route path="/branches/:id" element={<BranchDetailPage />} />
                        <Route path="/departments" element={<DepartmentsListPage />} />
                        <Route path="/positions" element={<PositionsListPage />} />
                        <Route path="/leave-types" element={<LeaveTypesPage />} />
                        <Route path="/leave-requests/new" element={<LeaveRequestNewPage />} />
                        <Route path="/settings" element={<SettingsDashboardPage />} />
                    </Route>

                    <Route element={<RoleRoute roles={['company_admin', 'scheduler']} />}>
                        <Route path="/employees" element={<EmployeeListPage />} />
                        <Route path="/employees/:id/availability" element={<EmployeeAvailabilityPage />} />
                        <Route path="/availability" element={<AvailabilityDashboard />} />
                        <Route path="/rosters" element={<RosterCalendarPage />} />
                        <Route path="/rosters/list" element={<RostersListPage />} />
                        <Route path="/rosters/:id" element={<RosterDetailPage />} />
                        <Route path="/shifts" element={<ShiftsListPage />} />
                        <Route path="/leave-requests" element={<LeaveRequestsListPage />} />
                        <Route path="/leave-requests/:id" element={<LeaveRequestDetailPage />} />
                    </Route>

                    <Route element={<RoleRoute roles={['super_admin', 'company_admin', 'scheduler']} />}>
                        <Route path="/notifications" element={<NotificationCenterPage />} />
                    </Route>
                </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
