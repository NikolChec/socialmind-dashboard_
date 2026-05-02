import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContactMethod, ParentContact } from '@socialmind/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

const METHODS: ContactMethod[] = ['phone', 'sms', 'email', 'in_person', 'video', 'other'];

type Guardian = { id: string; name: string; email: string; phone: string | null; rel: 'parent' | 'psychologist' | 'teacher' };

export function ParentContactsPanel({ childId, readOnly = false }: { childId: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ParentContact[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contacted_at: new Date().toISOString().slice(0, 10),
    method: 'phone' as ContactMethod,
    person: '',
    topic: '',
    outcome: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.contacts(childId).then(setItems);
    api.childGuardians(childId).then(setGuardians).catch(() => setGuardians([]));
  }, [childId]);

  async function submit() {
    if (!form.person.trim() || !form.topic.trim()) return;
    setSaving(true);
    try {
      await api.contactAdd(childId, {
        contacted_at: new Date(form.contacted_at).toISOString(),
        method: form.method,
        person: form.person,
        topic: form.topic,
        outcome: form.outcome || undefined,
        notes: form.notes || undefined,
      });
      setItems(await api.contacts(childId));
      setOpen(false);
      setForm({ ...form, person: '', topic: '', outcome: '', notes: '' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await api.contactRemove(childId, id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <section className="bg-card border border-line rounded-lg">
      <header className="px-5 py-3 border-b border-line flex items-center justify-between">
        <h2 className="font-medium">{t('child.contacts_title')}</h2>
        {!readOnly && (
          <button
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 rounded border border-line text-slate-300 hover:bg-white/5"
          >
            {t('child.contacts_add')}
          </button>
        )}
      </header>
      {guardians.length > 0 && (
        <div className="px-5 py-3 border-b border-line bg-ink/30">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">{t('child.contacts_directory') || 'Directory'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {guardians.map((g) => (
              <div key={g.id} className="rounded border border-line bg-card/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-100 font-medium truncate">{g.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted">{g.rel}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-300">
                  <a href={`mailto:${g.email}`} className="hover:underline break-all">{g.email}</a>
                </div>
                {g.phone && (
                  <div className="text-xs text-slate-300">
                    <a href={`tel:${g.phone}`} className="hover:underline">{g.phone}</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && (
        <div className="p-5 border-b border-line space-y-3 bg-ink/50">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('child.contact_date')}>
              <input
                type="date" value={form.contacted_at}
                onChange={(e) => setForm({ ...form, contacted_at: e.target.value })}
                className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
              />
            </Field>
            <Field label={t('child.contact_method')}>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as ContactMethod })}
                className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
              >
                {METHODS.map((m) => <option key={m} value={m}>{t(`contact_methods.${m}`)}</option>)}
              </select>
            </Field>
            <Field label={t('child.contact_person')}>
              <input
                value={form.person} onChange={(e) => setForm({ ...form, person: e.target.value })}
                className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" required
              />
            </Field>
            <Field label={t('child.contact_topic')}>
              <input
                value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}
                className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" required
              />
            </Field>
          </div>
          <Field label={t('child.contact_outcome')}>
            <input
              value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm"
            />
          </Field>
          <Field label={t('child.contact_notes')}>
            <textarea
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm resize-none"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="text-sm px-3 py-1.5 text-slate-300 hover:bg-white/5 rounded">
              {t('common.cancel')}
            </button>
            <button
              onClick={submit} disabled={saving}
              className="text-sm px-3 py-1.5 rounded bg-accent hover:bg-accent/90 disabled:opacity-50 text-white"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}
      <ul className="divide-y divide-line max-h-80 overflow-y-auto scrollbar-thin">
        {items.length === 0 && !open && <li className="px-5 py-6 text-sm text-muted">{t('child.contacts_empty')}</li>}
        {items.map((c) => (
          <li key={c.id} className="px-5 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-100">
                {c.person} <span className="text-muted">· {t(`contact_methods.${c.method}`)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">{formatDate(c.contacted_at)}</span>
                {!readOnly && (
                  <button onClick={() => remove(c.id)} className="text-xs text-slate-400 hover:text-red-300">
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-300 mt-1">{c.topic}</div>
            {c.outcome && <div className="text-xs text-slate-400 mt-0.5">→ {c.outcome}</div>}
            {c.notes && <div className="text-xs text-slate-500 italic mt-0.5">"{c.notes}"</div>}
            <div className="text-[10px] text-muted mt-1">{t('child.contact_logged_by', { who: c.logged_by_name })}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1">{label}</div>
      {children}
    </label>
  );
}
