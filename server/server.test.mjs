import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHOOL_CLASSES } from '../shared/classes.mjs';
import { TRANSPORT_ROUTES } from '../src/data/mockData.ts';
import test, { after, before } from 'node:test';

let directory;
let port;
let child;
let baseUrl;

async function availablePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port.');
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startServer() {
  port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), FLOWTECH_DB_PATH: join(directory, 'test.sqlite') },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Test API did not become ready.');
}

async function request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

async function register(email, role, extra = {}) {
  const body = {
    name: email.split('@')[0],
    email,
    password: 'strong-test-password',
    role,
    gender: 'male',
    ...(role === 'student' ? { guardianPhone: '89999990000', studentPhone: '89999990001' } : {}),
    ...extra,
  };
  const { response, payload } = await request('/auth/register', {
    method: 'POST',
    body,
  });
  assert.equal(response.status, 201);
  return { user: payload.user, cookie: response.headers.get('set-cookie').split(';')[0].trim() };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'flowtech-test-'));
  const legacyDatabase = new DatabaseSync(join(directory, 'test.sqlite'));
  legacyDatabase.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher','manager')),
      class_name TEXT, guardian_phone TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE grades (
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL, trimester INTEGER NOT NULL CHECK(trimester BETWEEN 1 AND 3),
      month INTEGER NOT NULL, grade REAL NOT NULL CHECK(grade BETWEEN 0 AND 10),
      updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL,
      PRIMARY KEY(student_id, subject_id, trimester, month)
    );
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL
    );
  `);
  legacyDatabase.prepare(`INSERT INTO users(id,name,email,password_hash,role,created_at)
    VALUES(?,?,?,?,?,?)`).run('schedule-migration-user', 'Conta de migração', 'schedule-migration@example.com', 'unused', 'teacher', new Date().toISOString());
  legacyDatabase.prepare('INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?)')
    .run('schedules', JSON.stringify([{
      className: '3º ano Desenvolvimento de Sistemas',
      weekday: 'Segunda-feira',
      period: 9,
      subject: '---',
      teacher: '---',
      time: '---',
    }]), 'schedule-migration-user', new Date().toISOString());
  legacyDatabase.close();
  await startServer();
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('development accepts loopback-origin registration and guardian code routes are removed', async () => {
  const registration = await request('/auth/register', {
    method: 'POST',
    headers: { Origin: 'http://localhost:3001' },
    body: { name: 'Professor Local', email: 'local-origin@example.com', password: 'strong-test-password', role: 'teacher' },
  });
  assert.equal(registration.response.status, 201);
  const registeredUser = registration.payload.user;
  assert.equal(registeredUser.gender, 'unspecified');
  const removedEndpoint = await request('/auth/guardian-verification/start', {
    method: 'POST',
    body: { phone: '89999992222' },
  });
  assert.equal(removedEndpoint.response.ok, false);
});

test('registration stores an optional gender and returns it with the profile', async () => {
  const account = await register('professora@example.com', 'teacher', { gender: 'female' });
  assert.equal(account.user.gender, 'female');
  const session = await request('/session', { cookie: account.cookie });
  assert.equal(session.payload.user.gender, 'female');
});

test('registration accepts passwords up to 30 characters and rejects longer passwords', async () => {
  const maximumLengthPassword = 'a'.repeat(30);
  const accepted = await request('/auth/register', {
    method: 'POST',
    body: {
      name: 'Senha Limite',
      email: 'password-limit@example.com',
      password: maximumLengthPassword,
      role: 'teacher',
    },
  });
  assert.equal(accepted.response.status, 201);

  const rejected = await request('/auth/register', {
    method: 'POST',
    body: {
      name: 'Senha Longa',
      email: 'password-too-long@example.com',
      password: 'a'.repeat(31),
      role: 'teacher',
    },
  });
  assert.equal(rejected.response.status, 400);
});

test('development allows multiple users on one local network and invalid forms do not consume registration capacity', async () => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const invalid = await request('/auth/register', {
      method: 'POST',
      body: { name: 'Inválido', email: `invalid-${attempt}@example.com`, password: 'short', role: 'teacher' },
    });
    assert.equal(invalid.response.status, 400);
  }
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const registration = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Conta local ${attempt}`,
        email: `local-${attempt}@example.com`,
        password: 'strong-test-password',
        role: 'teacher',
      },
    });
    assert.equal(registration.response.status, 201);
  }
});

