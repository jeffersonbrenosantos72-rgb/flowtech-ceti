import { useState, type ChangeEvent, type FormEvent } from 'react';
import { LogOut, Save, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import type { AuthUser } from '../types/auth.ts';
import { roleLabel } from '../utils/roleLabel.ts';

interface HeaderProps {
  user: AuthUser;
  onLogout: () => void;
  onProfileChange: (user: AuthUser) => void;
  onAccountDeleted: () => void;
}

function resizeProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return Promise.reject(new Error('Escolha uma imagem JPEG, PNG ou WebP.'));
  }
  const imageUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Não foi possível processar a foto selecionada.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Não foi possível abrir a foto selecionada.'));
    };
    image.src = imageUrl;
  });
}

export function Header({ user, onLogout, onProfileChange, onAccountDeleted }: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [photo, setPhoto] = useState<string | null>(user.profilePhoto);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openProfile = () => {
    setName(user.name);
    setPhoto(user.profilePhoto);
    setError('');
    setProfileOpen((open) => !open);
  };

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await resizeProfilePhoto(file));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível processar a foto.');
    } finally {
      event.target.value = '';
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api<{ user: AuthUser }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, profilePhoto: photo }),
      });
      onProfileChange(result.user);
      setProfileOpen(false);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    const accepted = window.confirm('Excluir definitivamente sua conta? Seus comunicados serão removidos e as notas acadêmicas serão preservadas. Será necessário criar uma nova conta para voltar. Esta ação não pode ser desfeita.');
    if (!accepted) return;
    setSaving(true);
    setError('');
    try {
      await api('/profile/account', { method: 'DELETE' });
      onAccountDeleted();
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setSaving(false);
    }
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3"><img src="/flowtech-logo.png" alt="Logo FlowTech" className="size-12 rounded-2xl object-cover shadow-lg" /><div><p className="font-black leading-tight text-slate-900">SEDUC-PI <span className="font-medium text-slate-400">·</span> 9ª GRE</p><p className="text-xs font-semibold text-flow-700">CETI Dr. João Carvalho · Dom Expedito Lopes</p></div></div>
        <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:flex"><ShieldCheck className="size-4" /> Conta autenticada</div><div className="relative flex items-center gap-2 border-l border-slate-200 pl-3"><button type="button" onClick={openProfile} aria-label="Abrir perfil e configurações" aria-expanded={profileOpen} className="grid size-10 place-items-center overflow-hidden rounded-full bg-flow-100 text-flow-700 ring-2 ring-transparent hover:ring-flow-300">{user.profilePhoto ? <img src={user.profilePhoto} alt="" className="size-full object-cover" /> : <UserRound className="size-5" />}</button><div className="hidden sm:block"><p className="text-sm font-bold text-slate-800">{user.name}</p><p className="text-[11px] text-slate-500">{roleLabel(user.role, user.gender)}{user.className ? ` · ${user.className}` : ''}</p></div><button onClick={onLogout} aria-label="Sair da conta" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><LogOut className="size-5" /></button>
          {profileOpen && <section className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><h2 className="font-black text-slate-900">Meu perfil</h2><button type="button" onClick={() => setProfileOpen(false)} aria-label="Fechar perfil" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button></div><form onSubmit={saveProfile} className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Nome da conta</span><input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Foto de perfil</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectPhoto(event)} className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-flow-50 file:px-3 file:py-2 file:font-bold file:text-flow-700" /><span className="mt-1 block text-xs text-slate-500">PNG, JPEG ou WebP · a foto será redimensionada para o perfil.</span></label>{photo && <img src={photo} alt="Prévia da foto de perfil" className="size-16 rounded-full object-cover" />}{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950 disabled:opacity-50"><Save className="size-4" />Salvar</button></form><button type="button" disabled={saving} onClick={() => void deleteAccount()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="size-4" />Excluir minha conta</button></section>}
        </div></div>
      </div>
    </header>
  );
}
