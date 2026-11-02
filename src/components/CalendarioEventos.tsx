import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Pencil, Send, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import type { AuthUser, CalendarAnnouncement } from '../types/auth.ts';

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function CalendarioEventos({ user }: { user: AuthUser }) {
  const [events, setEvents] = useState<CalendarAnnouncement[]>([]);
  const [editingEvent, setEditingEvent] = useState<CalendarAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [today, setToday] = useState(() => new Date());
  const [shownMonth, setShownMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const canPublish = user.role !== 'student';
  const loadEvents = async () => {
    const result = await api<{ events: CalendarAnnouncement[] }>('/calendar');
    setEvents(result.events);
  };
  useEffect(() => {
    loadEvents().catch((cause: unknown) => setError(apiErrorMessage(cause)));
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const eventDates = useMemo(() => {
    const grouped = new Map<string, CalendarAnnouncement[]>();
    for (const event of events) grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    return grouped;
  }, [events]);
  const daysInMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
  const firstDayOffset = (new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1).getDay() + 6) % 7;
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: firstDayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const selectedEvents = eventDates.get(selectedDate) ?? [];
  const monthTitle = shownMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api(editingEvent ? `/calendar/${editingEvent.id}` : '/calendar', {
        method: editingEvent ? 'PUT' : 'POST',
        body: JSON.stringify({ title, date, description }),
      });
      setTitle('');
      setDate(selectedDate);
      setDescription('');
      setEditingEvent(null);
      await loadEvents();
      setError('');
      setMessage(editingEvent ? 'Comunicado atualizado para toda a comunidade escolar.' : 'Comunicado publicado para toda a comunidade escolar.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  const edit = (event: CalendarAnnouncement) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDate(event.date);
    setDescription(event.description);
    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditingEvent(null);
    setTitle('');
    setDate(selectedDate);
    setDescription('');
  };

  const remove = async (eventId: string) => {
    if (!window.confirm('Deseja remover este comunicado do calendário?')) return;
    try {
      await api(`/calendar/${eventId}`, { method: 'DELETE' });
      if (editingEvent?.id === eventId) cancelEdit();
      await loadEvents();
      setError('');
      setMessage('Comunicado removido do calendário.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  const goToToday = () => {
    const current = new Date();
    setToday(current);
    setShownMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setSelectedDate(dateKey(current));
  };

  return <section className="space-y-6"><div><p className="text-sm font-bold text-flow-700">Ano letivo · comunidade escolar</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Calendário</h1><p className="mt-1 text-sm text-slate-600">Hoje é {today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Consulte as datas e os eventos escolares.</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}

    <section aria-label="Calendário mensal" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays className="size-5 text-flow-700" /><h2 className="text-lg font-black capitalize text-slate-900">{monthTitle}</h2></div><div className="flex items-center gap-1"><button type="button" onClick={() => setShownMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Mês anterior" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="size-5" /></button><button type="button" onClick={goToToday} className="rounded-lg px-3 py-2 text-xs font-bold text-flow-700 hover:bg-flow-50">Hoje</button><button type="button" onClick={() => setShownMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Próximo mês" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="size-5" /></button></div></div>
      <div className="grid grid-cols-7 gap-1 text-center">{weekdays.map((weekday) => <div key={weekday} className="py-2 text-xs font-bold uppercase text-slate-500">{weekday}</div>)}{calendarCells.map((day, index) => {
        if (day === null) return <div key={`empty-${index}`} aria-hidden="true" />;
        const key = dateKey(new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day));
        const isToday = key === dateKey(today);
        const isSelected = selectedDate === key;
        const hasEvents = (eventDates.get(key)?.length ?? 0) > 0;
        return <button key={key} type="button" aria-pressed={isSelected} aria-label={`${day} de ${shownMonth.toLocaleDateString('pt-BR', { month: 'long' })}${hasEvents ? `, ${eventDates.get(key)!.length} evento(s)` : ''}`} onClick={() => { setSelectedDate(key); setDate(key); }} className={`relative mx-auto grid size-10 place-items-center rounded-full text-sm font-semibold transition ${isSelected ? 'bg-flow-700 text-white' : isToday ? 'border-2 border-flow-500 text-flow-700' : 'text-slate-700 hover:bg-flow-50'}`}>{day}{hasEvents && <span className={`absolute bottom-1 size-1 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-500'}`} />}</button>;
      })}</div>
      <div className="mt-4 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-slate-800">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>{selectedEvents.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum evento cadastrado para esta data.</p> : <ul className="mt-2 space-y-2">{selectedEvents.map((event) => <li key={event.id} className="rounded-lg bg-flow-50 px-3 py-2 text-sm"><span className="font-bold text-flow-800">{event.title}</span><span className="ml-2 text-slate-600">{event.description}</span></li>)}</ul>}</div>
    </section>

    {canPublish && <form onSubmit={publish} className="rounded-2xl border border-flow-100 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">{editingEvent ? 'Editar comunicado geral' : 'Criar comunicado geral'}</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-bold text-slate-700">Título</span><input required minLength={3} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Data</span><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label></div><label className="mt-4 block"><span className="mb-2 block text-sm font-bold text-slate-700">Descrição e orientações</span><textarea required maxLength={10000} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Atividades, instruções e orientações para a comunidade escolar" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm" /></label><div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950"><Send className="size-4" />{editingEvent ? 'Salvar alterações' : 'Publicar comunicado'}</button>{editingEvent && <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Cancelar edição</button>}</div></form>}

    <div><h2 className="mb-3 text-lg font-black text-slate-900">Comunicados gerais</h2>{events.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center"><CalendarDays className="mx-auto size-9 text-slate-400" /><p className="mt-3 font-semibold text-slate-700">Não há comunicados disponíveis no momento.</p></div> : <div className="grid gap-4 md:grid-cols-2">{events.map((event) => <article key={event.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-flow-700 text-center text-white"><span className="text-[10px] font-bold uppercase">{new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</span><strong className="text-xl leading-none">{new Date(`${event.date}T12:00:00`).getDate()}</strong></div><div className="min-w-0 flex-1"><h2 className="text-lg font-black text-slate-900">{event.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{new Date(`${event.date}T12:00:00`).toLocaleDateString('pt-BR')}</span><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />CETI Dr. João Carvalho</span></div><p className="mt-2 text-xs text-slate-500">Publicado por {event.authorName}</p></div>{canPublish && event.authorId === user.id && <div className="flex h-fit gap-1"><button type="button" onClick={() => edit(event)} aria-label={`Editar ${event.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-flow-50 hover:text-flow-700"><Pencil className="size-4" /></button><button type="button" onClick={() => void remove(event.id)} aria-label={`Excluir ${event.title}`} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button></div>}</article>)}</div>}</div>
  </section>;
}