test('employees can view academic sections and edit transport and their own notices without grade write access', async () => {
  const employee = await register('employee@example.com', 'employee');
  const teacher = await register('employee-test-teacher@example.com', 'teacher');

  assert.equal((await request('/schedules', { cookie: employee.cookie })).response.status, 200);
  assert.equal((await request('/grades?className=' + encodeURIComponent('3º ano Informática'), {
    cookie: employee.cookie,
  })).response.status, 200);
  assert.equal((await request('/students?className=' + encodeURIComponent('3º ano Informática'), {
    cookie: employee.cookie,
  })).response.status, 200);
  assert.equal((await request('/menu', { cookie: employee.cookie })).response.status, 200);
  assert.equal((await request('/menu', {
    method: 'PUT',
    cookie: employee.cookie,
    body: { value: [] },
  })).response.status, 403);
  assert.equal((await request('/grades', {
    method: 'PUT',
    cookie: employee.cookie,
    body: { studentId: 'missing', className: '3º ano Informática', subjectId: 'portugues', trimester: 1, month: 3, grade: 9 },
  })).response.status, 403);
  assert.equal((await request('/grades', {
    method: 'DELETE',
    cookie: employee.cookie,
    body: { studentId: 'missing', className: '3º ano Informática', subjectId: 'portugues', trimester: 1, month: 3 },
  })).response.status, 403);
  assert.equal((await request('/guardians', { cookie: employee.cookie })).response.status, 403);

  const routes = await request('/routes', { cookie: employee.cookie });
  assert.equal(routes.response.status, 200);
  assert.equal((await request('/routes', {
    method: 'PUT',
    cookie: employee.cookie,
    body: { value: TRANSPORT_ROUTES },
  })).response.status, 200);

  const notice = await request('/announcements', {
    method: 'POST',
    cookie: employee.cookie,
    body: { className: '3º ano Informática', title: 'Aviso do funcionário', body: 'Comunicado autorizado.' },
  });
  assert.equal(notice.response.status, 201);
  const announcement = (await request('/announcements', { cookie: employee.cookie }))
    .payload.announcements.find(({ authorId }) => authorId === employee.user.id);
  assert.ok(announcement);
  assert.equal((await request(`/announcements/${announcement.id}`, {
    method: 'PUT',
    cookie: employee.cookie,
    body: { className: '3º ano Informática', title: 'Aviso atualizado', body: 'Alteração do próprio aviso.' },
  })).response.status, 200);
  assert.equal((await request(`/announcements/${announcement.id}`, {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { className: '3º ano Informática', title: 'Edição alheia', body: 'Não autorizada.' },
  })).response.status, 404);

  const calendarPost = await request('/calendar', {
    method: 'POST',
    cookie: employee.cookie,
    body: { title: 'Evento do funcionário', date: '2026-12-01', description: 'Comunicado autorizado.' },
  });
  assert.equal(calendarPost.response.status, 201);
  const calendarEvent = (await request('/calendar', { cookie: employee.cookie }))
    .payload.events.find(({ authorId }) => authorId === employee.user.id);
  assert.ok(calendarEvent);
  assert.equal((await request(`/announcements/${announcement.id}`, {
    method: 'DELETE',
    cookie: employee.cookie,
  })).response.status, 200);
  assert.equal((await request(`/calendar/${calendarEvent.id}`, {
    method: 'DELETE',
    cookie: employee.cookie,
  })).response.status, 200);
});

test('managers can update a schedule subject, time, and responsible teacher', async () => {
  const manager = await register('schedule-manager@example.com', 'manager');
  const employee = await register('schedule-employee@example.com', 'employee');
  const scheduleEdit = {
    className: '3º ano Informática',
    weekday: 'Segunda-feira',
    period: 1,
    subject: 'Projeto escolar',
    time: '08:00–08:50',
    teacher: 'Professora Exemplo',
    category: 'Recomposição/Eletiva',
  };
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: employee.cookie,
    body: { value: [scheduleEdit] },
  })).response.status, 403);
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [scheduleEdit] },
  })).response.status, 200);
  const schedules = await request('/schedules', { cookie: manager.cookie });
  assert.deepEqual(schedules.payload.value, [scheduleEdit]);
  const invalidCategory = await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [{ ...scheduleEdit, category: 'Categoria inválida' }] },
  });
  assert.equal(invalidCategory.response.status, 400);

  const invalidEdit = { ...scheduleEdit };
  delete invalidEdit.teacher;
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [invalidEdit] },
  })).response.status, 400);
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [] },
  })).response.status, 200);
});

