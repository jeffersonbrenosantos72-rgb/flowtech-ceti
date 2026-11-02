import { useEffect, useState, type ReactNode } from 'react';
import { api, apiErrorMessage } from './data/api.ts';
import { BoletimEscolar } from './components/BoletimEscolar.tsx';
import { CalendarioEventos } from './components/CalendarioEventos.tsx';
import { CardapioMerenda } from './components/CardapioMerenda.tsx';
import { DashboardOverview } from './components/DashboardOverview.tsx';
import { Header } from './components/Header.tsx';
import { HorarioAulas } from './components/HorarioAulas.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { MuralAvisos } from './components/MuralAvisos.tsx';
import { Navigation } from './components/Navigation.tsx';
import { TransporteEscolar } from './components/TransporteEscolar.tsx';
import type { AuthUser } from './types/auth.ts';
import type { PageId } from './types/index.ts';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [page, setPage] = useState<PageId>('inicio');
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    api<{ user: AuthUser | null }>('/session')
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        if (currentUser?.role === 'employee') setPage('transporte');
      })
      .catch((error: unknown) => setSessionError(apiErrorMessage(error)))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      setPage('inicio');
    } catch (error) {
      setSessionError(apiErrorMessage(error));
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center text-sm font-semibold text-flow-700">Conectando ao FlowTech…</main>;
  if (!user) return <LoginScreen onAuthenticated={(authenticatedUser) => {
    setSessionError('');
    setUser(authenticatedUser);
    setPage(authenticatedUser.role === 'employee' ? 'transporte' : 'inicio');
  }} sessionError={sessionError} />;

  const content: Record<PageId, ReactNode> = {
    inicio: <DashboardOverview user={user} onNavigate={setPage} />,
    boletim: <BoletimEscolar user={user} />,
    horarios: <HorarioAulas user={user} />,
    cardapio: <CardapioMerenda user={user} />,
    transporte: <TransporteEscolar user={user} />,
    mural: <MuralAvisos user={user} />,
    calendario: <CalendarioEventos user={user} />,
  };
  return (
    <div className="min-h-screen bg-slate-50">
      <Header
        user={user}
        onLogout={logout}
        onProfileChange={setUser}
        onAccountDeleted={() => { setUser(null); setPage('inicio'); }}
      />
      <Navigation active={page} onChange={setPage} user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{content[page]}</main>
      {sessionError && <p role="alert" className="mx-auto max-w-7xl px-4 pb-4 text-sm text-rose-700">{sessionError}</p>}
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">FlowTech · CETI Dr. João Carvalho · SEDUC-PI</footer>
    </div>
  );
}
