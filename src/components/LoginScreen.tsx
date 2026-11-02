import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldAlert, UserRound } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import { SCHOOL_CLASSES } from '../data/school.ts';
import type { AuthUser, UserRole } from '../types/auth.ts';

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  sessionError: string;
}

const roleLabels: Record<UserRole, string> = {
  student: 'Aluno(a)',
  teacher: 'Professor(a)',
  manager: 'Gestor(a) escolar',
  employee: 'Funcionário(a)',
};

export function LoginScreen({ onAuthenticated, sessionError }: LoginScreenProps) {
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [className, setClassName] = useState<string>(SCHOOL_CLASSES[0]);
  const [guardianPhone, setGuardianPhone] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const path = registering ? '/auth/register' : '/auth/login';
      const body = registering
        ? {
          name, email, password, role, className: role === 'student' ? className : null,
          guardianPhone: role === 'student' ? guardianPhone : null,
          studentPhone: role === 'student' ? studentPhone : null,
        }
        : { email, password };
      const result = await api<{ user: AuthUser }>(path, { method: 'POST', body: JSON.stringify(body) });
      onAuthenticated(result.user);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-wallpaper flex min-h-screen items-center justify-center p-4 sm:p-8">
      <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl shadow-slate-950/30 sm:p-10">
        <div className="mb-8 flex items-center gap-3 text-flow-700"><img src="/flowtech-logo.png" alt="Logo FlowTech" className="size-11 rounded-2xl object-cover shadow-sm" /><div><p className="text-xl font-black tracking-tight">FlowTech</p><p className="text-xs text-slate-500">Portal acadêmico e comunitário</p></div></div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-flow-700">{registering ? 'Nova conta' : 'Portal escolar'}</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">{registering ? 'Criar conta' : 'Bem-vindo de volta'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{registering ? 'Informe seus dados para acessar as funcionalidades do seu perfil.' : 'Entre para acompanhar suas informações escolares.'}</p>
          <form className="mt-8 space-y-4" onSubmit={submit}>
            {registering && <>
              <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Nome completo</span><span className="relative block"><UserRound className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" /><input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100" /></span></label>
              <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Tipo de conta</span><select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100">{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {role === 'student' && <>
                <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Turma</span><select value={className} onChange={(event) => setClassName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100">{SCHOOL_CLASSES.map((schoolClass) => <option key={schoolClass}>{schoolClass}</option>)}</select></label>
                <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">WhatsApp do responsável</span><input required type="tel" autoComplete="tel" value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)} placeholder="(89) 99999-9999" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100" /></label>
                <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Seu WhatsApp</span><input required type="tel" autoComplete="tel-national" value={studentPhone} onChange={(event) => setStudentPhone(event.target.value)} placeholder="(89) 99999-9999" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100" /></label>
              </>}
              {(role === 'teacher' || role === 'manager' || role === 'employee') && <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ShieldAlert className="size-5 shrink-0" />Conta considerada como contribuinte da instituição escolar para o manuseio restrito de funcionalidades.</p>}
            </>}
            <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">E-mail</span><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100" /></span></label>
            <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">Senha {registering && <span className="font-normal text-slate-500">(10 a 30 caracteres)</span>}</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-3 size-5 text-slate-400" /><input required minLength={registering ? 10 : undefined} maxLength={registering ? 30 : 256} value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-11 text-sm outline-none focus:border-flow-500 focus:ring-4 focus:ring-flow-100" /><button className="absolute right-3 top-2.5 rounded-lg p-1 text-slate-500 hover:bg-slate-100" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></span></label>
            {(error || sessionError) && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{error || sessionError}</p>}
            <button disabled={submitting} type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-flow-700 px-4 py-3 font-bold text-white shadow-lg transition hover:bg-flow-950 disabled:opacity-60"><KeyRound className="size-4" />{submitting ? 'Aguarde…' : registering ? 'Cadastrar conta' : 'Entrar no portal'}</button>
          </form>
          <button type="button" onClick={() => { setRegistering((value) => !value); setError(''); }} className="mt-4 w-full rounded-xl border border-flow-200 bg-flow-50 px-4 py-3 text-sm font-bold text-flow-700 transition hover:bg-flow-100">{registering ? 'Já tenho uma conta · Entrar' : 'Cadastrar conta'}</button>
          <p className="mt-4 text-center text-xs text-slate-500">Os dados são armazenados no servidor escolar.</p>
      </section>
    </main>
  );
}
