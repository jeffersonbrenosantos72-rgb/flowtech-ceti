import { SCHOOL_CLASSES, type SchoolClass } from '../data/school.ts';
import { SCHEDULES_BY_CLASS, SUBJECTS } from '../data/mockData.ts';
import type { ScheduleLesson, Weekday } from '../types/index.ts';

const weekdays = Object.keys(SCHEDULES_BY_CLASS[SCHOOL_CLASSES[0]]) as Weekday[];

export type ScheduleEdit = {
  className: SchoolClass;
  weekday: Weekday;
  period: number;
  subject: string;
  teacher?: string;
  time: string;
  category?: ScheduleLesson['category'];
};

export type EditableSchedules = Record<SchoolClass, Record<Weekday, ScheduleLesson[]>>;

const subjectAliases: Partial<Record<string, readonly string[]>> = {
  portugues: ['Português'],
  matematica: ['Matemática'],
  'ed-fisica': ['Educação Física'],
  banco: ['Modelagem de Banco de Dados'],
  redes: ['Redes'],
  integrador: ['Projeto Integrador'],
  'recomp-port': ['Recomposição de Português', 'Português'],
  'recomp-mat': ['Recomposição de Matemática', 'Matemática'],
};

function normalizeSubject(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
}

function uniqueNames(names: string[]) {
  return [...new Set(names.filter(Boolean))];
}

export function copySchedules(): EditableSchedules {
  return Object.fromEntries(SCHOOL_CLASSES.map((schoolClass) => [
    schoolClass,
    Object.fromEntries(weekdays.map((weekday) => [
      weekday,
      SCHEDULES_BY_CLASS[schoolClass][weekday].map((lesson) => ({ ...lesson })),
    ])),
  ])) as EditableSchedules;
}

export function applyScheduleEdits(edits: ScheduleEdit[]): EditableSchedules {
  const schedules = copySchedules();
  for (const edit of edits) {
    const lesson = schedules[edit.className][edit.weekday][edit.period - 1];
    if (!lesson) throw new Error('O servidor retornou uma alteração para uma aula inexistente.');
    schedules[edit.className][edit.weekday][edit.period - 1] = {
      ...lesson,
      subject: edit.subject,
      teacher: edit.teacher ?? lesson.teacher,
      time: edit.time,
      category: edit.category ?? lesson.category,
    };
  }
  return schedules;
}

export function teachersForSubject(
  className: SchoolClass,
  subjectId: string,
  schedules: EditableSchedules,
  edits: ScheduleEdit[],
): string[] {
  const subject = SUBJECTS.find(({ id }) => id === subjectId);
  if (!subject) return [];
  const aliases = new Set([subject.name, ...(subjectAliases[subjectId] ?? [])].map(normalizeSubject));
  const belongsToSubject = (name: string) => aliases.has(normalizeSubject(name));
  const editedTeachers = edits
    .filter((edit) => edit.className === className && belongsToSubject(edit.subject))
    .map((edit) => edit.teacher ?? '');
  if (editedTeachers.length > 0) return uniqueNames(editedTeachers);

  return uniqueNames(weekdays.flatMap((weekday) =>
    schedules[className][weekday]
      .filter((lesson) => belongsToSubject(lesson.subject))
      .map(({ teacher }) => teacher),
  ));
}
