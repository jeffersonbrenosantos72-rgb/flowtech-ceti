import { useEffect, useState } from 'react';
import { Clock3, MapPin, Save, School } from 'lucide-react';
import { SCHOOL_CLASSES, type SchoolClass } from '../data/school.ts';
import { SCHEDULES_BY_CLASS } from '../data/mockData.ts';
import { api, apiErrorMessage } from '../data/api.ts';
import type { AuthUser } from '../types/auth.ts';
import type { SubjectCategory, Weekday } from '../types/index.ts';
import { currentSchoolDay } from '../utils/academic.ts';
import { applyScheduleEdits, copySchedules, type EditableSchedules, type ScheduleEdit } from '../utils/schedule.ts';

const weekdays = Object.keys(SCHEDULES_BY_CLASS[SCHOOL_CLASSES[0]]) as Weekday[];
const categoryColor: Record<SubjectCategory, string> = { BNCC: 'border-sky-200 bg-sky-50 text-sky-800', Técnica: 'border-emerald-200 bg-emerald-50 text-emerald-800', 'Recomposição/Eletiva': 'border-amber-200 bg-amber-50 text-amber-800' };
function collectScheduleEdits(schedules: EditableSchedules): ScheduleEdit[] {
  return SCHOOL_CLASSES.flatMap((className) => weekdays.flatMap((weekday) =>
    schedules[className][weekday].flatMap((lesson, index) => {
      const original = SCHEDULES_BY_CLASS[className][weekday][index];
      return lesson.subject === original.subject && lesson.time === original.time &&
        lesson.teacher === original.teacher && lesson.category === original.category ? [] : [{
        className,
        weekday,
        period: lesson.period,
        subject: lesson.subject,
        teacher: lesson.teacher,
        time: lesson.time,
        category: lesson.category,
      }];
    }),
  ));
}

