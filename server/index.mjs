import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHOOL_CLASSES } from '../shared/classes.mjs';
import { SCHEDULE_LESSON_COUNTS, WEEKDAYS } from '../shared/schedule-layout.mjs';

const scrypt = promisify(scryptCallback);
const subjects = new Set([
  'portugues', 'matematica', 'historia', 'geografia', 'biologia', 'fisica', 'quimica',
  'filosofia', 'sociologia', 'ed-fisica', 'algoritmos', 'banco', 'frontend', 'backend',
  'engenharia', 'mobile', 'redes', 'integrador', 'recomp-port', 'recomp-mat', 'vida', 'eletiva',
]);
const trimesterMonths = { 1: [3, 4, 5], 2: [6, 7, 8], 3: [9, 10, 11] };
const maxBodyBytes = 1_000_000;
const sessionDays = 7;
const cookieName = 'flowtech_session';
const cookieSecure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const requestLimits = new Map();
const registrationLimit = process.env.NODE_ENV === 'production' ? 60 : 100;
const dbPath = resolve(process.env.FLOWTECH_DB_PATH ?? 'data/flowtech.sqlite');
mkdirSync(resolve(dbPath, '..'), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','teacher','manager','employee')),
    class_name TEXT, gender TEXT, guardian_phone TEXT, student_phone TEXT, guardian_verified_at TEXT, profile_photo TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS grades (
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL, trimester INTEGER NOT NULL CHECK(trimester BETWEEN 1 AND 3),
    month INTEGER NOT NULL, grade REAL NOT NULL CHECK(grade BETWEEN 0 AND 10),
    updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(student_id, subject_id, trimester, month)
  );
  CREATE TABLE IF NOT EXISTS class_announcements (
    id TEXT PRIMARY KEY, class_name TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendar_announcements (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function removeUpdatedByForeignKey(table, createSql, columns) {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
  if (!foreignKeys.some((key) => key.from === 'updated_by')) return;
  const temporary = `${table}_without_user_fk`;
  db.exec(`PRAGMA foreign_keys=OFF;
    BEGIN;
    ${createSql.replaceAll(table, temporary)};
    INSERT INTO ${temporary}(${columns}) SELECT ${columns} FROM ${table};
    DROP TABLE ${table};
    ALTER TABLE ${temporary} RENAME TO ${table};
    COMMIT;
    PRAGMA foreign_keys=ON;`);
}

const existingUserColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
if (!existingUserColumns.has('profile_photo')) db.exec('ALTER TABLE users ADD COLUMN profile_photo TEXT');
if (!existingUserColumns.has('guardian_verified_at')) db.exec('ALTER TABLE users ADD COLUMN guardian_verified_at TEXT');
if (!existingUserColumns.has('student_phone')) db.exec('ALTER TABLE users ADD COLUMN student_phone TEXT');
if (!existingUserColumns.has('gender')) db.exec('ALTER TABLE users ADD COLUMN gender TEXT');
db.exec('DROP TABLE IF EXISTS guardian_verifications');

const userTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql ?? '';
if (!userTableSql.includes("'employee'")) {
  db.exec(`PRAGMA foreign_keys=OFF;
    BEGIN;
    CREATE TABLE users_with_employee (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','teacher','manager','employee')),
      class_name TEXT, gender TEXT, guardian_phone TEXT, student_phone TEXT,
      guardian_verified_at TEXT, profile_photo TEXT, created_at TEXT NOT NULL
    );
    INSERT INTO users_with_employee(
      id,name,email,password_hash,role,class_name,gender,guardian_phone,student_phone,
      guardian_verified_at,profile_photo,created_at
    ) SELECT
      id,name,email,password_hash,role,class_name,gender,guardian_phone,student_phone,
      guardian_verified_at,profile_photo,created_at
    FROM users;
    DROP TABLE users;
    ALTER TABLE users_with_employee RENAME TO users;
    COMMIT;
    PRAGMA foreign_keys=ON;`);
}

removeUpdatedByForeignKey('grades', `CREATE TABLE grades (
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL, trimester INTEGER NOT NULL CHECK(trimester BETWEEN 1 AND 3),
  month INTEGER NOT NULL, grade REAL NOT NULL CHECK(grade BETWEEN 0 AND 10),
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(student_id, subject_id, trimester, month)
)`, 'student_id,subject_id,trimester,month,grade,updated_by,updated_at');
removeUpdatedByForeignKey('app_settings', `CREATE TABLE app_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`, 'key,value,updated_by,updated_at');

const json = (response, status, value, headers = {}) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
};
const now = () => new Date().toISOString();
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const cleanString = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const isValidClass = (value) => SCHOOL_CLASSES.includes(value);
const isSchedulePlaceholder = (edit) => edit?.className === '3º ano Desenvolvimento de Sistemas' &&
  ['subject', 'teacher', 'time'].every((field) => typeof edit[field] === 'string' && /^[-—–]+$/.test(edit[field].trim()));

function removeSchedulePlaceholders() {
  const setting = db.prepare('SELECT value FROM app_settings WHERE key=?').get('schedules');
  if (!setting) return;
  const schedules = JSON.parse(setting.value);
  if (!Array.isArray(schedules)) throw new Error('Os horários salvos não têm um formato válido.');
  const filtered = schedules.filter((edit) => !isSchedulePlaceholder(edit));
  if (filtered.length !== schedules.length) {
    db.prepare('UPDATE app_settings SET value=?,updated_at=? WHERE key=?')
      .run(JSON.stringify(filtered), now(), 'schedules');
  }
}

removeSchedulePlaceholders();

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    const key = part.slice(0, index).trim();
    try {
      return [key, decodeURIComponent(part.slice(index + 1).trim())];
    } catch {
      return [key, ''];
    }
  }).filter(([key]) => key));
}

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('A solicitação excede o limite permitido.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('O corpo da solicitação não contém JSON válido.'), { status: 400 });
  }
}

