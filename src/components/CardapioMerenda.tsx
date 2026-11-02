import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Flame, Save } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import { MENUS } from '../data/mockData.ts';
import type { AuthUser } from '../types/auth.ts';
import type { Meal, MenuDay } from '../types/index.ts';

export function CardapioMerenda({ user }: { user: AuthUser }) {
  const [cycle, setCycle] = useState<MenuDay['cycle']>('1/3');
  const [menus, setMenus] = useState<readonly MenuDay[]>(MENUS);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isManager = user.role === 'manager';
  useEffect(() => {
    api<{ value: MenuDay[] | null }>('/menu')
      .then(({ value }) => { if (value) setMenus(value); setLoaded(true); })
      .catch((cause: unknown) => setError(apiErrorMessage(cause)));
  }, []);

  const weekly = useMemo(() => menus.filter((day) => day.cycle === cycle), [menus, cycle]);
  const averageCalories = weekly.length
    ? Math.round(weekly.reduce((sum, day) => sum + day.meals.reduce((mealSum, meal) => mealSum + Number(meal.calories), 0), 0) / weekly.length)
    : 0;
  const updateMeal = (dayIndex: number, mealIndex: number, key: keyof Meal, value: string) => {
    setMenus((current) => current.map((day, index) => {
      if (index !== dayIndex) return day;
      const update = (meal: Meal, position: number) => position === mealIndex
        ? { ...meal, [key]: key === 'calories' ? Number(value) || 0 : value }
        : meal;
      const meals: MenuDay['meals'] = [update(day.meals[0], 0), update(day.meals[1], 1), update(day.meals[2], 2)];
      return { ...day, meals };
    }));
  };
  const publish = async () => {
    try {
      await api('/menu', { method: 'PUT', body: JSON.stringify({ value: menus }) });
      setEditing(false);
      setError('');
      setMessage('Cardápio atualizado para toda a comunidade escolar.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  return   <section className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-flow-700">PNAE · Alimentação escolar</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Cardápio da merenda escolar</h1><p className="mt-1 text-sm text-slate-600">Informações compartilhadas com todas as contas cadastradas.</p></div><div className="flex flex-wrap gap-2">{isManager && (editing ? <button onClick={() => void publish()} className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950"><Save className="size-4" />Enviar para todos</button> : <button disabled={!loaded} onClick={() => { setEditing(true); setMessage(''); }} className="rounded-xl border border-flow-200 bg-white px-4 py-2.5 text-sm font-bold text-flow-700 hover:bg-flow-50 disabled:cursor-not-allowed disabled:opacity-50">Editar</button>)}<div className="inline-flex rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setCycle('1/3')} className={`rounded-lg px-3 py-2 text-sm font-bold ${cycle === '1/3' ? 'bg-flow-700 text-white' : 'text-slate-600'}`}>Semana 1 e 3</button><button onClick={() => setCycle('2/4')} className={`rounded-lg px-3 py-2 text-sm font-bold ${cycle === '2/4' ? 'bg-flow-700 text-white' : 'text-slate-600'}`}>Semana 2 e 4</button></div></div></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Flame className="size-5 text-amber-700" /><strong>Média diária: {averageCalories.toLocaleString('pt-BR')} kcal</strong></div>
    <div className="grid gap-4 lg:grid-cols-5">{weekly.map((day) => {
      const dayIndex = menus.indexOf(day);
      return <article key={`${day.cycle}-${day.weekday}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="bg-flow-700 px-4 py-3 text-white"><p className="text-xs font-bold uppercase tracking-wider text-emerald-100">{cycle === '1/3' ? 'Semana 1 e 3' : 'Semana 2 e 4'}</p><h2 className="font-black">{day.weekday}</h2></div><div className="space-y-3 p-4">{day.meals.map((meal, mealIndex) => <div key={`${day.weekday}-${mealIndex}`} className="rounded-xl bg-slate-50 p-3"><div className="flex items-start justify-between gap-2"><p className="font-bold text-slate-800">{meal.name}</p><span className="shrink-0 text-xs font-bold text-flow-700">{meal.time}</span></div><p className="mt-2 text-sm leading-5 text-slate-600">{meal.description}</p><div className="mt-2 flex items-center justify-between text-xs"><span className="font-bold text-slate-500">{meal.calories} kcal</span><span className="text-amber-700">{meal.allergens === '—' ? 'Sem alerta' : meal.allergens}</span></div>
        {editing && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">{([
          ['name', 'Refeição'], ['time', 'Horário'], ['description', 'Descrição'], ['calories', 'Calorias'], ['allergens', 'Alérgenos'],
        ] as const).map(([field, label]) => <label key={field} className="block text-xs font-semibold text-slate-600">{label}<input type={field === 'calories' ? 'number' : 'text'} value={meal[field]} onChange={(event) => updateMeal(dayIndex, mealIndex, field, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal text-slate-800" /></label>)}</div>}
      </div>)}</div></article>;
    })}</div>
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /><p><strong className="text-slate-800">Alérgenos:</strong> estudantes com restrição alimentar devem procurar a gestão escolar e a equipe responsável pela alimentação.</p></div>
  </section>;
}
