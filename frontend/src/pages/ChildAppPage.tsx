import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Smartphone, ArrowLeft } from 'lucide-react';
import type { Child } from '@socialmind/shared';
import { api } from '../lib/api';
import { CompanionActivityPanel } from '../components/CompanionActivityPanel';
import { HelperChatsPanel } from '../components/HelperChatsPanel';
import { MissionsManagerPanel } from '../components/MissionsManagerPanel';
import { MissionRequestsPanel } from '../components/MissionRequestsPanel';

type ChildRow = Child & { psychologist_name: string };

export function ChildAppPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.child(id).then(setChild).finally(() => setLoading(false));
  }, [id]);

  if (loading || !child) return <div className="text-muted">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/children/${child.id}`} className="text-xs text-accent hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={12} /> {t('childapp.back_to_clinical')}
        </Link>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <Smartphone size={20} className="text-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('childapp.page_title', { name: child.display_name })}
          </h1>
        </div>
        <p className="text-sm text-muted mt-1">{t('childapp.page_subtitle')}</p>
      </div>

      <CompanionActivityPanel childId={child.id} childName={child.display_name} />

      <MissionsManagerPanel childId={child.id} />

      <MissionRequestsPanel childId={child.id} />

      <HelperChatsPanel childId={child.id} />
    </div>
  );
}
