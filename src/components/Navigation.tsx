import { Bell, Bus, CalendarDays, ClipboardList, GraduationCap, LayoutDashboard, Soup, TableProperties } from 'lucide-react';
import type { AuthUser } from '../types/auth.ts';
import type { PageId } from '../types/index.ts';

interface NavigationProps { active: PageId; onChange: (page: PageId) => void; user: AuthUser; }
const items: readonly { id: PageId; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'inicio', label: 'Visão geral', Icon: LayoutDashboard }, { id: 'boletim', label: 'Boletim', Icon: GraduationCap }, { id: 'horarios', label: 'Horários', Icon: TableProperties }, { id: 'cardapio', label: 'Cardápio', Icon: Soup }, { id: 'transporte', label: 'Transporte', Icon: Bus }, { id: 'mural', label: 'Mural', Icon: Bell }, { id: 'calendario', label: 'Calendário', Icon: CalendarDays },
];
export function Navigation({ active, onChange, user }: NavigationProps) {
  return <nav className="border-b border-slate-200 bg-slate-950 no-print"><div className="nav-scroll mx-auto flex max-w-7xl overflow-x-auto px-3 sm:px-5">{items.map(({ id, label, Icon }) => <button key={id} onClick={() => onChange(id)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition ${active === id ? 'border-amber-300 bg-white/10 text-white' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon className="size-4" />{label}</button>)}</div></nav>;
}