test('accounts are persistent and roles restrict student records and parent contacts', async () => {
  const classCatalog = await request('/classes');
  assert.deepEqual(classCatalog.payload.classes, SCHOOL_CLASSES);
  const classA = '3º ano Informática';
  const student = await register('aluno@example.com', 'student', {
    className: classA,
    guardianPhone: '89999990000',
    studentPhone: '89999990001',
  });
  const otherStudent = await register('outro@example.com', 'student', {
    className: '2º ano Marketing',
    guardianPhone: '89999991111',
    studentPhone: '89999991112',
  });
  const teacher = await register('professor@example.com', 'teacher');
  const secondTeacher = await register('professor2@example.com', 'teacher');

  assert.equal((await request('/students?className=' + encodeURIComponent(classA), { cookie: student.cookie })).response.status, 403);
  assert.equal((await request('/guardians', { cookie: student.cookie })).response.status, 403);
  assert.deepEqual((await request('/grades', { cookie: student.cookie })).payload.records, []);
  assert.deepEqual((await request('/students?className=' + encodeURIComponent(classA), { cookie: teacher.cookie })).payload.students.map(({ id }) => id), [student.user.id]);

  const denied = await request('/grades', {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { studentId: student.user.id, className: '2º ano Marketing', subjectId: 'portugues', trimester: 1, month: 3, grade: 8 },
  });
  assert.equal(denied.response.status, 403);
  assert.equal((await request('/grades', {
    method: 'PUT',
    cookie: teacher.cookie,
    headers: { Origin: 'https://attacker.example' },
    body: { studentId: student.user.id, className: classA, subjectId: 'portugues', trimester: 1, month: 3, grade: 8 },
  })).response.status, 403);
  const saved = await request('/grades', {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { studentId: student.user.id, className: classA, subjectId: 'portugues', trimester: 2, month: 6, grade: 8.5 },
  });
  assert.equal(saved.response.status, 200);
  const ownGrades = await request('/grades', { cookie: student.cookie });
  assert.equal(ownGrades.payload.records[0].grades[3], 8.5);
  assert.equal((await request('/grades', {
    method: 'DELETE',
    cookie: secondTeacher.cookie,
    body: { studentId: student.user.id, className: classA, subjectId: 'portugues', trimester: 2, month: 6 },
  })).response.status, 200);
  assert.equal((await request('/grades', { cookie: student.cookie })).payload.records.length, 0);

  const { response: deniedCalendar } = await request('/calendar', {
    method: 'POST',
    cookie: student.cookie,
    body: { title: 'Evento', date: '2026-11-20', description: 'Orientações' },
  });
  assert.equal(deniedCalendar.status, 403);
  const classNotice = await request('/announcements', {
    method: 'POST',
    cookie: teacher.cookie,
    body: { className: classA, title: 'Aviso da turma', body: 'Conteúdo restrito à turma.' },
  });
  assert.equal(classNotice.response.status, 201);
  const firstClassNotices = await request('/announcements', { cookie: student.cookie });
  const notice = firstClassNotices.payload.announcements.find(({ authorId }) => authorId === teacher.user.id);
  assert.ok(notice);
  assert.equal(notice.authorId, teacher.user.id);
  assert.equal(notice.authorName, teacher.user.name);
  assert.equal((await request(`/announcements/${notice.id}`, {
    method: 'PUT',
    cookie: secondTeacher.cookie,
    body: { className: classA, title: 'Sem autorização', body: 'Não pode editar.' },
  })).response.status, 404);
  const updatedNotice = await request(`/announcements/${notice.id}`, {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { className: '2º ano Marketing', title: 'Aviso atualizado', body: 'Mensagem atualizada.' },
  });
  assert.equal(updatedNotice.response.status, 200);
  assert.equal((await request('/announcements', { cookie: student.cookie })).payload.announcements
    .some(({ authorId }) => authorId === teacher.user.id), false);
  assert.equal((await request('/announcements', { cookie: otherStudent.cookie })).payload.announcements
    .some(({ id, title }) => id === notice.id && title === 'Aviso atualizado'), true);
  assert.equal((await request(`/announcements/${notice.id}`, { method: 'DELETE', cookie: secondTeacher.cookie })).response.status, 404);
  assert.equal((await request(`/announcements/${notice.id}`, { method: 'DELETE', cookie: teacher.cookie })).response.status, 200);
  const secondClassNotices = await request('/announcements', { cookie: otherStudent.cookie });
  assert.equal(secondClassNotices.payload.announcements.length, 0);

  const calendarPost = await request('/calendar', {
    method: 'POST',
    cookie: teacher.cookie,
    body: { title: 'Comunicado geral', date: '2026-11-20', description: 'Para toda a comunidade.' },
  });
  assert.equal(calendarPost.response.status, 201);
  const event = (await request('/calendar', { cookie: teacher.cookie })).payload.events
    .find(({ authorId, title }) => authorId === teacher.user.id && title === 'Comunicado geral');
  assert.ok(event);
  const eventId = event.id;
  assert.equal((await request('/calendar', { cookie: student.cookie })).payload.events
    .some(({ id }) => id === eventId), true);
  assert.equal((await request('/calendar', { cookie: otherStudent.cookie })).payload.events
    .some(({ id }) => id === eventId), true);
  const otherTeacherEdit = await request('/calendar/' + eventId, {
    method: 'PUT',
    cookie: secondTeacher.cookie,
    body: { title: 'Edição não autorizada', date: '2026-11-21', description: 'Sem permissão.' },
  });
  assert.equal(otherTeacherEdit.response.status, 404);
  const manager = await register('calendar-manager@example.com', 'manager');
  assert.equal((await request('/calendar/' + eventId, {
    method: 'PUT',
    cookie: manager.cookie,
    body: { title: 'Edição de gestor não autorizada', date: '2026-11-21', description: 'Sem permissão.' },
  })).response.status, 404);
  const updateOwnEvent = await request('/calendar/' + eventId, {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { title: 'Comunicado atualizado', date: '2026-11-21', description: 'Atualizado para toda a comunidade.' },
  });
  assert.equal(updateOwnEvent.response.status, 200);
  assert.equal((await request('/calendar', { cookie: student.cookie })).payload.events
    .some(({ id, title }) => id === eventId && title === 'Comunicado atualizado'), true);
  const otherTeacherDelete = await request('/calendar/' + eventId, {
    method: 'DELETE',
    cookie: secondTeacher.cookie,
  });
  assert.equal(otherTeacherDelete.response.status, 404);
  const deleteOwnEvent = await request('/calendar/' + eventId, {
    method: 'DELETE',
    cookie: teacher.cookie,
  });
  assert.equal(deleteOwnEvent.response.status, 200);

  const guardianListDenied = await request('/guardians', { cookie: student.cookie });
  assert.equal(guardianListDenied.response.status, 403);
  const guardianList = await request('/guardians', { cookie: teacher.cookie });
  assert.equal(guardianList.payload.contacts.length, 2);
  assert.deepEqual(guardianList.payload.contacts.map(({ studentPhone, guardianPhone }) => [studentPhone, guardianPhone]), [
    ['+5589999991112', '+5589999991111'],
    ['+5589999990001', '+5589999990000'],
  ]);
  const managerContacts = await request('/guardians', { cookie: (await register('manager-contacts@example.com', 'manager')).cookie });
  assert.equal(managerContacts.payload.contacts.length, 2);
});

