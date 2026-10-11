import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings as SettingsIcon } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import GeneralTab from './settings/GeneralTab';
import IntegrationsTab from './settings/IntegrationsTab';
import LicensingTab from './settings/LicensingTab';
import NotificationsTab from './settings/NotificationsTab';
import Skeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'licensing', label: 'Licensing' },
  { id: 'notifications', label: 'Notifications' },
];

export default function SettingsPage() {
  const [tab, setTab] = useState('general');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch('/admin/settings'),
  });

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Admin" title="Settings." description="Configure your Bricks SEO store." icon={SettingsIcon} />

      <div className="overflow-x-auto border-b border-border">
        <div style={{overflow: "hidden"}} className="flex min-w-max gap-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px min-h-11 border-b-2 pb-3 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div role="status" aria-label="Loading admin settings" className="space-y-5"><span className="sr-only">Loading…</span><Skeleton className="h-10 w-full" /><Skeleton className="h-52 w-full" /><Skeleton className="h-52 w-full" /></div>
      ) : (
        <>
          {tab === 'general' && <GeneralTab data={data} onSaved={refetch} />}
          {tab === 'integrations' && <IntegrationsTab data={data} onSaved={refetch} />}
          {tab === 'licensing' && <LicensingTab data={data} onSaved={refetch} />}
          {tab === 'notifications' && <NotificationsTab data={data} onSaved={refetch} />}
        </>
      )}
    </div>
  );
}
