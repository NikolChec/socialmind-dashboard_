import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import he from './he.json';
import ru from './ru.json';

export type LangCode = 'en' | 'he' | 'ru';
export const LANGS: LangCode[] = ['en', 'he', 'ru'];
export const RTL: Record<LangCode, boolean> = { en: false, he: true, ru: false };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      ru: { translation: ru },
    },
    fallbackLng: 'en',
    supportedLngs: LANGS,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'socialmind.lang',
      caches: ['localStorage'],
    },
  });

export function applyDirection(lang: string) {
  const l = (LANGS.includes(lang as LangCode) ? lang : 'en') as LangCode;
  document.documentElement.lang = l;
  document.documentElement.dir = RTL[l] ? 'rtl' : 'ltr';
}

applyDirection(i18n.language);
i18n.on('languageChanged', applyDirection);

export default i18n;
