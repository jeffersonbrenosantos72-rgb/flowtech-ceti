import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, MessageCircle, Pencil, Send, Trash2, UsersRound } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import { SCHOOL_CLASSES } from '../data/school.ts';
import type { AuthUser, ClassAnnouncement, GuardianContact } from '../types/auth.ts';

function whatsappUrl(phone: string | null) {
  const digits = phone?.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
}

export function MuralAvisos({ user }: { user: AuthUser }) {
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);
  const [contacts, setContacts] = useState<GuardianContact[]>([]);
  const [className, setClassName] = useState<string>(user.className ?? SCHOOL_CLASSES[0]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isStaff = user.role !== 'student';
  const canViewContacts = user.role === 'teacher' || user.role === 'manager';

  const loadAnnouncements = async () => {
    const result = await api<{ announcements: ClassAnnouncement[] }>('/announcements');
    setAnnouncements(result.announcements);
  };
  useEffect(() => {
    loadAnnouncements().catch((cause: unknown) => setError(apiErrorMessage(cause)));
    if (canViewContacts) api<{ contacts: GuardianContact[] }>('/guardians')
      .then(({ contacts: result }) => setContacts(result))
      .catch((cause: unknown) => setError(apiErrorMessage(cause)));
  }, [isStaff, canViewContacts]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api(editingId ? `/announcements/${editingId}` : '/announcements', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ className, title, body }),
      });
      setTitle('');
      setBody('');
      setEditingId(null);
      await loadAnnouncements();
      setError('');
      setMessage(editingId ? 'Comunicado atualizado.' : `Comunicado publicado para ${className}.`);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  const edit = (announcement: ClassAnnouncement) => {
    setEditingId(announcement.id);
    setClassName(announcement.className);
    setTitle(announcement.title);
    setBody(announcement.body);
    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
  };

  const remove = async (announcement: ClassAnnouncement) => {
    if (!window.confirm(`Deseja excluir o comunicado "${announcement.title}" para todos os usuários da turma?`)) return;
    try {
      await api(`/announcements/${announcement.id}`, { method: 'DELETE' });
      if (editingId === announcement.id) cancelEdit();
      await loadAnnouncements();
      setError('');
      setMessage('Comunicado excluído.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  return <section className="space-y-6"><div><p className="text-sm font-bold text-flow-700">Comunicação escolar · Mural</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Mural de avisos</h1><p className="mt-1 text-sm text-slate-600">{isStaff ? 'Comunicados são publicados para uma turma por vez.' : `Comunicados destinados a ${user.className}.`}</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
    {isStaff && <form onSubmit={publish} className="rounded-2xl border border-flow-100 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">{editingId ? 'Editar comunicado' : 'Novo comunicado para uma turma'}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label><span className="mb-2 block text-sm font-bold text-slate-700">Turma destinatária</span><select value={className} onChange={(event) => setClassName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">{SCHOOL_CLASSES.map((schoolClass) => <option key={schoolClass}>{schoolClass}</option>)}</select></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Título</span><input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label></div><label className="mt-4 block"><span className="mb-2 block text-sm font-bold text-slate-700">Mensagem</span><textarea required maxLength={5000} rows={4} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950"><Send className="size-4" />{editingId ? 'Salvar alterações' : 'Publicar para esta turma'}</button>{editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancelar</button>}</div></form>}
    <div><h2 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900"><BellRing className="size-5 text-flow-700" />Comunicados</h2>{announcements.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600">Não há comunicados disponíveis para esta turma.</div> : <div className="grid gap-4 md:grid-cols-2">{announcements.map((announcement) => <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-flow-50 px-2.5 py-1 text-xs font-black text-flow-700">{announcement.className}</span><div className="flex items-center gap-2"><span className="text-xs text-slate-500">{new Date(announcement.createdAt).toLocaleDateString('pt-BR')}</span>{isStaff && announcement.authorId === user.id && <><button type="button" onClick={() => edit(announcement)} aria-label={`Editar ${announcement.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-flow-50 hover:text-flow-700"><Pencil className="size-4" /></button><button type="button" onClick={() => void remove(announcement)} aria-label={`Excluir ${announcement.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button></>}</div></div><h3 className="mt-3 text-lg font-black text-slate-900">{announcement.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.body}</p><p className="mt-4 text-xs font-semibold text-slate-500">Publicado por {announcement.authorName}</p></article>)}</div>}</div>
    {canViewContacts && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><UsersRound className="size-5 text-flow-700" />Contatos dos alunos e responsáveis</h2><p className="mt-1 text-sm text-slate-600">Os dois números ficam visíveis somente para professores e gestores. O WhatsApp abre fora do FlowTech; conversas não são armazenadas no portal.</p>{contacts.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum contato cadastrado.</p> : <ul className="mt-4 divide-y divide-slate-100">{contacts.map((contact, index) => { const guardianUrl = whatsappUrl(contact.guardianPhone); const studentUrl = whatsappUrl(contact.studentPhone); return <li key={`${contact.studentName}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold text-slate-800">{contact.studentName}</p><p className="text-xs text-slate-500">{contact.className}</p><p className="mt-1 text-sm text-slate-700">Aluno: {contact.studentPhone ?? 'Não informado'}</p><p className="text-sm text-slate-700">Responsável: {contact.guardianPhone ?? 'Não informado'}</p></div><div className="flex flex-wrap gap-2">{studentUrl && <a href={studentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><MessageCircle className="size-4" />WhatsApp do aluno</a>}{guardianUrl && <a href={guardianUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><MessageCircle className="size-4" />WhatsApp do responsável</a>}</div></li>; })}</ul>}</section>}
  </section>;
}
