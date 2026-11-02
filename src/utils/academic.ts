import type { Subject, Weekday } from '../types/index.ts';

export const APPROVAL_TARGET = 7;

export type AcademicStatus = 'Aprovado' | 'Em Alerta' | 'Em Risco';

export function clampGrade(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(0, value)) : 0;
}

export function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return round1(values.reduce((sum, value) => sum + clampGrade(value), 0) / values.length);
}

export function currentAverage(subject: Subject): number {
  return average(subject.grades);
}

export function finalAverage(subject: Subject, fourthGrade: number): number {
  return average([...subject.grades, fourthGrade]);
}

/** Nota mínima no 4º bimestre para chegar à média anual configurada. */
export function gradeNeededInFourthBimester(subject: Subject, target = APPROVAL_TARGET): number {
  const totalPublished = subject.grades.reduce((sum, grade) => sum + clampGrade(grade), 0);
  return round1(Math.max(0, target * 4 - totalPublished));
}

export function canReachTarget(subject: Subject, target = APPROVAL_TARGET): boolean {
  return gradeNeededInFourthBimester(subject, target) <= 10;
}

export function academicStatus(averageValue: number): AcademicStatus {
  if (averageValue >= APPROVAL_TARGET) return 'Aprovado';
  if (averageValue >= 5) return 'Em Alerta';
  return 'Em Risco';
}

export function overallAverage(subjects: readonly Subject[]): number {
  return average(subjects.map(currentAverage));
}

export function attendance(subjects: readonly Subject[]): number {
  const totalClasses = subjects.reduce((sum, subject) => sum + subject.totalClasses, 0);
  const absences = subjects.reduce((sum, subject) => sum + subject.absences, 0);
  return totalClasses === 0 ? 100 : round1(((totalClasses - absences) / totalClasses) * 100);
}

export function academicRiskCount(subjects: readonly Subject[]): number {
  return subjects.filter((subject) => !canReachTarget(subject)).length;
}

export function formatGrade(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

export function currentSchoolDay(date = new Date()): Weekday {
  const names: Partial<Record<number, Weekday>> = {
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
  };
  return names[date.getDay()] ?? 'Segunda-feira';
}
