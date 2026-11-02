import type { UserGender, UserRole } from '../types/auth.ts';

const roleLabels: Record<UserRole, Record<UserGender, string>> = {
  student: { male: 'Aluno', female: 'Aluna', unspecified: 'Aluno(a)' },
  teacher: { male: 'Professor', female: 'Professora', unspecified: 'Professor(a)' },
  manager: { male: 'Gestor escolar', female: 'Gestora escolar', unspecified: 'Gestor(a) escolar' },
  employee: { male: 'Funcionário', female: 'Funcionária', unspecified: 'Funcionário(a)' },
};

export function roleLabel(role: UserRole, gender: UserGender | null): string {
  return roleLabels[role][gender ?? 'unspecified'];
}
