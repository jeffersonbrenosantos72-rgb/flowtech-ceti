import { useEffect, useState } from 'react';
import { ArrowRight, BellRing, Bus, CalendarClock, ChevronRight, ClipboardCheck, GraduationCap, Soup, TableProperties } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import type { AuthUser, CalendarAnnouncement, ClassAnnouncement, GradeRecord } from '../types/auth.ts';
import type { PageId } from '../types/index.ts';

interface DashboardOverviewProps { user: AuthUser; onNavigate: (page: PageId) => void; }
const metricClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

export function DashboardOverview({ user, onNavigate }: DashboardOverviewProps) {
  const [events, setEvents] = useState<CalendarAnnouncement[]>([]);
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);
  const [gradeCount, setGradeCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const requests: Promise<unknown>[] = [
      api<{ events: CalendarAnnouncement[] }>('/calendar').then(({ events: rows }) => setEvents(rows)),
      api<{ announcements: ClassAnnouncement[] }>('/announcements').then(({ announcements: rows }) => setAnnouncements(rows)),
    ];
    if (user.role === 'student') {
      requests.push(api<{ records: GradeRecord[] }>('/grades').then(({ records }) => {
        setGradeCount(records.reduce((count, record) => count + record.grades.filter((grade) => grade !== null).length, 0));
      }));
    }
    Promise.all(requests).catch((cause: unknown) => setError(apiErrorMessage(cause)));
  }, [user.role]);

  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const nextEvent = events.find((event) => event.date >= todayDate);
  const roleDescription = user.role === 'student'
    ? 'Sua jornada acadêmica'
    : user.role === 'teacher'
      ? user.gender === 'female' ? 'Área da professora' : user.gender === 'male' ? 'Área do professor' : 'Área do(a) professor(a)'
      : user.role === 'employee'
        ? user.gender === 'female' ? 'Área da funcionária' : user.gender === 'male' ? 'Área do funcionário' : 'Área do(a) funcionário(a)'
        : user.gender === 'female' ? 'Painel da gestora escolar' : user.gender === 'male' ? 'Painel do gestor escolar' : 'Painel da gestão escolar';
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-flow-700">Olá, {user.name}</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Visão geral</h1><p className="mt-1 text-sm text-slate-600">{roleDescription}{user.className ? ` · ${user.className}` : ''}</p></div><button onClick={() => onNavigate('boletim')} className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950">Abrir boletim <ArrowRight className="size-4" /></button></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className={metricClass}><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-500">Notas registradas</p><ClipboardCheck className="size-5 text-flow-700" /></div><p className="mt-3 text-3xl font-black text-slate-900">{gradeCount === null ? '—' : gradeCount}</p><p className="mt-1 text-xs text-slate-600">{user.role === 'student' ? 'Notas do seu boletim' : 'Consulte os registros por turma'}</p></article>
        <article className={metricClass}><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-500">Próximo comunicado</p><CalendarClock className="size-5 text-flow-700" /></div><p className="mt-3 text-lg font-black text-slate-900">{nextEvent?.title ?? 'Nenhum comunicado'}</p><p className="mt-1 text-xs text-slate-600">{nextEvent ? new Date(`${nextEvent.date}T12:00:00`).toLocaleDateString('pt-BR') : 'O calendário está disponível para consulta'}</p></article>
        <button onClick={() => onNavigate('horarios')} className={`${metricClass} text-left transition hover:border-flow-300`}><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-500">Horários</p><TableProperties className="size-5 text-flow-700" /></div><p className="mt-3 text-xl font-black text-slate-900">Consultar grade</p><p className="mt-1 text-xs text-slate-600">Selecione uma das oito turmas</p></button>
        <button onClick={() => onNavigate('cardapio')} className={`${metricClass} text-left transition hover:border-flow-300`}><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-500">Alimentação</p><Soup className="size-5 text-amber-600" /></div><p className="mt-3 text-xl font-black text-slate-900">Cardápio escolar</p><p className="mt-1 text-xs text-slate-600">Informações da merenda</p></button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-flow-700">Serviços escolares</p><h2 className="text-xl font-black text-slate-900">Acesso rápido</h2></div><Bus className="text-flow-700" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => onNavigate('transporte')} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700 hover:bg-flow-50">Rotas de transporte <ChevronRight className="size-4" /></button><button onClick={() => onNavigate('calendario')} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-700 hover:bg-flow-50">Calendário geral <ChevronRight className="size-4" /></button></div></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-flow-700">Comunicação</p><h2 className="text-xl font-black text-slate-900">Mural da escola</h2></div><BellRing className="text-flow-700" /></div>{announcements.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum comunicado disponível para exibir.</p> : <div className="mt-4 space-y-3">{announcements.slice(0, 3).map((announcement) => <div key={announcement.id} className="rounded-xl border border-slate-100 p-3"><p className="text-xs font-bold text-flow-700">{announcement.className}</p><p className="mt-1 font-bold text-slate-800">{announcement.title}</p><p className="mt-1 line-clamp-2 text-sm text-slate-600">{announcement.body}</p></div>)}</div>}<button onClick={() => onNavigate('mural')} className="mt-4 text-sm font-bold text-flow-700 hover:underline">Abrir mural</button></article>
      </div>
      {user.role === 'student' && gradeCount === 0 && <p className="rounded-xl border border-flow-100 bg-flow-50 p-4 text-sm text-flow-950"><GraduationCap className="mr-2 inline size-5" />Seu boletim será preenchido pelos professores ao longo do período letivo.</p>}
    </section>
  );
}
