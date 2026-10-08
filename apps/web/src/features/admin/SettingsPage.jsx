import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import GeneralTab from './settings/GeneralTab';
import IntegrationsTab from './settings/IntegrationsTab';
import LicensingTab from './settings/LicensingTab';
import NotificationsTab from './settings/NotificationsTab';

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
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted">Admin &rsaquo; Settings</p>
        <h1 className="mt-1 font-serif text-4xl italic">Settings.</h1>
        <p className="mt-1 text-muted">Configure your Bricks SEO store.</p>
      </header>

      <div className="flex gap-6 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
              tab === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted">Loading…</p>
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
