import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Link2, Settings2, ShieldCheck, Trash2, UserPlus, X, Eye, EyeOff } from 'lucide-react';
import type { AdminUserRow, ChildSummary, Role } from '@socialmind/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type Tab = 'users' | 'assignments' | 'children' | 'permissions';
type Filter = 'all' | 'psychologist' | 'parent' | 'school_admin' | 'teacher';

const MAX_PARENTS = 2;
const MAX_PSYCHS = 2;

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
        <TabButton active={tab === 'children'} onClick={() => setTab('children')}>Children</TabButton>
        <TabButton active={tab === 'permissions'} onClick={() => setTab('permissions')}>{t('admin.permission_requests_tab')}</TabButton>
      </div>

      {tab === 'users' ? <UsersTab /> :
        tab === 'assignments' ? <AssignmentsTab /> :
        tab === 'children' ? <ChildrenTab /> :
        <PermissionRequestsTab />}
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
  const [twoFaTarget, setTwoFaTarget] = useState<AdminUserRow | null>(null);
  const [credsTarget, setCredsTarget] = useState<AdminUserRow | null>(null);
  const [children, setChildren] = useState<ChildSummary[]>([]);

  async function refresh() {
    const role = filter === 'all' ? undefined : (filter as Role);
    const rows = await api.adminUsers(role);
    setUsers(rows);
  }

  useEffect(() => { refresh(); }, [filter]);
  useEffect(() => { api.children().then(setChildren); }, []);

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
    { key: 'teacher', label: t('admin.filter_teachers') },
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
              <th className="text-center px-4 py-3 font-semibold">{t('admin.col_2fa')}</th>
              <th className="text-end px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted">{t('admin.no_users')}</td></tr>
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
                  {(u.role === 'parent' || u.role === 'psychologist' || u.role === 'teacher') ? (
                    u.linked_child_names.length > 0
                      ? <span className="line-clamp-2">{u.linked_child_names.join(', ')}</span>
                      : <span className="text-muted italic">—</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setTwoFaTarget(u)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                      u.two_factor_enabled
                        ? 'border-accent bg-accent text-white shadow-[0_0_0_2px_rgb(99_102_241_/_0.25)] hover:bg-accent/90'
                        : 'border-line text-slate-400 hover:bg-white/5 hover:border-slate-500'
                    }`}
                  >
                    <ShieldCheck size={12} strokeWidth={2.5} />
                    {u.two_factor_enabled ? t('admin.tfa_state_on') : t('admin.tfa_state_off')}
                  </button>
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex gap-1.5 justify-end">
                    {(u.role === 'parent' || u.role === 'teacher') && (
                      <IconButton onClick={() => setManaging(u)} label={t('admin.manage_children')}>
                        <Link2 size={13} strokeWidth={2} />
                        <span className="hidden md:inline">{t('admin.manage_children')}</span>
                      </IconButton>
                    )}
                    <IconButton onClick={() => setCredsTarget(u)} label={t('admin.creds_button')}>
                      <KeyRound size={13} strokeWidth={2} />
                      <span className="hidden md:inline">{t('admin.creds_button')}</span>
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

      {twoFaTarget && (
        <TwoFactorDialog
          user={twoFaTarget}
          onClose={() => setTwoFaTarget(null)}
          onSaved={async () => { setTwoFaTarget(null); await refresh(); }}
        />
      )}
      {credsTarget && (
        <UserCredentialsDialog
          user={credsTarget}
          onClose={() => setCredsTarget(null)}
          onSaved={async () => { setCredsTarget(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function UserCredentialsDialog({
  user, onClose, onSaved,
}: { user: AdminUserRow; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError(t('admin.creds_required')); return;
    }
    if (password && password.length < 8) {
      setError(t('admin.creds_pw_min')); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t('admin.tfa_email_invalid')); return;
    }
    setBusy(true);
    try {
      const body: { name?: string; email?: string; password?: string } = {};
      if (name.trim() !== user.name) body.name = name.trim();
      if (email.trim().toLowerCase() !== user.email.toLowerCase()) body.email = email.trim();
      if (password) body.password = password;
      if (Object.keys(body).length === 0) { onClose(); return; }
      await api.adminUpdateUser(user.id, body);
      await onSaved();
    } catch (e) {
      const reason = (e as { body?: { error?: string } }).body?.error;
      setError(
        reason === 'email_in_use' ? t('admin.creds_email_in_use')
        : t('admin.tfa_save_failed')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('admin.creds_user_title', { name: user.name })} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('admin.col_name')}>
          <TextInput value={name} onChange={setName} />
        </Field>
        <Field label={t('admin.col_email')}>
          <TextInput value={email} onChange={setEmail} type="email" />
        </Field>
        <Field label={t('admin.creds_pw_label')}>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('admin.creds_pw_placeholder')}
              className="w-full bg-ink border border-line rounded-md ps-3 pe-10 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        {error && (
          <div className="text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 justify-end pt-2 border-t border-line">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-sm border border-line text-slate-300 hover:bg-white/5">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-md text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold">
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ChildCredentialsDialog({
  childId, displayName, currentUsername, onClose, onSaved,
}: { childId: string; displayName: string; currentUsername: string | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(currentUsername ?? '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!username.trim()) { setError(t('admin.creds_required')); return; }
    if (!/^[a-z0-9._-]+$/i.test(username.trim())) { setError(t('admin.creds_username_format')); return; }
    if (password && password.length < 6) { setError(t('admin.creds_child_pw_min')); return; }
    setBusy(true);
    try {
      const body: { username?: string; password?: string } = {};
      if (username.trim() !== (currentUsername ?? '')) body.username = username.trim();
      if (password) body.password = password;
      if (Object.keys(body).length === 0) { onClose(); return; }
      await api.adminUpdateChildCredentials(childId, body);
      await onSaved();
    } catch (e) {
      const reason = (e as { body?: { error?: string } }).body?.error;
      setError(
        reason === 'username_in_use' ? t('admin.creds_username_in_use')
        : t('admin.tfa_save_failed')
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('admin.creds_child_title', { name: displayName })} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('admin.creds_username_label')}>
          <TextInput value={username} onChange={setUsername} />
        </Field>
        <Field label={t('admin.creds_pw_label')}>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('admin.creds_pw_placeholder')}
              className="w-full bg-ink border border-line rounded-md ps-3 pe-10 py-2 text-sm focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        {error && (
          <div className="text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 justify-end pt-2 border-t border-line">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-sm border border-line text-slate-300 hover:bg-white/5">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-md text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold">
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TwoFactorDialog({
  user, onClose, onSaved,
}: { user: AdminUserRow; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(user.two_factor_enabled);
  const [email, setEmail] = useState(user.two_factor_email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const trimmed = email.trim();
      if (enabled && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError(t('admin.tfa_email_invalid'));
        setBusy(false);
        return;
      }
      await api.adminSetUserTwoFactor(user.id, enabled, trimmed || null);
      await onSaved();
    } catch {
      setError(t('admin.tfa_save_failed'));
    } finally {
      setBusy(false);
    }
  }

  const fallbackEmail = user.email;

  return (
    <Modal title={t('admin.tfa_dialog_title', { name: user.name })} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-ink/40 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">{t('admin.tfa_dialog_status_label')}</div>
            <div className="text-xs text-muted mt-0.5">
              {enabled ? t('admin.tfa_dialog_status_on') : t('admin.tfa_dialog_status_off')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${enabled ? 'bg-accent' : 'bg-line'}`}
            aria-pressed={enabled}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-[1.4rem]' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        <div className={`space-y-2 ${enabled ? '' : 'opacity-60 pointer-events-none'}`}>
          <Field label={t('admin.tfa_dialog_email_label')}>
            <TextInput
              value={email}
              onChange={setEmail}
              placeholder={fallbackEmail}
              type="email"
            />
          </Field>
          <p className="text-xs text-muted leading-relaxed">
            {t('admin.tfa_dialog_email_hint', { fallback: fallbackEmail })}
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md text-sm border border-line text-slate-300 hover:bg-white/5"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RoleChip({ role }: { role: Role }) {
  const { t } = useTranslation();
  const key = role === 'school_admin' ? 'admin' : role;
  const styles: Record<Role, string> = {
    school_admin: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    psychologist: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    parent: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    teacher: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
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
    role: Role; name: string; email: string; phone: string; password: string; child_ids: string[];
  }>({
    role: 'psychologist', name: '', email: '', phone: '', password: '', child_ids: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const linkable = form.role === 'parent' || form.role === 'psychologist' || form.role === 'teacher';
  const cap = form.role === 'parent' ? MAX_PARENTS : form.role === 'psychologist' ? MAX_PSYCHS : Infinity;

  async function submit() {
    if (form.password.length < 8) { setError(t('admin.form_password_min')); return; }
    setSaving(true);
    setError(null);
    try {
      await api.adminCreateUser({
        role: form.role, name: form.name, email: form.email,
        phone: form.phone || undefined,
        password: form.password,
        child_ids: linkable ? form.child_ids : undefined,
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
            onChange={(e) => setForm({ ...form, role: e.target.value as Role, child_ids: [] })}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
          >
            <option value="psychologist">{t('auth.role_psychologist')}</option>
            <option value="parent">{t('auth.role_parent')}</option>
            <option value="teacher">{t('auth.role_teacher')}</option>
            <option value="school_admin">{t('auth.role_school_admin')}</option>
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

        {linkable && (
          <div>
            <div className="text-xs text-muted mb-1 font-medium">{t('admin.form_children')}</div>
            <div className="text-xs text-slate-500 mb-2">
              {t('admin.form_children_hint')}
              {Number.isFinite(cap) && ` (max ${cap} per child)`}
            </div>
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
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const before = new Set(parent.linked_child_ids);
      const after = new Set(selected);
      const toAdd = [...after].filter((id) => !before.has(id));
      const toRemove = [...before].filter((id) => !after.has(id));
      const link = parent.role === 'teacher' ? api.adminLinkTeacher : api.adminLinkParent;
      const unlink = parent.role === 'teacher' ? api.adminUnlinkTeacher : api.adminUnlinkParent;
      for (const cid of toAdd) {
        try { await link(cid, parent.id); }
        catch (e) {
          const body = (e as { body?: { error?: string } }).body;
          if (body?.error === 'parent_limit_reached') { setError(t('admin.parent_limit_reached')); return; }
          throw e;
        }
      }
      await Promise.all(toRemove.map((cid) => unlink(cid, parent.id)));
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
        {error && <div className="text-xs text-red-400">{error}</div>}
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

type LinkedPerson = { id: string; name: string; email: string; is_primary?: number };

function AssignmentsTab() {
  const { t } = useTranslation();
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [psychs, setPsychs] = useState<AdminUserRow[]>([]);
  const [parents, setParents] = useState<AdminUserRow[]>([]);
  const [teachers, setTeachers] = useState<AdminUserRow[]>([]);
  const [linkedParents, setLinkedParents] = useState<Record<string, LinkedPerson[]>>({});
  const [linkedPsychs, setLinkedPsychs] = useState<Record<string, LinkedPerson[]>>({});
  const [linkedTeachers, setLinkedTeachers] = useState<Record<string, LinkedPerson[]>>({});
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [cs, ps, pa, te] = await Promise.all([
      api.children(),
      api.adminUsers('psychologist'),
      api.adminUsers('parent'),
      api.adminUsers('teacher'),
    ]);
    setChildren(cs);
    setPsychs(ps);
    setParents(pa);
    setTeachers(te);
    const entries = await Promise.all(cs.map(async (c) => {
      const [pa, pp, pt] = await Promise.all([
        api.adminListChildParents(c.id),
        api.adminListChildPsychologists(c.id),
        api.adminListChildTeachers(c.id),
      ]);
      return [c.id, { pa, pp, pt }] as const;
    }));
    setLinkedParents(Object.fromEntries(entries.map(([id, v]) => [id, v.pa])));
    setLinkedPsychs(Object.fromEntries(entries.map(([id, v]) => [id, v.pp])));
    setLinkedTeachers(Object.fromEntries(entries.map(([id, v]) => [id, v.pt])));
  }

  useEffect(() => { refresh(); }, []);

  function withErrors(fn: () => Promise<void>) {
    return async () => {
      setError(null);
      try { await fn(); } catch (e) {
        const body = (e as { body?: { error?: string; detail?: string } }).body;
        if (body?.error === 'parent_limit_reached') setError(t('admin.parent_limit_reached'));
        else if (body?.error === 'psychologist_limit_reached') setError(t('admin.psychologist_limit_reached'));
        else if (body?.error === 'is_primary_psychologist') setError(t('admin.is_primary_psych_blocked'));
        else setError(body?.detail ?? body?.error ?? 'error');
      }
    };
  }

  async function reassignPrimary(childId: string, psychId: string) { await api.adminReassignPsychologist(childId, psychId); await refresh(); }
  async function linkParent(childId: string, parentId: string) { await api.adminLinkParent(childId, parentId); await refresh(); }
  async function unlinkParent(childId: string, parentId: string) { await api.adminUnlinkParent(childId, parentId); await refresh(); }
  async function linkPsych(childId: string, psychId: string) { await api.adminLinkPsychologist(childId, psychId); await refresh(); }
  async function unlinkPsych(childId: string, psychId: string) { await api.adminUnlinkPsychologist(childId, psychId); await refresh(); }
  async function linkTeacher(childId: string, teacherId: string) { await api.adminLinkTeacher(childId, teacherId); await refresh(); }
  async function unlinkTeacher(childId: string, teacherId: string) { await api.adminUnlinkTeacher(childId, teacherId); await refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings2 size={16} className="text-muted" />
        <div className="text-sm font-medium text-slate-200">{t('admin.assignments_title')}</div>
      </div>
      {error && <div className="text-sm text-red-300 bg-bad/5 border border-bad/30 rounded px-3 py-2">{error}</div>}
      {psychs.length === 0 && <div className="text-sm text-red-300 bg-bad/5 border border-bad/30 rounded px-3 py-2">{t('admin.no_psychologists')}</div>}
      {parents.length === 0 && <div className="text-sm text-amber-300 bg-warn/5 border border-warn/30 rounded px-3 py-2">{t('admin.no_parents')}</div>}
      {teachers.length === 0 && <div className="text-sm text-amber-300 bg-warn/5 border border-warn/30 rounded px-3 py-2">{t('admin.no_teachers')}</div>}
      <div className="space-y-3">
        {children.map((c) => (
          <div key={c.id} className="bg-card border border-line rounded-xl p-5 space-y-4 shadow-sm">
            <div className="font-semibold text-slate-100">{c.display_name}
              <span className="ms-2 text-muted text-xs font-normal">· {t('child.grade', { n: c.grade })}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">{t('admin.assign_psychologists')}</div>
                <PsychPicker
                  linked={linkedPsychs[c.id] ?? []}
                  allPsychs={psychs}
                  primaryId={c.psychologist_id}
                  onLink={(pid) => withErrors(() => linkPsych(c.id, pid))()}
                  onUnlink={(pid) => withErrors(() => unlinkPsych(c.id, pid))()}
                  onMakePrimary={(pid) => withErrors(() => reassignPrimary(c.id, pid))()}
                />
              </div>
              <div>
                <div className="text-xs text-muted mb-1.5 font-medium">{t('admin.assign_parents')}</div>
                <UserPicker
                  linked={linkedParents[c.id] ?? []}
                  all={parents}
                  cap={MAX_PARENTS}
                  onLink={(pid) => withErrors(() => linkParent(c.id, pid))()}
                  onUnlink={(pid) => withErrors(() => unlinkParent(c.id, pid))()}
                  emptyKey="admin.no_parents_linked"
                  linkLabelKey="admin.link_parent"
                />
              </div>
              <div className="md:col-span-2">
                <div className="text-xs text-muted mb-1.5 font-medium">{t('admin.assign_teachers')}</div>
                <UserPicker
                  linked={linkedTeachers[c.id] ?? []}
                  all={teachers}
                  onLink={(pid) => withErrors(() => linkTeacher(c.id, pid))()}
                  onUnlink={(pid) => withErrors(() => unlinkTeacher(c.id, pid))()}
                  emptyKey="admin.no_teachers_linked"
                  linkLabelKey="admin.link_teacher"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserPicker({
  linked, all, cap, onLink, onUnlink, emptyKey, linkLabelKey,
}: {
  linked: LinkedPerson[];
  all: AdminUserRow[];
  cap?: number;
  onLink: (id: string) => void;
  onUnlink: (id: string) => void;
  emptyKey: string;
  linkLabelKey: string;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState('');
  const available = useMemo(
    () => all.filter((p) => !linked.some((l) => l.id === p.id)),
    [all, linked]
  );
  const atCap = cap !== undefined && linked.length >= cap;

  return (
    <div className="space-y-2">
      {linked.length === 0 ? (
        <div className="text-xs text-muted italic">{t(emptyKey)}</div>
      ) : (
        <ul className="space-y-1">
          {linked.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm bg-ink border border-line rounded-md px-3 py-2">
              <span>{p.name} <span className="text-muted text-xs">({p.email})</span></span>
              <button onClick={() => onUnlink(p.id)} className="text-xs text-slate-400 hover:text-red-300 transition">
                {t('admin.unlink')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!atCap && available.length > 0 && (
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
            {t(linkLabelKey)}
          </button>
        </div>
      )}
    </div>
  );
}

function PsychPicker({
  linked, allPsychs, primaryId, onLink, onUnlink, onMakePrimary,
}: {
  linked: LinkedPerson[];
  allPsychs: AdminUserRow[];
  primaryId: string;
  onLink: (id: string) => void;
  onUnlink: (id: string) => void;
  onMakePrimary: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState('');
  const available = useMemo(
    () => allPsychs.filter((p) => !linked.some((l) => l.id === p.id)),
    [allPsychs, linked]
  );
  const atCap = linked.length >= MAX_PSYCHS;

  return (
    <div className="space-y-2">
      {linked.length === 0 ? (
        <div className="text-xs text-muted italic">{t('admin.no_psychologists_linked')}</div>
      ) : (
        <ul className="space-y-1">
          {linked.map((p) => {
            const isPrimary = p.id === primaryId;
            return (
              <li key={p.id} className="flex items-center justify-between text-sm bg-ink border border-line rounded-md px-3 py-2">
                <span>
                  {p.name} <span className="text-muted text-xs">({p.email})</span>
                  {isPrimary && <span className="ms-2 text-[10px] uppercase tracking-wider text-accent font-semibold">{t('admin.primary')}</span>}
                </span>
                <span className="flex gap-2">
                  {!isPrimary && (
                    <button onClick={() => onMakePrimary(p.id)} className="text-xs text-slate-400 hover:text-accent transition">
                      ★ {t('admin.primary')}
                    </button>
                  )}
                  {!isPrimary && (
                    <button onClick={() => onUnlink(p.id)} className="text-xs text-slate-400 hover:text-red-300 transition">
                      {t('admin.unlink')}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!atCap && available.length > 0 && (
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
            {t('admin.link_psychologist')}
          </button>
        </div>
      )}
    </div>
  );
}

function PermissionRequestsTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.adminListPermissionRequests>>>([]);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');

  async function refresh() {
    const out = await api.adminListPermissionRequests(filter === 'all' ? undefined : filter);
    setRows(out);
  }
  useEffect(() => { refresh(); }, [filter]);

  async function resolve(id: string, status: 'approved' | 'denied') {
    const note = status === 'denied' ? (window.prompt('Reason (optional)?') ?? undefined) : undefined;
    await api.adminResolvePermissionRequest(id, { status, resolved_note: note });
    await refresh();
  }

  const tabs: Array<['pending' | 'approved' | 'denied' | 'all', string]> = [
    ['pending', t('admin.perm_pending')],
    ['approved', t('admin.perm_approved')],
    ['denied', t('admin.perm_denied')],
    ['all', t('admin.filter_all')],
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 bg-card border border-line rounded-lg p-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              filter === k ? 'bg-accent/20 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >{label}</button>
        ))}
      </div>
      <div className="bg-card border border-line rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.perm_teacher')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.perm_child')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.perm_scope')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.perm_reason')}</th>
              <th className="text-start px-4 py-3 font-semibold">{t('admin.perm_requested')}</th>
              <th className="text-end px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">{t('admin.perm_no_requests')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.02] transition">
                <td className="px-4 py-3 text-slate-100">{r.teacher_name}</td>
                <td className="px-4 py-3 text-slate-100">{r.child_name}</td>
                <td className="px-4 py-3 text-slate-300 font-mono text-xs">{r.scope}</td>
                <td className="px-4 py-3 text-slate-400 text-xs max-w-md">{r.reason || '—'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{new Date(r.requested_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-end">
                  {r.status === 'pending' ? (
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => resolve(r.id, 'approved')} className="text-xs px-3 py-1.5 rounded-md bg-accent text-white font-medium">
                        {t('admin.perm_approve')}
                      </button>
                      <button onClick={() => resolve(r.id, 'denied')} className="text-xs px-3 py-1.5 rounded-md border border-line text-slate-300 hover:text-red-300">
                        {t('admin.perm_deny')}
                      </button>
                    </div>
                  ) : (
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${r.status === 'approved' ? 'text-accent' : 'text-slate-400'}`}>
                      {r.status === 'approved' ? t('admin.perm_approved') : t('admin.perm_denied')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChildrenTab() {
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [psychs, setPsychs] = useState<AdminUserRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [twoFaTarget, setTwoFaTarget] = useState<{ id: string; display_name: string } | null>(null);
  const [credsTarget, setCredsTarget] = useState<{ id: string; display_name: string; username: string | null } | null>(null);

  async function refresh() {
    const [c, u] = await Promise.all([api.children(), api.adminUsers('psychologist')]);
    setChildren(c);
    setPsychs(u);
  }
  useEffect(() => { refresh(); }, []);

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete child "${name}"? This wipes all their helper chats and sessions.`)) return;
    await api.adminDeleteChild(id);
    await refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setCreating(true)}
          disabled={psychs.length === 0}
          className="ms-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-accent hover:bg-accent/90 disabled:opacity-50 text-sm font-medium text-white shadow-sm transition"
        >
          <UserPlus size={15} strokeWidth={2} />
          Add child
        </button>
      </div>
      {psychs.length === 0 && (
        <div className="text-xs text-amber-400">Create a psychologist user first — every child must be assigned to one.</div>
      )}
      <div className="bg-card border border-line rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-start px-4 py-3 font-semibold">Name</th>
              <th className="text-start px-4 py-3 font-semibold">Username</th>
              <th className="text-start px-4 py-3 font-semibold">Grade</th>
              <th className="text-start px-4 py-3 font-semibold">Psychologist</th>
              <th className="text-end px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {children.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-muted">No children yet — click "Add child" to create one.</td></tr>
            )}
            {children.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02] transition">
                <td className="px-4 py-3 text-slate-100 font-medium">{c.display_name}</td>
                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.username ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{c.grade}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{c.psychologist_name ?? '—'}</td>
                <td className="px-4 py-3 text-end">
                  <div className="flex gap-1.5 justify-end items-center">
                    <button
                      type="button"
                      onClick={() => setTwoFaTarget({ id: c.id, display_name: c.display_name })}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
                        c.two_factor_enabled
                          ? 'border-accent bg-accent text-white shadow-[0_0_0_2px_rgb(99_102_241_/_0.25)] hover:bg-accent/90'
                          : 'border-line text-slate-300 hover:bg-white/5 hover:border-slate-500'
                      }`}
                    >
                      <ShieldCheck size={12} strokeWidth={2.5} />
                      2FA
                    </button>
                    <IconButton onClick={() => setCredsTarget({ id: c.id, display_name: c.display_name, username: c.username ?? null })} label="Credentials">
                      <KeyRound size={13} strokeWidth={2} />
                      <span className="hidden md:inline">Login</span>
                    </IconButton>
                    <IconButton onClick={() => remove(c.id, c.display_name)} label="Delete" tone="danger">
                      <Trash2 size={13} strokeWidth={2} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <CreateChildDialog
          psychologists={psychs}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await refresh(); }}
        />
      )}
      {twoFaTarget && (
        <ChildTwoFactorDialog
          childId={twoFaTarget.id}
          childName={twoFaTarget.display_name}
          onClose={() => setTwoFaTarget(null)}
          onSaved={async () => { setTwoFaTarget(null); await refresh(); }}
        />
      )}
      {credsTarget && (
        <ChildCredentialsDialog
          childId={credsTarget.id}
          displayName={credsTarget.display_name}
          currentUsername={credsTarget.username}
          onClose={() => setCredsTarget(null)}
          onSaved={async () => { setCredsTarget(null); await refresh(); }}
        />
      )}
    </div>
  );
}

function ChildTwoFactorDialog({
  childId, childName, onClose, onSaved,
}: { childId: string; childName: string; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminGetChildTwoFactor(childId)
      .then((r) => { setEnabled(r.enabled); setEmail(r.email ?? ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [childId]);

  async function save() {
    setError(null);
    const trimmed = email.trim();
    if (enabled && !trimmed) {
      setError(t('admin.tfa_child_email_required'));
      return;
    }
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t('admin.tfa_email_invalid'));
      return;
    }
    setBusy(true);
    try {
      await api.adminSetChildTwoFactor(childId, enabled, trimmed || null);
      await onSaved();
    } catch {
      setError(t('admin.tfa_save_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('admin.tfa_child_dialog_title', { name: childName })} onClose={onClose}>
      {loading ? (
        <div className="text-sm text-muted">{t('common.loading')}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-ink/40 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-100">{t('admin.tfa_dialog_status_label')}</div>
              <div className="text-xs text-muted mt-0.5">
                {enabled ? t('admin.tfa_child_status_on') : t('admin.tfa_child_status_off')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${enabled ? 'bg-accent' : 'bg-line'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-[1.4rem]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="space-y-2">
            <Field label={t('admin.tfa_child_email_label')}>
              <TextInput value={email} onChange={setEmail} placeholder="parent@example.com" type="email" />
            </Field>
            <p className="text-xs text-muted leading-relaxed">{t('admin.tfa_child_email_hint')}</p>
          </div>
          {error && (
            <div className="text-sm text-red-300 bg-bad/10 border border-bad/30 rounded-md px-3 py-2">{error}</div>
          )}
          <div className="flex gap-2 justify-end pt-2 border-t border-line">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-md text-sm border border-line text-slate-300 hover:bg-white/5">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-md text-sm bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold">
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateChildDialog({ psychologists, onClose, onCreated }: {
  psychologists: AdminUserRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    display_name: '', grade: 5, date_of_birth: '',
    username: '', password: '', psychologist_id: psychologists[0]?.id ?? '',
    preferred_lang: 'en' as 'en' | 'he' | 'ru', notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  async function submit() {
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(form.username)) { setError('Username letters / digits / _ - only'); return; }
    setSaving(true); setError(null);
    try {
      await api.adminCreateChild({ ...form });
      setCreated({ username: form.username, password: form.password });
    } catch (e) {
      const body = (e as { body?: { error?: string } }).body;
      setError(body?.error === 'username_taken' ? 'That username is already taken' : (body?.error ?? 'error'));
    } finally { setSaving(false); }
  }

  if (created) {
    return (
      <Modal title="Child created" onClose={() => { onCreated(); }}>
        <div className="space-y-3 text-sm">
          <p>Save these credentials — share them privately with the child / their parent. They are needed for the SocialMind kids app.</p>
          <div className="bg-elev rounded-md p-3 font-mono text-xs space-y-1">
            <div>username: <span className="text-accent">{created.username}</span></div>
            <div>password: <span className="text-accent">{created.password}</span></div>
          </div>
          <button onClick={onCreated} className="w-full px-3 py-2 rounded-md bg-accent text-white font-medium">Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add child" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name">
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" />
        </Field>
        <Field label="Username (for the kids app)">
          <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="dana"
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm font-mono" />
        </Field>
        <Field label="Password (min 6)">
          <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="something easy for the kid"
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm font-mono" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grade">
            <input type="number" min={1} max={12} value={form.grade}
              onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
              className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm" />
          </Field>
        </div>
        <Field label="Psychologist">
          <select value={form.psychologist_id} onChange={(e) => setForm({ ...form, psychologist_id: e.target.value })}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm">
            {psychologists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Preferred language">
          <select value={form.preferred_lang}
            onChange={(e) => setForm({ ...form, preferred_lang: e.target.value as 'en' | 'he' | 'ru' })}
            className="w-full bg-ink border border-line rounded-md px-3 py-2 text-sm">
            <option value="en">English</option>
            <option value="he">עברית</option>
            <option value="ru">Русский</option>
          </select>
        </Field>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-md border border-line text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 px-3 py-2 rounded-md bg-accent text-white font-medium text-sm disabled:opacity-50">
            {saving ? 'Creating…' : 'Create child'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
