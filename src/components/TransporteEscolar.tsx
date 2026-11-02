import { useEffect, useState } from 'react';
import { Bus, ChevronDown, Clock3, MapPin, Save } from 'lucide-react';
import { api, apiErrorMessage } from '../data/api.ts';
import { TRANSPORT_ROUTES } from '../data/mockData.ts';
import type { AuthUser } from '../types/auth.ts';
import type { TransportRoute } from '../types/index.ts';

export function TransporteEscolar({ user }: { user: AuthUser }) {
  const [routes, setRoutes] = useState<readonly TransportRoute[]>(TRANSPORT_ROUTES);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string>(TRANSPORT_ROUTES[0]!.id);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canEdit = user.role === 'manager' || user.role === 'employee';
  useEffect(() => {
    api<{ value: TransportRoute[] | null }>('/routes')
      .then(({ value }) => { if (value) setRoutes(value); setLoaded(true); })
      .catch((cause: unknown) => setError(apiErrorMessage(cause)));
  }, []);

  const updateRoute = (routeId: string, key: keyof TransportRoute, value: string) => {
    setRoutes((current) => current.map((route) => route.id === routeId ? { ...route, [key]: value } : route));
  };
  const updateStop = (routeId: string, stopIndex: number, key: 'place' | 'time', value: string) => {
    setRoutes((current) => current.map((route) => route.id === routeId
      ? { ...route, stops: route.stops.map((stop, index) => index === stopIndex ? { ...stop, [key]: value } : stop) }
      : route));
  };
  const save = async () => {
    try {
      await api('/routes', { method: 'PUT', body: JSON.stringify({ value: routes }) });
      setEditing(false);
      setError('');
      setMessage('Rotas atualizadas para toda a comunidade escolar.');
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  };

  return <section className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-flow-700">PNATE · Transporte escolar</p><h1 className="text-3xl font-black tracking-tight text-slate-900">Monitoramento das rotas</h1><p className="mt-1 text-sm text-slate-600">Informações compartilhadas de transporte escolar.</p></div>{canEdit && (editing ? <button onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-flow-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-flow-950"><Save className="size-4" />Salvar rotas</button> : <button disabled={!loaded} onClick={() => { setEditing(true); setMessage(''); }} className="rounded-xl border border-flow-200 bg-white px-4 py-2.5 text-sm font-bold text-flow-700 hover:bg-flow-50 disabled:cursor-not-allowed disabled:opacity-50">Editar rotas</button>)}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p>}
    <div className="grid gap-4 md:grid-cols-3">{routes.map((route) => <div key={route.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-flow-50 text-flow-700"><Bus className="size-5" /></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">{route.status}</span></div><p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">{route.sheet}</p><h2 className="text-xl font-black text-slate-900">{route.vehicle}</h2><p className="mt-1 text-sm text-slate-600">{route.service}</p><div className="mt-4 flex items-center gap-2 text-sm font-bold text-flow-700"><Clock3 className="size-4" />{route.start} → {route.arrival}</div></div>)}</div>
    <div className="space-y-4">{routes.map((route) => { const open = route.id === expanded; return <article key={route.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button onClick={() => setExpanded(open ? '' : route.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-slate-50"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-flow-700 text-white"><Bus className="size-5" /></span><div><p className="font-black text-slate-900">{route.vehicle} · {route.sheet}</p><p className="text-sm text-slate-600">{route.stops.length} paradas · chegada {route.arrival}</p></div></div><ChevronDown className={`size-5 text-slate-500 transition ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="border-t border-slate-100 p-5"><p className="flex items-center gap-2 text-sm text-slate-600"><Clock3 className="size-4 text-flow-700" /><span><strong>Chegada CETI:</strong> {route.arrival}</span></p>
      {editing && <div className="mt-5 grid gap-3 sm:grid-cols-2">{([
        ['vehicle', 'Veículo'], ['sheet', 'Identificação'], ['service', 'Rota / locais atendidos'], ['start', 'Horário inicial'], ['arrival', 'Chegada ao CETI'],
      ] as const).map(([field, label]) => <label key={field} className="text-xs font-semibold text-slate-600">{label}<input value={route[field]} onChange={(event) => updateRoute(route.id, field, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-800" /></label>)}<label className="text-xs font-semibold text-slate-600">Situação<select value={route.status} onChange={(event) => { const status = event.target.value; if (status === 'Em operação' || status === 'Atenção') setRoutes((current) => current.map((item) => item.id === route.id ? { ...item, status } : item)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800"><option>Em operação</option><option>Atenção</option></select></label></div>}
      <ol className="mt-5 grid gap-2 md:grid-cols-2">{route.stops.map((stop, index) => <li key={`${route.id}-${index}`} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-flow-100 text-xs font-black text-flow-700">{index + 1}</span><MapPin className="size-4 text-slate-400" />{editing ? <><input aria-label={`Local da parada ${index + 1}`} value={stop.place} onChange={(event) => updateStop(route.id, index, 'place', event.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm" /><input aria-label={`Horário da parada ${index + 1}`} value={stop.time} onChange={(event) => updateStop(route.id, index, 'time', event.target.value)} className="w-28 rounded border border-slate-200 px-2 py-1 text-sm" /></> : <><span className="flex-1 font-medium text-slate-700">{stop.place}</span><strong className="text-flow-700">{stop.time}</strong></>}</li>)}</ol>
    </div>}</article>; })}</div>
  </section>;
}
