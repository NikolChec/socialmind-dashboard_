import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Link2, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import type { AdminUserRow, ChildSummary, Role } from '@socialmind/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type Tab = 'users' | 'assignments';
type Filter = 'all' | 'psychologist' | 'parent' | 'school_admin';

export function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('users');

  if (user?.role !== 'school_admin') {
    return <div className="text-muted">{t('security.admin_only_action')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
        <p className="text-sm text-muted mt-1">{t('admin.subtitle')}</p>
      </div>

      <div className="inline-flex gap-1 bg-card border border-line rounded-lg p-1">
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>{t('admin.users_tab')}</TabButton>
        <TabButton active={tab === 'assignments'} onClick={() => setTab('assignments')}>{t('admin.assignments_tab')}</TabButton>
      </div>

      {tab === 'users' ? <UsersTab /> : <AssignmentsTab />}
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
        active ? 'bg-accent/20 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function UsersTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<AdminUserRow | null>(null);
  const [children, setChildren] = useState<ChildSummary[]>([]);

  async function refresh() {
    const role = filter === 'all' ? undefined : (filter as Role);
    const rows = await api.adminUsers(role);
    setUsers(rows);
  }

  useEffect(() => { refresh(); }, [filter]);
  useEffect(() => { api.children().then(setChildren); }, []);

  async function resetPassword(id: string) {
    const pw = window.prompt(t('admin.form_password') + ' (min 8)');
    if (!pw || pw.length < 8) return;
    await api.adminUpdateUser(id, { password: pw });
  }

  async function remove(id: string) {
    if (!window.confirm(t('admin.confirm_delete'))) return;
    try {
      await api.adminDeleteUser(id);
      await refresh();
    } catch (e) {
      const body = (e as { body?: { error?: string } }).body;
      if (body?.error === 'has_children') alert(t('admin.delete_blocked_has_children'));
    }
  }

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('admin.filter_all') },
    { key: 'psychologist', label: t('admin.filter_psychologists') },
    { key: 'parent', label: t('admin.filter_parents') },
    { key: 'school_admin', label: t('admin.filter_admins') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-card border border-line rounded-lg p-1">
          {filters.map((f) => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.key ? 'bg-accent/20 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="ms-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent hover:bg-accent/90 text-sm font-medium text-white shadow-sm transition"
        >
          <UserPlus size={15} strokeWidth={2} />
          {t('admin.create_button')}
        </button>
      </div>

      <div className="bg-card border border-line rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.col_role')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.col_name')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.col_email')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.col_phone')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.col_linked')}</th>
              <th className="text-end px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">{t('admin.no_users')}</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition">
                <td className="px-4 py-3">
                  <RoleChip role={u.role} />
                </td>
                <td className="px-4 py-3 text-slate-100 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{u.phone ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs max-w-xs">
                  {u.role === 'parent' ? (
                    u.linked_child_names.length > 0
                      ? <span className="line-clamp-2">{u.linked_child_names.join(', ')}</span>
                      : <span className="text-muted italic">—</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex gap-1.5 justify-end">
                    {u.role === 'parent' && (
                      <IconButton onClick={() => setManaging(u)} label={t('admin.manage_children')}>
                        <Link2 size={13} strokeWidth={2} />
                        <span className="hidden md:inline">{t('admin.manage_children')}</span>
                      </IconButton>
                    )}
                    <IconButton onClick={() => resetPassword(u.id)} label={t('admin.reset_password')}>
                      <KeyRound size={13} strokeWidth={2} />
                      <span className="hidden md:inline">{t('admin.reset_password')}</span>
                    </IconButton>
                    {u.id !== user?.id && (
                      <IconButton onClick={() => remove(u.id)} label={t('admin.delete')} tone="danger">
                        <Trash2 size={13} strokeWidth={2} />
                      </IconButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateUserDialog
          children={children}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await refresh(); }}
        />
      )}

      {managing && (
        <ManageChildrenDialog
          parent={managing}
          allChildren={children}
          onClose={() => setManaging(null)}
          onSaved={async () => { setManaging(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function RoleChip({ role }: { role: Role }) {
  const { t } = useTranslation();
  const key = role === 'school_admin' ? 'admin' : role;
  const styles: Record<Role, string> = {
    school_admin: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    psychologist: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    parent: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center rounded-md border font-semibold px-2 py-0.5 text-[10px] uppercase tracking-wider ${styles[role]}`}>
      {t(`auth.role_${key}`)}
    </span>
  );
}

function IconButton({
  children, onClick, label, tone = 'default',
}: { children: React.ReactNode; onClick: () => void; label: string; tone?: 'default' | 'danger' }) {
  const cls = tone === 'danger'
    ? 'border-bad/30 text-red-300 hover:bg-bad/10'
    : 'border-line text-slate-300 hover:bg-white/5 hover:text-slate-100';
  return (
    <button
      onClick={onClick} title={label}
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border transition ${cls}`}
    >
      {children}
    </button>
  );
}

function CreateUserDialog({
  children, onClose, onCreated,
}: { children: ChildSummary[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<{
    role: Exclude<Role, 'school_admin'>; name: string; email: string; phone: string; password: string; child_ids: string[];
  }>({
    role: 'psychologist', name: '', email: '', phone: '', password: '', child_ids: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (form.password.length < 8) { setError(t('admin.form_password_min')); return; }
    setSaving(true);
    setError(null);
    try {
      await api.adminCreateUser({
        role: form.role, name: form.name, email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        child_ids: form.role === 'parent' ? form.child_ids : undefined,
      });
      onCreated();
    } catch (e) {
      const body = (e as { status?: number; body?: { error?: string } }).body;
      setError(body?.error === 'email_in_use' ? t('admin.email_in_use') : 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('admin.create_title')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('admin.form_role')}>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'psychologist' | 'parent' })}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          >
            <option value="psychologist">{t('auth.role_psychologist')}</option>
            <option value="parent">{t('auth.role_parent')}</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('admin.form_name')}>
            <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          </Field>
          <Field label={t('admin.form_email')}>
            <TextInput type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          </Field>
          <Field label={t('admin.form_phone')}>
            <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          </Field>
          <Field label={t('admin.form_password')}>
            <TextInput type="text" value={form.password} onChange={(v) => setForm({ ...form, password: v })}
              placeholder={t('admin.form_password_min')} required />
          </Field>
        </div>

        {form.role === 'parent' && (
          <div>
            <div className="text-xs text-muted mb-1 font-medium">{t('admin.form_children')}</div>
            <div className="text-xs text-slate-500 mb-2">{t('admin.form_children_hint')}</div>
            <ChildCheckboxList
              all={children}
              selected={form.child_ids}
              onChange={(ids) => setForm({ ...form, child_ids: ids })}
            />
          </div>
        )}

        {error && <div className="text-sm text-red-400 bg-bad/5 border border-bad/30 rounded px-3 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-slate-300 hover:bg-white/5 transition">
            {t('common.cancel')}
          </button>
          <button
            onClick={submit} disabled={saving}
            className="px-4 py-1.5 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white shadow-sm transition"
          >
            {saving ? t('common.saving') : t('admin.form_submit')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ManageChildrenDialog({
  parent, allChildren, onClose, onSaved,
}: {
  parent: AdminUserRow;
  allChildren: ChildSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(parent.linked_child_ids);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const before = new Set(parent.linked_child_ids);
      const after = new Set(selected);
      const toAdd = [...after].filter((id) => !before.has(id));
      const toRemove = [...before].filter((id) => !after.has(id));
      await Promise.all([
        ...toAdd.map((cid) => api.adminLinkParent(cid, parent.id)),
        ...toRemove.map((cid) => api.adminUnlinkParent(cid, parent.id)),
      ]);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('admin.manage_children_title', { name: parent.name })} onClose={onClose}>
      <div className="space-y-4">
        <div className="text-xs text-slate-400">{t('admin.manage_children_hint')}</div>
        <ChildCheckboxList all={allChildren} selected={selected} onChange={setSelected} max height="max-h-72" />
        <div className="flex justify-end gap-2 pt-2 border-t border-line">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm text-slate-300 hover:bg-white/5 transition">
            {t('common.cancel')}
          </button>
          <button
            onClick={save} disabled={saving}
            className="px-4 py-1.5 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white shadow-sm transition"
          >
            {saving ? t('common.saving') : t('admin.manage_save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ChildCheckboxList({
  all, selected, onChange, height = 'max-h-48',
}: { all: ChildSummary[]; selected: string[]; onChange: (ids: string[]) => void; max?: boolean; height?: string }) {
  const { t } = useTranslation();
  if (all.length === 0) {
    return <div className="text-sm text-muted bg-ink border border-line rounded-md p-4 text-center">{t('admin.no_children_in_school')}</div>;
  }
  return (
    <div className={`${height} overflow-y-auto scrollbar-thin bg-ink border border-line rounded-md divide-y divide-line`}>
      {all.map((c) => {
        const checked = selected.includes(c.id);
        return (
          <label key={c.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition ${checked ? 'bg-accent/5' : ''}`}>
            <input type="checkbox"
              checked={checked}
              onChange={(e) => onChange(
                e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id)
              )}
              className="accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-100">{c.display_name}</div>
              <div className="text-xs text-muted">{t('child.grade', { n: c.grade })} · {c.psychologist_name}</div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 grid place-items-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition">
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1.5 font-medium">{label}</div>
      {children}
    </label>
  );
}

function TextInput({
  value, onChange, type = 'text', placeholder, required,
}: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition"
    />
  );
}

function AssignmentsTab() {
  const { t } = useTranslation();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [psychs, setPsychs] = useState<AdminUserRow[]>([]);
  const [parents, setParents] = useState<AdminUserRow[]>([]);
  const [linked, setLinked] = useState<Record<string, Array<{ id: string; name: string; email: string }>>>({});

  async function refresh() {
    const [cs, ps, pa] = await Promise.all([
      api.children(), api.adminUsers('psychologist'), api.adminUsers('parent'),
    ]);
    setChildren(cs);
    setPsychs(ps);
    setParents(pa);
    const entries = await Promise.all(cs.map(async (c) => {
      const list = await api.adminListChildParents(c.id);
      return [c.id, list] as const;
    }));
    setLinked(Object.fromEntries(entries));
  }

  useEffect(() => { refresh(); }, []);

  async function reassign(childId: string, psychId: string) {
    await api.adminReassignPsychologist(childId, psychId);
    await refresh();
  }
  async function linkParent(childId: string, parentId: string) {
    await api.adminLinkParent(childId, parentId);
    await refresh();
  }
  async function unlinkParent(childId: string, parentId: string) {
    await api.adminUnlinkParent(childId, parentId);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 size={16} className="text-muted" />
        <div className="text-sm font-medium text-slate-200">{t('admin.assignments_title')}</div>
      </div>
      {psychs.length === 0 && <div className="text-sm text-red-300 bg-bad/5 border border-bad/30 rounded px-3 py-2">{t('admin.no_psychologists')}</div>}
      {parents.length === 0 && <div className="text-sm text-amber-300 bg-warn/5 border border-warn/30 rounded px-3 py-2">{t('admin.no_parents')}</div>}
      <div className="space-y-3">
        {children.map((c) => (
          <div key={c.id} className="bg-card border border-line rounded-xl p-5 space-y-3 shadow-sm">
            <div className="font-semibold text-slate-100">{c.display_name}
              <span className="ms-2 text-muted text-xs font-normal">· {t('child.grade', { n: c.grade })}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={t('admin.assign_psychologist')}>
                <select
                  value={c.psychologist_id}
                  onChange={(e) => reassign(c.id, e.target.value)}
                  className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition"
                >
                  {psychs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">{t('admin.assign_parents')}</div>
                <ParentPicker
                  linked={linked[c.id] ?? []}
                  allParents={parents}
                  onLink={(pid) => linkParent(c.id, pid)}
                  onUnlink={(pid) => unlinkParent(c.id, pid)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParentPicker({
  linked, allParents, onLink, onUnlink,
}: {
  linked: Array<{ id: string; name: string; email: string }>;
  allParents: AdminUserRow[];
  onLink: (parentId: string) => void;
  onUnlink: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState('');
  const available = useMemo(
    () => allParents.filter((p) => !linked.some((l) => l.id === p.id)),
    [allParents, linked]
  );

  return (
    <div className="space-y-2">
      {linked.length === 0 ? (
        <div className="text-xs text-muted italic">{t('admin.no_parents_linked')}</div>
      ) : (
        <ul className="space-y-1">
          {linked.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm bg-ink border border-line rounded-md px-3 py-2">
              <span>{p.name} <span className="text-muted text-xs">({p.email})</span></span>
              <button
                onClick={() => onUnlink(p.id)}
                className="text-xs text-slate-400 hover:text-red-300 transition"
              >
                {t('admin.unlink')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="flex-1 bg-ink border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition"
          >
            <option value="">—</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
            ))}
          </select>
          <button
            disabled={!pick}
            onClick={() => { onLink(pick); setPick(''); }}
            className="text-xs px-3 py-1.5 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-medium transition"
          >
            {t('admin.link_parent')}
          </button>
        </div>
      )}
    </div>
  );
}
