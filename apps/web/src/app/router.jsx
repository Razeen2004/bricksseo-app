import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import LoginPage from '../features/auth/LoginPage';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/ResetPasswordPage';
import DashboardLayout from '../components/layout/DashboardLayout';
import OverviewPage from '../features/dashboard/OverviewPage';
import SitesPage from '../features/dashboard/SitesPage';
import LicensesPage from '../features/dashboard/LicensesPage';
import BillingPage from '../features/dashboard/BillingPage';
import SupportPage from '../features/dashboard/SupportPage';
import AccountPage from '../features/dashboard/AccountPage';
import AdminOverviewPage from '../features/admin/OverviewPage';
import AdminCustomersPage from '../features/admin/CustomersPage';
import AdminAllLicensesPage from '../features/admin/AllLicensesPage';
import AdminAllSitesPage from '../features/admin/AllSitesPage';
import AdminWebhooksPage from '../features/admin/WebhooksPage';
import AdminLogsPage from '../features/admin/LogsPage';
import AdminSettingsPage from '../features/admin/SettingsPage';
import AdminEmailTemplatesPage from '../features/admin/EmailTemplatesPage';
import AdminReleasesPage from '../features/admin/ReleasesPage';
import PayPage from '../features/checkout/PayPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'sites', element: <SitesPage /> },
      { path: 'licenses', element: <LicensesPage /> },
      { path: 'billing', element: <BillingPage /> },
      { path: 'support', element: <SupportPage /> },
      { path: 'account', element: <AccountPage /> },
      { path: 'admin', element: <AdminOverviewPage /> },
      { path: 'admin/customers', element: <AdminCustomersPage /> },
      { path: 'admin/licenses', element: <AdminAllLicensesPage /> },
      { path: 'admin/sites', element: <AdminAllSitesPage /> },
      { path: 'admin/releases', element: <AdminReleasesPage /> },
      { path: 'admin/webhooks', element: <AdminWebhooksPage /> },
      { path: 'admin/logs', element: <AdminLogsPage /> },
      { path: 'admin/settings', element: <AdminSettingsPage /> },
      { path: 'admin/emails', element: <AdminEmailTemplatesPage /> },
    ],
  },
  { path: '/pay', element: <PayPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/change-password', element: <ResetPasswordPage /> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