async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function passwordMatches(password, storedHash) {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(row) {
  return {
    id: row.id, name: row.name, email: row.email, role: row.role,
    gender: row.gender ?? null,
    className: row.class_name ?? null, profilePhoto: row.profile_photo ?? null,
  };
}

function userFromRequest(request) {
  const token = parseCookies(request.headers.cookie)[cookieName];
  if (!token) return null;
  const session = db.prepare(`
    SELECT users.*, sessions.token_hash FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), now());
  return session ?? null;
}

function requireRole(user, roles) {
  if (!user) throw Object.assign(new Error('Faça login para continuar.'), { status: 401 });
  if (!roles.includes(user.role)) throw Object.assign(new Error('Seu perfil não tem permissão para esta ação.'), { status: 403 });
}

function validateScheduleEdits(value) {
  if (!Array.isArray(value) || value.length > 400) {
    throw Object.assign(new Error('Informe alterações válidas para os horários existentes.'), { status: 400 });
  }
  const seen = new Set();
  return value.map((edit) => {
    const keys = edit && typeof edit === 'object' && !Array.isArray(edit) ? Object.keys(edit).sort() : [];
    const hasCategory = keys.includes('category');
    const expectedKeys = hasCategory
      ? 'category,className,period,subject,teacher,time,weekday'
      : 'className,period,subject,teacher,time,weekday';
    if (keys.join(',') !== expectedKeys) {
      throw Object.assign(new Error('Cada alteração deve indicar somente turma, dia, aula, disciplina, horário, professor e classificação.'), { status: 400 });
    }
    const { className, weekday, period, subject, teacher, time, category } = edit;
    const dayIndex = WEEKDAYS.indexOf(weekday);
    const key = `${className}:${weekday}:${period}`;
    if (!isValidClass(className) || dayIndex < 0 ||
        !Number.isInteger(period) || period < 1 ||
        period > SCHEDULE_LESSON_COUNTS[className][dayIndex] ||
        seen.has(key)) {
      throw Object.assign(new Error('A aula informada não existe ou foi repetida.'), { status: 400 });
    }
    const cleanSubject = cleanString(subject, 120);
    const cleanTeacher = cleanString(teacher, 120);
    const cleanTime = cleanString(time, 30);
    if (!cleanSubject || !cleanTeacher || typeof subject !== 'string' || typeof teacher !== 'string' ||
        typeof time !== 'string' || cleanSubject.length !== subject.trim().length ||
        cleanTeacher.length !== teacher.trim().length || cleanTime.length !== time.trim().length) {
      throw Object.assign(new Error('Informe disciplina, horário e professor válidos para cada aula.'), { status: 400 });
    }
    if (hasCategory && !['BNCC', 'Técnica', 'Recomposição/Eletiva'].includes(category)) {
      throw Object.assign(new Error('Selecione uma classificação curricular válida.'), { status: 400 });
    }
    seen.add(key);
    return {
      className, weekday, period, subject: cleanSubject, teacher: cleanTeacher, time: cleanTime,
      ...(hasCategory ? { category } : {}),
    };
  });
}

function requireSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  const host = request.headers.host;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const configuredOrigins = (process.env.FLOWTECH_ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  let developmentOrigin = false;
  if (process.env.NODE_ENV !== 'production') {
    try {
      const parsedOrigin = new URL(origin);
      developmentOrigin = parsedOrigin.origin === origin &&
        parsedOrigin.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
    } catch {
      developmentOrigin = false;
    }
  }
  if (origin !== `${protocol}://${host}` && !developmentOrigin && !configuredOrigins.includes(origin)) {
    throw Object.assign(new Error('Origem não autorizada.'), { status: 403 });
  }
}

function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDays * 86400000).toISOString();
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
    .run(hashToken(token), userId, expiresAt, now());
  return ` ${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDays * 86400}${cookieSecure}`;
}

