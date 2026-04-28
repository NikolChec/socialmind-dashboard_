import { useTranslation } from 'react-i18next';
import { AssistantPanel } from '../components/AssistantPanel';

export function AssistantPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('assistant.title')}</h1>
        <p className="text-sm text-muted">{t('assistant.subtitle')}</p>
      </div>
      <AssistantPanel />
    </div>
  );
}
