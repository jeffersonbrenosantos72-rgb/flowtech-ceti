import test from 'node:test';
import assert from 'node:assert/strict';
import {
  academicRiskCount,
  academicStatus,
  attendance,
  average,
  currentSchoolDay,
  finalAverage,
  gradeNeededInFourthBimester,
} from './academic.ts';
import { SCHEDULES_BY_CLASS, SUBJECTS, TRANSPORT_ROUTES } from '../data/mockData.ts';
import { SCHOOL_CLASSES } from '../data/school.ts';
import { roleLabel } from './roleLabel.ts';
import { applyScheduleEdits, copySchedules, teachersForSubject } from './schedule.ts';

test('exibe o perfil conforme o gênero informado ou usa forma inclusiva', () => {
  assert.equal(roleLabel('student', 'male'), 'Aluno');
  assert.equal(roleLabel('student', 'female'), 'Aluna');
  assert.equal(roleLabel('teacher', 'female'), 'Professora');
  assert.equal(roleLabel('manager', 'male'), 'Gestor escolar');
  assert.equal(roleLabel('manager', 'female'), 'Gestora escolar');
  assert.equal(roleLabel('employee', 'female'), 'Funcionária');
  assert.equal(roleLabel('employee', 'unspecified'), 'Funcionário(a)');
  assert.equal(roleLabel('teacher', 'unspecified'), 'Professor(a)');
  assert.equal(roleLabel('manager', null), 'Gestor(a) escolar');
});

test('calcula média com uma casa decimal e limita notas inválidas', () => {
  assert.equal(average([8.1, 8.2, 8.8]), 8.4);
  assert.equal(average([12, -1]), 5);
});

test('projeta a nota mínima do 4º bimestre para a meta institucional de 7,0', () => {
  const subject = { ...SUBJECTS[0]!, grades: [6, 7, 8] as const };
  assert.equal(gradeNeededInFourthBimester(subject), 7);
  assert.equal(finalAverage(subject, 7), 7);
  assert.equal(academicRiskCount(SUBJECTS), 0);
});

test('classifica aprovação, alerta e risco pela média final', () => {
  assert.equal(academicStatus(7), 'Aprovado');
  assert.equal(academicStatus(5), 'Em Alerta');
  assert.equal(academicStatus(4.9), 'Em Risco');
});

test('mantém a frequência de demonstração em 96,8%', () => {
  assert.equal(attendance(SUBJECTS), 96.8);
});

test('identifica o dia letivo atual', () => {
  assert.equal(currentSchoolDay(new Date('2026-11-02T12:00:00')), 'Segunda-feira');
});

test('disponibiliza aulas e professores para cada turma em todos os dias úteis', () => {
  assert.deepEqual(Object.keys(SCHEDULES_BY_CLASS).sort(), [...SCHOOL_CLASSES].sort());
  for (const schoolClass of SCHOOL_CLASSES) {
    for (const lessons of Object.values(SCHEDULES_BY_CLASS[schoolClass])) {
      assert.ok(lessons.length > 0, `${schoolClass} precisa de aulas em cada dia`);
      assert.ok(lessons.every((lesson) => lesson.subject.length > 0 && lesson.teacher.length > 0));
    }
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(SCHEDULES_BY_CLASS['3º ano Desenvolvimento de Sistemas'])
      .map(([weekday, lessons]) => [weekday, lessons.length])),
    { 'Segunda-feira': 5, 'Terça-feira': 5, 'Quarta-feira': 6, 'Quinta-feira': 5, 'Sexta-feira': 6 },
  );
  assert.ok(Object.values(SCHEDULES_BY_CLASS['3º ano Desenvolvimento de Sistemas'])
    .flat().every(({ time, subject, teacher }) => time && !/^[-—–]+$/.test(time) && subject && teacher));
  assert.ok(SCHEDULES_BY_CLASS['3º ano Informática']['Segunda-feira'].some(({ subject }) => subject === 'Programação Web'));
});

test('mantém o professor do boletim sincronizado com a grade da turma', () => {
  const edit = {
    className: '3º ano Informática',
    weekday: 'Segunda-feira',
    period: 3,
    subject: 'Matemática',
    teacher: 'Professora Nova',
    time: '',
  } as const;
  const schedules = applyScheduleEdits([edit]);
  assert.deepEqual(teachersForSubject(edit.className, 'matematica', schedules, [edit]), ['Professora Nova']);
  assert.deepEqual(teachersForSubject('2º ano Marketing', 'portugues', copySchedules(), []), ['Miriam']);
});

test('mantém três rotas PNATE, chegada unificada e dez paradas na rota 1', () => {
  assert.equal(TRANSPORT_ROUTES.length, 3);
  assert.ok(TRANSPORT_ROUTES.every((route) => route.arrival === '06:50'));
  assert.equal(TRANSPORT_ROUTES[0]!.stops.length, 10);
  assert.equal(TRANSPORT_ROUTES[0]!.stops[0]!.place, 'Baixão do Bonito');
  assert.equal(TRANSPORT_ROUTES[0]!.stops[9]!.place, "Olho D'Água do Meio");
});