function gradeList(studentId) {
  const rows = db.prepare('SELECT subject_id, month, grade FROM grades WHERE student_id=?').all(studentId);
  const grades = new Map();
  for (const row of rows) {
    const key = row.subject_id;
    const values = grades.get(key) ?? Array(9).fill(null);
    values[row.month - 3] = row.grade;
    grades.set(key, values);
  }
  return [...grades].map(([subjectId, values]) => ({ studentId, subjectId, grades: values }));
}

function storedSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : null;
}

function putSetting(key, value, userId) {
  db.prepare(`INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .run(key, JSON.stringify(value), userId, now());
}

function enforceRateLimit(request, action, limit, windowMs) {
  const key = `${action}:${request.socket.remoteAddress ?? 'unknown'}`;
  const currentTime = Date.now();
  if (requestLimits.size > 10000) {
    for (const [entry, value] of requestLimits) {
      if (value.resetAt <= currentTime) requestLimits.delete(entry);
    }
  }
  const current = requestLimits.get(key);
  if (!current || current.resetAt <= currentTime) {
    requestLimits.set(key, { count: 1, resetAt: currentTime + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw Object.assign(new Error('Muitas solicitações. Aguarde um pouco e tente novamente.'), { status: 429 });
  }
  current.count += 1;
}

function normalizeWhatsappPhone(value) {
  if (typeof value !== 'string') return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return `+${digits}`;
  return '';
}

function validSettings(key, value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return false;
  if (key === 'menu') {
    const menuKeys = value.map((day) => `${day?.cycle}:${day?.weekday}`);
    return value.length === 10 && new Set(menuKeys).size === 10 && value.every((day) => day && typeof day === 'object' &&
      ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'].includes(day.weekday) &&
      ['1/3', '2/4'].includes(day.cycle) && Array.isArray(day.meals) && day.meals.length === 3 &&
      day.meals.every((meal) => meal && typeof meal.name === 'string' && typeof meal.time === 'string' &&
        typeof meal.description === 'string' && Number.isFinite(meal.calories) && meal.calories >= 0 &&
        typeof meal.allergens === 'string'));
  }
  const routeIds = value.map((route) => route?.id);
  return value.length === 3 && new Set(routeIds).size === 3 && value.every((route) => route && typeof route === 'object' &&
    typeof route.id === 'string' && ['bus-1', 'bus-2', 'kombis'].includes(route.id) &&
    ['sheet', 'vehicle', 'service', 'start', 'arrival', 'driver', 'monitor'].every((keyName) => typeof route[keyName] === 'string') &&
    ['Em operação', 'Atenção'].includes(route.status) && Array.isArray(route.stops) && route.stops.length > 0 &&
    route.stops.every((stop) => stop && typeof stop.place === 'string' && typeof stop.time === 'string'));
}

function calendarFields(body) {
  const title = cleanString(body.title, 160);
  const description = cleanString(body.description, 10000);
  const date = body.date;
  const eventDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T12:00:00Z`)
    : null;
  if (title.length < 3 || description.length < 1 || !eventDate ||
      Number.isNaN(eventDate.getTime()) || eventDate.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('Informe título, data válida e descrição.'), { status: 400 });
  }
  return { title, description, date };
}