export function HorarioAulas({ user }: { user: AuthUser }) {
  const [day, setDay] = useState<Weekday>(() => currentSchoolDay());
  const [className, setClassName] = useState<SchoolClass>(user.className ?? SCHOOL_CLASSES[0]);
  const [schedules, setSchedules] = useState<EditableSchedules>(copySchedules);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isManager = user.role === 'manager';

  useEffect(() => {
    api<{ value: ScheduleEdit[] }>('/schedules')
      .then(({ value }) => {
        setSchedules(applyScheduleEdits(value));
        setLoaded(true);
      })
      .catch((cause: unknown) => setError(apiErrorMessage(cause)));
  }, []);

  const lessons = schedules[className][day];
  const hasClockTimes = lessons.length > 0 && lessons.every((lesson) => Boolean(lesson.time));
  const showsLessonTimes = lessons.some((lesson) => Boolean(lesson.time));
  const updateLesson = (period: number, key: 'subject' | 'teacher' | 'time' | 'category', value: string) => {
    setSchedules((current) => ({
      ...current,
      [className]: {
        ...current[className],
        [day]: current[className][day].map((lesson) =>
          lesson.period === period ? { ...lesson, [key]: value } : lesson,
        ),
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/schedules', {
        method: 'PUT',
        body: JSON.stringify({ value: collectScheduleEdits(schedules) }),
      });
      setEditing(false);
      setMessage('Horários atualizados para toda a comunidade escolar.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-flow-700">Grade semanal · documento institucional</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Horário de aulas</h1>
        <p className="mt-1 text-sm text-slate-600">Consulte a grade semanal da turma selecionada.</p>
      </div>
      {isManager && (editing
        ? <button disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950 disabled:cursor-wait disabled:opacity-60"><Save className="size-4" />{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        : <button disabled={!loaded} onClick={() => { setEditing(true); setMessage(''); }} className="rounded-xl border border-flow-200 bg-white px-4 py-2.5 text-sm font-bold text-flow-700 hover:bg-flow-50 disabled:cursor-not-allowed disabled:opacity-50">Editar horários</button>)}
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
    {editing && <p className="rounded-xl border border-flow-100 bg-flow-50 p-3 text-sm text-flow-800">Edite a disciplina, a classificação curricular, o horário e o professor responsável de cada aula. A quantidade de aulas não pode ser alterada.</p>}
    <label className="block max-w-xl"><span className="mb-2 block text-sm font-bold text-slate-700">Turma</span><select value={className} onChange={(event) => setClassName(event.target.value as SchoolClass)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100">{SCHOOL_CLASSES.map((schoolClass) => <option key={schoolClass}>{schoolClass}</option>)}</select></label>
    <div className="nav-scroll flex gap-2 overflow-x-auto pb-1">{weekdays.map((weekday) => <button key={weekday} onClick={() => setDay(weekday)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${day === weekday ? 'bg-flow-700 text-white shadow-md' : 'border border-slate-200 bg-white text-slate-600 hover:border-flow-300'}`}>{weekday.replace('-feira', '')}</button>)}</div>
    {lessons.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><School className="mx-auto size-9 text-slate-400" /><h2 className="mt-3 font-black text-slate-800">Grade ainda não cadastrada</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Não há horários confirmados para {className}.</p></div> :
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-black text-slate-900">{day}</h2><p className="text-sm text-slate-600">{className}</p><p className="mt-1 text-xs text-slate-500">{hasClockTimes ? 'Horários por aula' : 'Ordem das aulas transcrita do PDF; o documento não informa horários por relógio nem salas.'}</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-flow-50 px-3 py-1.5 text-xs font-bold text-flow-700"><Clock3 className="size-4" />{lessons.length} aulas</span>
        </div>
        <div className="divide-y divide-slate-100">{lessons.map((lesson) => {
          const showTime = editing || hasClockTimes || showsLessonTimes;
          return <div key={`${day}-${lesson.period}`}>
            <div className={`grid gap-3 px-5 py-4 ${showTime ? 'sm:grid-cols-[68px_150px_1fr_auto]' : 'sm:grid-cols-[68px_1fr_auto]'} sm:items-center`}>
              <span className="font-black text-flow-700">{lesson.period}º</span>
              {showTime && (editing
                ? <label className="text-xs font-semibold text-slate-500">Horário<input aria-label={`Horário da ${lesson.period}ª aula`} value={lesson.time} onChange={(event) => updateLesson(lesson.period, 'time', event.target.value)} maxLength={30} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-700" /></label>
                : <span className="text-sm font-bold text-slate-600">{lesson.time || '—'}</span>)}
              <div>
                {editing
                  ? <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-500">Disciplina<input aria-label={`Disciplina da ${lesson.period}ª aula`} value={lesson.subject} onChange={(event) => updateLesson(lesson.period, 'subject', event.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-800" /></label><label className="text-xs font-semibold text-slate-500">Professor responsável<input aria-label={`Professor responsável pela ${lesson.period}ª aula`} value={lesson.teacher} onChange={(event) => updateLesson(lesson.period, 'teacher', event.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-800" /></label><label className="text-xs font-semibold text-slate-500">Classificação curricular<select aria-label={`Classificação curricular da ${lesson.period}ª aula`} value={lesson.category} onChange={(event) => updateLesson(lesson.period, 'category', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-800"><option value="BNCC">BNCC</option><option value="Técnica">Técnica</option><option value="Recomposição/Eletiva">Recomposição/Eletiva</option></select></label></div>
                  : <p className="font-bold text-slate-800">{lesson.subject}</p>}
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><School className="size-3.5" />{lesson.teacher}{lesson.room && <><span className="mx-1">·</span><MapPin className="size-3.5" />{lesson.room}</>}</p>
              </div>
              <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-black ${categoryColor[lesson.category]}`}>{lesson.category}</span>
            </div>
          </div>;
        })}</div>
      </div>}
  </section>;
}
