import type { SchoolClass } from '../data/school.ts';

export type UserRole = 'student' | 'teacher' | 'manager' | 'employee';
export type UserGender = 'male' | 'female' | 'unspecified';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  gender: UserGender | null;
  className: SchoolClass | null;
  profilePhoto: string | null;
}

export interface GradeRecord {
  studentId: string;
  studentName: string;
  subjectId: string;
  grades: [number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null];
}

export interface ClassAnnouncement {
  id: string;
  title: string;
  body: string;
  className: SchoolClass;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface CalendarAnnouncement {
  id: string;
  title: string;
  description: string;
  date: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface GuardianContact {
  studentName: string;
  className: SchoolClass;
  guardianPhone: string | null;
  studentPhone: string | null;
}