test('only managers can publish global settings and registration rejects invalid classes', async () => {
  const teacher = await register('teacher-two@example.com', 'teacher');
  const manager = await register('gestor@example.com', 'manager');
  const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
  const meals = [
      { name: 'Lanche', time: '10:00', description: 'Fruta', calories: 100, allergens: '—' },
      { name: 'Almoço', time: '12:00', description: 'Refeição', calories: 500, allergens: '—' },
      { name: 'Lanche da tarde', time: '15:00', description: 'Suco', calories: 150, allergens: '—' },
  ];
  const menu = ['1/3', '2/4'].flatMap((cycle) => weekdays.map((weekday) => ({ weekday, cycle, meals })));
  const teacherResult = await request('/menu', {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { value: menu },
  });

  assert.equal(teacherResult.response.status, 403);
  const managerResult = await request('/menu', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: menu },
  });
  assert.equal(managerResult.response.status, 200);
  assert.deepEqual((await request('/menu', { cookie: teacher.cookie })).payload.value, menu);

  const invalidStudent = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Aluno', email: 'invalid@example.com', password: 'strong-test-password', role: 'student', gender: 'male', className: 'Turma inventada', guardianPhone: '89999990000', studentPhone: '89999990001' },
  });
  assert.equal(invalidStudent.response.status, 400);
  const studentWithoutVerification = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Aluno', email: 'unverified@example.com', password: 'strong-test-password', role: 'student', gender: 'male', className: '3º ano Informática', guardianPhone: '89999990000', studentPhone: '89999990001' },
  });
  assert.equal(studentWithoutVerification.response.status, 201);
  const missingStudentPhone = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Aluno', email: 'without-phone@example.com', password: 'strong-test-password', role: 'student', className: '3º ano Informática', guardianPhone: '89999990000' },
  });
  assert.equal(missingStudentPhone.response.status, 400);
  const invalidGender = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Professor', email: 'invalid-gender@example.com', password: 'strong-test-password', role: 'teacher', gender: 'unknown' },
  });
  assert.equal(invalidGender.response.status, 400);
});