async function handle(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const path = url.pathname;
    const method = request.method ?? 'GET';
    const user = userFromRequest(request);
    if (method !== 'GET' && method !== 'HEAD') requireSameOrigin(request);

    if (path === '/api/health' && method === 'GET') return json(response, 200, { ok: true });
    if (path === '/api/classes' && method === 'GET') return json(response, 200, { classes: SCHOOL_CLASSES });
    if (path === '/api/schedules' && method === 'GET') {
      requireRole(user, ['student', 'teacher', 'manager', 'employee']);
      const setting = db.prepare('SELECT value FROM app_settings WHERE key=?').get('schedules');
      const value = setting ? JSON.parse(setting.value) : [];
      if (!Array.isArray(value)) throw Object.assign(new Error('Os horários salvos não têm um formato válido.'), { status: 500 });
      return json(response, 200, { value: value.filter((edit) => !isSchedulePlaceholder(edit)) });
    }
    if (path === '/api/session' && method === 'GET') {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
      if (!user) return json(response, 200, { user: null });
      return json(response, 200, { user: publicUser(user) });
    }

    if (path === '/api/auth/register' && method === 'POST') {
      const body = await readBody(request);
      const name = cleanString(body.name, 120);
      const email = cleanString(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      const role = body.role;
      const gender = body.gender === undefined ? 'unspecified' : body.gender;
      const className = body.className;
      const guardianPhone = cleanString(body.guardianPhone, 30);
      const studentPhone = cleanString(body.studentPhone, 30);
      const normalizedGuardianPhone = normalizeWhatsappPhone(guardianPhone);
      const normalizedStudentPhone = normalizeWhatsappPhone(studentPhone);
      if (name.length < 2) throw Object.assign(new Error('Informe seu nome completo.'), { status: 400 });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Informe um e-mail válido.'), { status: 400 });
      if (password.length < 10 || password.length > 30) throw Object.assign(new Error('A senha deve ter entre 10 e 30 caracteres.'), { status: 400 });
      if (!['student', 'teacher', 'manager', 'employee'].includes(role)) throw Object.assign(new Error('Selecione um tipo de conta válido.'), { status: 400 });
      if (!['male', 'female', 'unspecified'].includes(gender)) throw Object.assign(new Error('Selecione uma opção de gênero válida.'), { status: 400 });
      if (role === 'student' && !isValidClass(className)) throw Object.assign(new Error('Selecione uma das turmas oficiais.'), { status: 400 });
      if (role === 'student' && (!normalizedGuardianPhone || !normalizedStudentPhone)) {
        throw Object.assign(new Error('Informe WhatsApps válidos para o aluno e o responsável.'), { status: 400 });
      }
      enforceRateLimit(request, 'register', registrationLimit, 60 * 60 * 1000);
      const id = randomBytes(16).toString('hex');
      try {
        const passwordHashValue = await passwordHash(password);
        db.prepare(`INSERT INTO users(id,name,email,password_hash,role,gender,class_name,guardian_phone,student_phone,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, name, email, passwordHashValue, role, gender,
          role === 'student' ? className : null, role === 'student' ? normalizedGuardianPhone : null,
          role === 'student' ? normalizedStudentPhone : null, now());
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw Object.assign(new Error('Já existe uma conta com este e-mail.'), { status: 409 });
        throw error;
      }
      const created = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      return json(response, 201, { user: publicUser(created) }, { 'Set-Cookie': createSession(id) });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      enforceRateLimit(request, 'login', 10, 15 * 60 * 1000);
      const body = await readBody(request);
      const email = cleanString(body.email, 254).toLowerCase();
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length > 256) throw Object.assign(new Error('E-mail ou senha incorretos.'), { status: 401 });
      const account = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (!account || !(await passwordMatches(password, account.password_hash))) {
        throw Object.assign(new Error('E-mail ou senha incorretos.'), { status: 401 });
      }
      requestLimits.delete(`login:${request.socket.remoteAddress ?? 'unknown'}`);
      return json(response, 200, { user: publicUser(account) }, { 'Set-Cookie': createSession(account.id) });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = parseCookies(request.headers.cookie)[cookieName];
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
      return json(response, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecure}` });
    }

    if (!path.startsWith('/api/')) return serveStatic(path, response);
    requireRole(user, ['student', 'teacher', 'manager', 'employee']);

    if (path === '/api/schedules' && method === 'PUT') {
      requireRole(user, ['manager']);
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw Object.assign(new Error('Informe as alterações dos horários.'), { status: 400 });
      }
      const edits = validateScheduleEdits(body.value);
      db.prepare(`INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .run('schedules', JSON.stringify(edits), user.id, now());
      return json(response, 200, { ok: true });
    }

    if (path === '/api/profile' && method === 'PATCH') {
      const body = await readBody(request);
      const name = body.name === undefined ? user.name : cleanString(body.name, 120);
      const profilePhoto = body.profilePhoto === undefined ? user.profile_photo ?? null : body.profilePhoto;
      if (name.length < 2) throw Object.assign(new Error('O nome deve ter pelo menos dois caracteres.'), { status: 400 });
      if (profilePhoto !== null && (typeof profilePhoto !== 'string' ||
          profilePhoto.length > 700_000 ||
          !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(profilePhoto))) {
        throw Object.assign(new Error('Escolha uma imagem PNG, JPEG ou WebP de até 500 KB.'), { status: 400 });
      }
      db.prepare('UPDATE users SET name=?,profile_photo=? WHERE id=?').run(name, profilePhoto, user.id);
      const updated = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      return json(response, 200, { user: publicUser(updated) });
    }

    if (path === '/api/profile/account' && method === 'DELETE') {
      db.prepare('DELETE FROM class_announcements WHERE author_id=?').run(user.id);
      db.prepare('DELETE FROM calendar_announcements WHERE author_id=?').run(user.id);
      db.prepare('DELETE FROM users WHERE id=?').run(user.id);
      return json(response, 200, { ok: true }, {
        'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieSecure}`,
      });
    }

    if (path === '/api/students' && method === 'GET') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const className = url.searchParams.get('className');
      if (!isValidClass(className)) throw Object.assign(new Error('Selecione uma turma válida.'), { status: 400 });
      const rows = db.prepare(`SELECT id,name,class_name AS className FROM users
        WHERE role='student' AND class_name=? ORDER BY name COLLATE NOCASE`).all(className);
      return json(response, 200, { students: rows });
    }

    if (path === '/api/grades' && method === 'GET') {
      if (user.role === 'student') {
        const rows = gradeList(user.id);
        const student = db.prepare('SELECT name FROM users WHERE id=?').get(user.id);
        return json(response, 200, { records: rows.map((row) => ({ ...row, studentName: student.name })) });
      }
      requireRole(user, ['teacher', 'manager', 'employee']);
      const className = url.searchParams.get('className');
      if (!isValidClass(className)) throw Object.assign(new Error('Selecione uma turma válida.'), { status: 400 });
      const students = db.prepare(`SELECT id,name FROM users WHERE role='student' AND class_name=? ORDER BY name COLLATE NOCASE`).all(className);
      const records = students.flatMap((student) => gradeList(student.id).map((grade) => ({ ...grade, studentName: student.name })));
      return json(response, 200, { records });
    }

    if (path === '/api/grades' && method === 'PUT') {
      requireRole(user, ['teacher']);
      const body = await readBody(request);
      const { studentId, subjectId, trimester, month } = body;
      const grade = body.grade;
      if (typeof studentId !== 'string' || !subjects.has(subjectId) || !Number.isInteger(trimester) ||
          !trimesterMonths[trimester]?.includes(month) || typeof grade !== 'number' || !Number.isFinite(grade) || grade < 0 || grade > 10) {
        throw Object.assign(new Error('Confira a turma, disciplina, mês e nota (0 a 10).'), { status: 400 });
      }
      const student = db.prepare('SELECT id FROM users WHERE id=? AND role=? AND class_name=?')
        .get(studentId, 'student', body.className);
      if (!student || !isValidClass(body.className)) throw Object.assign(new Error('Estudante não pertence à turma selecionada.'), { status: 403 });
      db.prepare(`INSERT INTO grades(student_id,subject_id,trimester,month,grade,updated_by,updated_at)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,trimester,month)
        DO UPDATE SET grade=excluded.grade,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .run(studentId, subjectId, trimester, month, grade, user.id, now());
      return json(response, 200, { ok: true });
    }

    if (path === '/api/grades' && method === 'DELETE') {
      requireRole(user, ['teacher']);
      const body = await readBody(request);
      const { studentId, subjectId, trimester, month } = body;
      if (typeof studentId !== 'string' || !subjects.has(subjectId) || !Number.isInteger(trimester) ||
          !trimesterMonths[trimester]?.includes(month) || !isValidClass(body.className)) {
        throw Object.assign(new Error('Confira a turma, disciplina, mês e estudante da nota.'), { status: 400 });
      }
      const student = db.prepare('SELECT id FROM users WHERE id=? AND role=? AND class_name=?')
        .get(studentId, 'student', body.className);
      if (!student) throw Object.assign(new Error('Estudante não pertence à turma selecionada.'), { status: 403 });
      const result = db.prepare(`DELETE FROM grades WHERE student_id=? AND subject_id=? AND trimester=? AND month=?`)
        .run(studentId, subjectId, trimester, month);
      if (result.changes === 0) throw Object.assign(new Error('A nota informada não existe.'), { status: 404 });
      return json(response, 200, { ok: true });
    }

    if (path === '/api/announcements' && method === 'GET') {
      const rows = user.role === 'student'
        ? db.prepare(`SELECT a.id,a.title,a.body,a.class_name AS className,a.author_id AS authorId,u.name AS authorName,a.created_at AS createdAt
          FROM class_announcements a JOIN users u ON u.id=a.author_id
          WHERE a.class_name=? ORDER BY a.created_at DESC`).all(user.class_name)
        : db.prepare(`SELECT a.id,a.title,a.body,a.class_name AS className,a.author_id AS authorId,u.name AS authorName,a.created_at AS createdAt
          FROM class_announcements a JOIN users u ON u.id=a.author_id ORDER BY a.created_at DESC`).all();
      return json(response, 200, { announcements: rows });
    }

    if (path === '/api/announcements' && method === 'POST') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const body = await readBody(request);
      const title = cleanString(body.title, 160);
      const content = cleanString(body.body, 5000);
      if (!isValidClass(body.className) || title.length < 3 || content.length < 1) {
        throw Object.assign(new Error('Informe turma, título e conteúdo do comunicado.'), { status: 400 });
      }
      const id = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO class_announcements(id,class_name,title,body,author_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, body.className, title, content, user.id, now());
      return json(response, 201, { ok: true });
    }

    const announcementMatch = path.match(/^\/api\/announcements\/([a-f0-9]{32})$/);
    if (announcementMatch && method === 'PUT') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const body = await readBody(request);
      const title = cleanString(body.title, 160);
      const content = cleanString(body.body, 5000);
      if (!isValidClass(body.className) || title.length < 3 || content.length < 1) {
        throw Object.assign(new Error('Informe turma, título e conteúdo do comunicado.'), { status: 400 });
      }
      const result = db.prepare(`UPDATE class_announcements SET class_name=?,title=?,body=?
        WHERE id=? AND author_id=?`).run(body.className, title, content, announcementMatch[1], user.id);
      if (result.changes === 0) throw Object.assign(new Error('Comunicado inexistente ou sem permissão para editá-lo.'), { status: 404 });
      return json(response, 200, { ok: true });
    }
    if (announcementMatch && method === 'DELETE') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const result = db.prepare('DELETE FROM class_announcements WHERE id=? AND author_id=?')
        .run(announcementMatch[1], user.id);
      if (result.changes === 0) throw Object.assign(new Error('Comunicado inexistente ou sem permissão para removê-lo.'), { status: 404 });
      return json(response, 200, { ok: true });
    }

    if (path === '/api/guardians' && method === 'GET') {
      requireRole(user, ['teacher', 'manager']);
      const contacts = db.prepare(`SELECT name AS studentName,class_name AS className,
        guardian_phone AS guardianPhone,student_phone AS studentPhone
        FROM users WHERE role='student'
        ORDER BY class_name,name COLLATE NOCASE`).all();
      return json(response, 200, { contacts });
    }

    if ((path === '/api/menu' || path === '/api/routes') && method === 'GET') {
      if (path === '/api/menu') requireRole(user, ['student', 'teacher', 'manager', 'employee']);
      const key = path === '/api/menu' ? 'menu' : 'routes';
      return json(response, 200, { value: storedSetting(key) });
    }

    if ((path === '/api/menu' || path === '/api/routes') && method === 'PUT') {
      requireRole(user, path === '/api/routes' ? ['manager', 'employee'] : ['manager']);
      const body = await readBody(request);
      const value = body.value;
      const key = path === '/api/menu' ? 'menu' : 'routes';
      if (!validSettings(key, value)) {
        throw Object.assign(new Error('Os dados informados não têm um formato válido.'), { status: 400 });
      }
      putSetting(key, value, user.id);
      return json(response, 200, { ok: true });
    }

    if (path === '/api/calendar' && method === 'GET') {
      const events = db.prepare(`SELECT e.id,e.title,e.description,e.date,e.author_id AS authorId,
        u.name AS authorName,e.created_at AS createdAt FROM calendar_announcements e
        JOIN users u ON u.id=e.author_id ORDER BY e.date,e.created_at`).all();
      return json(response, 200, { events });
    }

    if (path === '/api/calendar' && method === 'POST') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const { title, description, date } = calendarFields(await readBody(request));
      const id = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO calendar_announcements(id,title,description,date,author_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, title, description, date, user.id, now());
      return json(response, 201, { ok: true });
    }

    const eventMatch = path.match(/^\/api\/calendar\/([a-f0-9]{32})$/);
    if (eventMatch && method === 'PUT') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const { title, description, date } = calendarFields(await readBody(request));
      const result = db.prepare('UPDATE calendar_announcements SET title=?,description=?,date=? WHERE id=? AND author_id=?')
        .run(title, description, date, eventMatch[1], user.id);
      if (result.changes === 0) throw Object.assign(new Error('Comunicado inexistente ou sem permissão para editá-lo.'), { status: 404 });
      return json(response, 200, { ok: true });
    }
    if (eventMatch && method === 'DELETE') {
      requireRole(user, ['teacher', 'manager', 'employee']);
      const result = db.prepare('DELETE FROM calendar_announcements WHERE id=? AND author_id=?').run(eventMatch[1], user.id);
      if (result.changes === 0) throw Object.assign(new Error('Comunicado inexistente ou sem permissão para removê-lo.'), { status: 404 });
      return json(response, 200, { ok: true });
    }

    if (path.startsWith('/api/')) return json(response, 404, { error: 'Recurso não encontrado.' });
    return json(response, 404, { error: 'Recurso não encontrado.' });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status === 500) console.error(error);
    return json(response, status, { error: status === 500 ? 'Erro interno do servidor.' : error.message });
  }
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};
function serveStatic(path, response) {
  const dist = resolve('dist');
  if (!existsSync(dist)) return json(response, 404, { error: 'Interface não compilada; execute npm run build.' });
  const requested = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
  const candidate = resolve(dist, requested);
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) return json(response, 400, { error: 'Caminho inválido.' });
  const file = candidate !== dist && existsSync(candidate) ? candidate : resolve(dist, 'index.html');
  if (!existsSync(file)) return json(response, 404, { error: 'Arquivo não encontrado.' });
  const content = readFileSync(file);
  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(content);
}

const port = Number(process.env.PORT ?? 3001);
const server = createServer(handle);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`FlowTech API em http://${process.env.HOST ?? '127.0.0.1'}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
