import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, Save, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import { SCHOOL_CLASSES } from '../data/school.ts';
import { SUBJECTS } from '../data/mockData.ts';
import type { AuthUser, GradeRecord } from '../types/auth.ts';
import { formatGrade } from '../utils/academic.ts';
import { applyScheduleEdits, copySchedules, teachersForSubject, type EditableSchedules, type ScheduleEdit } from '../utils/schedule.ts';
import type { SchoolClass } from '../data/school.ts';

const terms = [
  { label: '1º trimestre', months: ['Março', 'Abril', 'Maio'] },
  { label: '2º trimestre', months: ['Junho', 'Julho', 'Agosto'] },
  { label: '3º trimestre', months: ['Setembro', 'Outubro', 'Novembro'] },
];
type Student = { id: string; name: string };
type GradeDraft = {
  studentId: string;
  className: string;
  subjectId: string;
  trimester: number;
  month: number;
  value: string;
};

export function BoletimEscolar({ user }: { user: AuthUser }) {
  const [trimester, setTrimester] = useState(1);
  const [className, setClassName] = useState<string>(user.className ?? SCHOOL_CLASSES[0]);
  const [subjectId, setSubjectId] = useState(SUBJECTS[0]!.id);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<GradeRecord[]>([]);
  const [schedules, setSchedules] = useState<EditableSchedules>(copySchedules);
  const [scheduleEdits, setScheduleEdits] = useState<ScheduleEdit[]>([]);
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isStudent = user.role === 'student';
  const isTeacher = user.role === 'teacher';
  const currentTerm = terms[trimester - 1]!;
  const subjectById = useMemo(() => new Map(SUBJECTS.map((subject) => [subject.id, subject])), []);

  useEffect(() => {
    let active = true;
    setError('');
    const query = isStudent ? '' : `?className=${encodeURIComponent(className)}`;
    Promise.all([
      api<{ records: GradeRecord[] }>(`/grades${query}`),
      isStudent ? Promise.resolve({ students: [] as Student[] }) : api<{ students: Student[] }>(`/students?className=${encodeURIComponent(className)}`),
      api<{ value: ScheduleEdit[] }>('/schedules'),
    ]).then(([gradeResult, studentResult, scheduleResult]) => {
      if (!active) return;
      setRecords(gradeResult.records);
      setStudents(studentResult.students);
      setScheduleEdits(scheduleResult.value);
      setSchedules(applyScheduleEdits(scheduleResult.value));
    }).catch((cause: unknown) => { if (active) setError(apiErrorMessage(cause)); });
    return () => { active = false; };
  }, [className, isStudent]);

  const confirmDiscardDrafts = () => {
    if (Object.keys(drafts).length === 0) return true;
    return window.confirm('Há notas não salvas. Deseja descartá-las para alterar os filtros?');
  };

  const updateRecord = (draft: GradeDraft, grade: number) => {
    setRecords((current) => {
      const index = draft.month - 3;
      const existing = current.find((record) => record.studentId === draft.studentId && record.subjectId === draft.subjectId);
      if (existing) {
        return current.map((record) => record === existing
          ? { ...record, grades: record.grades.map((value, gradeIndex) => gradeIndex === index ? grade : value) as GradeRecord['grades'] }
          : record);
      }
      const student = students.find((item) => item.id === draft.studentId);
      const grades: GradeRecord['grades'] = [null, null, null, null, null, null, null, null, null];
      grades[index] = grade;
      return [...current, { studentId: draft.studentId, studentName: student?.name ?? '', subjectId: draft.subjectId, grades }];
    });
  };

  const saveDrafts = async () => {
    const pending = Object.entries(drafts).filter(([, draft]) => draft.value.trim() !== '');
    const parsed = pending.map(([key, draft]) => ({ key, draft, grade: Number(draft.value.replace(',', '.')) }));
    if (parsed.some(({ grade }) => !Number.isFinite(grade) || grade < 0 || grade > 10)) {
      setError('Todas as notas devem estar entre 0 e 10.');
      return;
    }
    if (parsed.length === 0) {
      setError('Informe ao menos uma nota antes de salvar.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      for (const { key, draft, grade } of parsed) {
        await api('/grades', {
          method: 'PUT',
          body: JSON.stringify({
            studentId: draft.studentId,
            className: draft.className,
            subjectId: draft.subjectId,
            trimester: draft.trimester,
            month: draft.month,
            grade,
          }),
        });
        updateRecord(draft, grade);
        setDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
      setNotice(`${parsed.length === 1 ? 'Nota salva' : `${parsed.length} notas salvas`} com sucesso.`);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const deleteGrade = async (studentId: string, month: number, studentName: string) => {
    if (!window.confirm(`Deseja excluir a nota de ${currentTerm.months[month - (trimester - 1) * 3 - 3]} de ${studentName}?`)) return;
    try {
      await api('/grades', {
        method: 'DELETE',
        body: JSON.stringify({ studentId, className, subjectId, trimester, month }),
      });
      const gradeIndex = month - 3;
      setRecords((current) => current.map((record) => record.studentId === studentId && record.subjectId === subjectId
        ? { ...record, grades: record.grades.map((value, index) => index === gradeIndex ? null : value) as GradeRecord['grades'] }
        : record));
      setDrafts((current) => {
        const next = { ...current };
        delete next[`${studentId}:${month}`];
        return next;
      });
      setError('');
      setNotice('Nota excluída.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  if (isStudent) {
    const ownRecords = records.filter((record) => subjectById.has(record.subjectId));
    return <section className="space-y-6"><div><p className="text-sm font-bold text-flow-700">Acompanhamento acadêmico · {user.className}</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Boletim escolar</h1><p className="mt-1 text-sm text-slate-600">Notas oficiais lançadas pelos professores. A média e a situação aparecem quando as três notas do trimestre forem publicadas.</p></div>
      <label className="block max-w-sm"><span className="mb-2 block text-sm font-bold text-slate-700">Período</span><select value={trimester} onChange={(event) => setTrimester(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold">{terms.map((term, index) => <option key={term.label} value={index + 1}>{term.label}</option>)}</select></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {ownRecords.length === 0 ? <EmptyGrades /> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-4">Disciplina e professor</th>{currentTerm.months.map((month) => <th key={month} className="px-3 py-4 text-center">{month}</th>)}<th className="px-3 py-4 text-center">Média trimestral</th><th className="px-4 py-4 text-center">Situação</th></tr></thead><tbody className="divide-y divide-slate-100">{ownRecords.map((record) => {
        const subject = subjectById.get(record.subjectId)!;
        const teachers = teachersForSubject(user.className ?? SCHOOL_CLASSES[0], record.subjectId, schedules, scheduleEdits);
        return <GradeRow key={record.subjectId} record={record} months={currentTerm.months} trimester={trimester} subjectName={subject.name} teacherName={teachers.join(', ') || subject.teacher} />;
      })}</tbody></table></div>}
    </section>;
  }

  const selectedSubject = subjectById.get(subjectId)!;
  const teachers = teachersForSubject(className as SchoolClass, subjectId, schedules, scheduleEdits);
  const responsibleTeachers = teachers.join(', ') || selectedSubject.teacher;
  const recordsByStudent = new Map(records.filter((record) => record.subjectId === subjectId).map((record) => [record.studentId, record]));
  return <section className="space-y-6"><div><p className="text-sm font-bold text-flow-700">{isTeacher ? 'Área do professor' : 'Consulta administrativa'}</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Boletim escolar</h1><p className="mt-1 text-sm text-slate-600">{isTeacher ? 'Edite as notas mensais e salve as alterações antes de sair da página.' : 'Consulte os registros acadêmicos por turma e disciplina.'}</p></div>
    <div className="grid gap-4 md:grid-cols-3">
      <label><span className="mb-2 block text-sm font-bold text-slate-700">Turma</span><select value={className} onChange={(event) => { if (!confirmDiscardDrafts()) return; setDrafts({}); setClassName(event.target.value); setStudents([]); setRecords([]); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold">{SCHOOL_CLASSES.map((schoolClass) => <option key={schoolClass}>{schoolClass}</option>)}</select></label>
      <label><span className="mb-2 block text-sm font-bold text-slate-700">Disciplina</span><select value={subjectId} onChange={(event) => { if (!confirmDiscardDrafts()) return; setDrafts({}); setSubjectId(event.target.value); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold">{SUBJECTS.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      <label><span className="mb-2 block text-sm font-bold text-slate-700">Período</span><select value={trimester} onChange={(event) => { if (!confirmDiscardDrafts()) return; setDrafts({}); setTrimester(Number(event.target.value)); }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold">{terms.map((term, index) => <option key={term.label} value={index + 1}>{term.label}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {students.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><GraduationCap className="mx-auto size-9 text-slate-400" /><h2 className="mt-3 font-black text-slate-800">Nenhum estudante cadastrado</h2><p className="mt-2 text-sm text-slate-600">Os estudantes desta turma aparecerão aqui após criarem suas contas.</p></div> :
      <>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600"><span className="font-bold text-slate-800">{selectedSubject.name}</span> · Professor responsável: {responsibleTeachers}</p>
          {isTeacher && <button type="button" disabled={saving || Object.keys(drafts).length === 0} onClick={() => void saveDrafts()} className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950 disabled:cursor-not-allowed disabled:opacity-50"><Save className="size-4" />{saving ? 'Salvando…' : `Salvar notas${Object.keys(drafts).length ? ` (${Object.keys(drafts).length})` : ''}`}</button>}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-4">Estudante</th>{currentTerm.months.map((month) => <th key={month} className="px-3 py-4 text-center">{month}</th>)}<th className="px-3 py-4 text-center">Média</th><th className="px-4 py-4 text-center">Situação</th></tr></thead><tbody className="divide-y divide-slate-100">{students.map((student) => {
          const record = recordsByStudent.get(student.id);
          const values = currentTerm.months.map((_, monthIndex) => record?.grades[(trimester - 1) * 3 + monthIndex] ?? null);
          const complete = values.every((value) => value !== null);
          const average = complete ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3 : null;
          return <tr key={`${className}-${subjectId}-${trimester}-${student.id}`}><td className="px-4 py-3 font-bold text-slate-800">{student.name}</td>{values.map((value, monthIndex) => {
            const month = (trimester - 1) * 3 + monthIndex + 3;
            const key = `${student.id}:${month}`;
            const draft = drafts[key];
            return <td key={month} className="px-3 py-3 text-center">{isTeacher
              ? <div className="flex items-center justify-center gap-1"><input aria-label={`${currentTerm.months[monthIndex]} · ${student.name}`} type="number" min="0" max="10" step="0.1" value={draft?.value ?? (value === null ? '' : String(value))} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { studentId: student.id, className, subjectId, trimester, month, value: event.target.value } }))} className="w-20 rounded-lg border border-slate-200 px-2 py-2 text-center outline-none focus:border-flow-500 focus:ring-2 focus:ring-flow-100" />{value !== null && <button type="button" onClick={() => void deleteGrade(student.id, month, student.name)} aria-label={`Excluir nota de ${currentTerm.months[monthIndex]} de ${student.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="size-4" /></button>}</div>
              : <span className="font-semibold">{value === null ? '—' : formatGrade(value)}</span>}</td>;
          })}<td className="px-3 py-3 text-center font-black">{average === null ? '—' : formatGrade(average)}</td><td className="px-4 py-3 text-center">{average === null ? <span className="text-xs text-slate-400">Incompleto</span> : <Status average={average} />}</td></tr>;
        })}</tbody></table></div>
      </>}
  </section>;
}

function GradeRow({ record, months, trimester, subjectName, teacherName }: { record: GradeRecord; months: string[]; trimester: number; subjectName: string; teacherName: string }) {
  const values = months.map((_, index) => record.grades[(trimester - 1) * 3 + index]);
  const complete = values.every((value) => value !== null);
  const average = complete ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 3 : null;
  return <tr><td className="px-4 py-3"><p className="font-bold text-slate-800">{subjectName}</p><p className="mt-1 text-xs text-slate-500">{teacherName}</p></td>{values.map((value, index) => <td key={index} className="px-3 py-3 text-center font-semibold">{value === null ? '—' : formatGrade(value)}</td>)}<td className="px-3 py-3 text-center font-black">{average === null ? '—' : formatGrade(average)}</td><td className="px-4 py-3 text-center">{average === null ? <span className="text-xs text-slate-400">Incompleto</span> : <Status average={average} />}</td></tr>;
}

function Status({ average }: { average: number }) {
  return average >= 6
    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700"><CheckCircle2 className="size-4" />Aprovado</span>
    : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">Em acompanhamento</span>;
}

function EmptyGrades() {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><GraduationCap className="mx-auto size-9 text-slate-400" /><h2 className="mt-3 font-black text-slate-800">Boletim ainda sem notas</h2><p className="mt-2 text-sm text-slate-600">As notas serão exibidas aqui após serem lançadas pelos professores.</p></div>;
}