test('only managers can edit existing schedule lessons and changes are shared across roles', async () => {
  const teacher = await register('schedule-teacher@example.com', 'teacher');
  const manager = await register('schedule-manager-existing@example.com', 'manager');
  const student = await register('schedule-student@example.com', 'student', {
    className: '3º ano Informática',
  });
  const initial = await request('/schedules', { cookie: teacher.cookie });
  assert.deepEqual(initial.payload.value, []);

  const edit = {
    className: '3º ano Informática',
    weekday: 'Segunda-feira',
    period: 1,
    subject: 'Matemática',
    time: '07:30–08:15',
    teacher: 'Professor Exemplo',
  };
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { value: [edit] },
  })).response.status, 403);
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: student.cookie,
    body: { value: [edit] },
  })).response.status, 403);
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [{ ...edit, period: 6 }] },
  })).response.status, 400);
  assert.equal((await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [{ ...edit, room: 'Sala 01' }] },
  })).response.status, 400);

  const saved = await request('/schedules', {
    method: 'PUT',
    cookie: manager.cookie,
    body: { value: [edit] },
  });
  assert.equal(saved.response.status, 200);
  assert.deepEqual((await request('/schedules', { cookie: teacher.cookie })).payload.value, [edit]);
  assert.deepEqual((await request('/schedules', { cookie: student.cookie })).payload.value, [edit]);
});

test('profile changes persist and account deletion removes authored notices but retains grades', async () => {
  const className = '3º ano Informática';
  const student = await register('profile-student@example.com', 'student', { className, guardianPhone: '89999992222' });
  const teacher = await register('profile-teacher@example.com', 'teacher');
  const manager = await register('profile-manager@example.com', 'manager');
  const photo = 'data:image/png;base64,AAAA';
  const updatedProfile = await request('/profile', {
    method: 'PATCH',
    cookie: teacher.cookie,
    body: { name: 'Professora Atualizada', profilePhoto: photo },
  });
  assert.equal(updatedProfile.response.status, 200);
  assert.equal(updatedProfile.payload.user.name, 'Professora Atualizada');
  assert.equal(updatedProfile.payload.user.profilePhoto, photo);
  assert.equal((await request('/session', { cookie: teacher.cookie })).payload.user.name, 'Professora Atualizada');
  assert.equal((await request('/profile', {
    method: 'PATCH',
    cookie: student.cookie,
    body: { name: 'Nome Atualizado', profilePhoto: null },
  })).payload.user.name, 'Nome Atualizado');

  assert.equal((await request('/grades', {
    method: 'PUT',
    cookie: teacher.cookie,
    body: { studentId: student.user.id, className, subjectId: 'portugues', trimester: 1, month: 3, grade: 9 },
  })).response.status, 200);
  assert.equal((await request('/announcements', {
    method: 'POST', cookie: teacher.cookie,
    body: { className, title: 'Aviso do professor', body: 'Será removido ao excluir a conta.' },
  })).response.status, 201);
  assert.equal((await request('/calendar', {
    method: 'POST', cookie: teacher.cookie,
    body: { title: 'Evento do professor', date: '2026-11-20', description: 'Será removido com a conta.' },
  })).response.status, 201);
  const notice = (await request('/announcements', { cookie: manager.cookie })).payload.announcements
    .find(({ authorId }) => authorId === teacher.user.id);
  assert.ok(notice);
  const managerEdit = await request(`/announcements/${notice.id}`, {
    method: 'PUT', cookie: manager.cookie,
    body: { className, title: 'Edição não autorizada', body: 'Somente o autor pode editar.' },
  });
  assert.equal(managerEdit.response.status, 404);

  const deletion = await request('/profile/account', { method: 'DELETE', cookie: teacher.cookie });
  assert.equal(deletion.response.status, 200);
  assert.match(deletion.response.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await request('/session', { cookie: teacher.cookie })).payload.user, null);
  assert.equal((await request('/announcements', { cookie: manager.cookie })).payload.announcements
    .some(({ authorId }) => authorId === teacher.user.id), false);
  assert.equal((await request('/calendar', { cookie: manager.cookie })).payload.events
    .some(({ authorId }) => authorId === teacher.user.id), false);
  const grades = await request('/grades', { cookie: student.cookie });
  assert.equal(grades.payload.records[0].grades[0], 9);
});
