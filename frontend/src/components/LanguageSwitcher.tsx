import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LANGS, type LangCode } from '../i18n';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (LANGS.includes(i18n.language as LangCode) ? i18n.language : 'en') as LangCode;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink/40 p-0.5">
      <Globe size={13} strokeWidth={2} className="text-muted mx-1.5" />
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => i18n.changeLanguage(code)}
          title={t(`language.${code}`)}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
            current === code
              ? 'bg-accent/20 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          {code === 'en' ? 'EN' : code === 'he' ? 'HE' : 'RU'}
        </button>
      ))}
    </div>
  );
}
