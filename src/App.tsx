import { useCallback, useEffect, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { api } from './lib/api.ts';
import { OwnerDashboardView } from './components/OwnerDashboardView.tsx';
import { ServicesManagerView } from './components/ServicesManagerView.tsx';
import { ProfessionalsManagerView } from './components/ProfessionalsManagerView.tsx';
import { BusinessSettingsView } from './components/BusinessSettingsView.tsx';
import { PublicBookingView } from './components/PublicBookingView.tsx';

type OwnerTab = 'agenda' | 'servicos' | 'profissionais' | 'configuracoes';

interface RouteState {
  mode: 'owner' | 'public';
  tab: OwnerTab;
  publicSlug: string;
}

function parseLocation(defaultSlug: string): RouteState {
  const pathname = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (pathname && !['agenda', 'servicos', 'profissionais', 'configuracoes'].includes(pathname)) {
    return { mode: 'public', tab: 'agenda', publicSlug: pathname };
  }
  const tab = (['servicos', 'profissionais', 'configuracoes'].includes(pathname)
    ? pathname
    : 'agenda') as OwnerTab;
  return { mode: 'owner', tab, publicSlug: defaultSlug };
}

export default function App() {
  const [defaultSlug, setDefaultSlug] = useState('barbearia-do-joao');
  const [route, setRoute] = useState<RouteState>(() => parseLocation('barbearia-do-joao'));
  const [toast, setToast] = useState<{ id: number; msg: string; type: 'success' | 'error' } | null>(
    null
  );
  const [newBookingTrigger, setNewBookingTrigger] = useState(0);

  useEffect(() => {
    api
      .getDefaultSlug()
      .then((res) => {
        setDefaultSlug(res.slug);
        setRoute(parseLocation(res.slug));
      })
      .catch(() => {
        // fallback to default
      });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseLocation(defaultSlug));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [defaultSlug]);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, msg, type });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  }, []);

  const navigateOwner = (tab: OwnerTab) => {
    const nextPath = tab === 'agenda' ? '/' : `/${tab}`;
    window.history.pushState({}, '', nextPath);
    setRoute({ mode: 'owner', tab, publicSlug: defaultSlug });
  };

  const navigatePublic = (slug: string) => {
    window.history.pushState({}, '', `/${slug}`);
    setRoute({ mode: 'public', tab: 'agenda', publicSlug: slug });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => navigateOwner('agenda')}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            AgendaFácil
          </button>

          {/* Zone 2: Concise single-line text nav links */}
          {route.mode === 'owner' ? (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => navigateOwner('agenda')}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                  route.tab === 'agenda'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Agenda
              </button>
              <button
                type="button"
                onClick={() => navigateOwner('servicos')}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                  route.tab === 'servicos'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Serviços
              </button>
              <button
                type="button"
                onClick={() => navigateOwner('profissionais')}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                  route.tab === 'profissionais'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Profissionais
              </button>
              <button
                type="button"
                onClick={() => navigateOwner('configuracoes')}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors ${
                  route.tab === 'configuracoes'
                    ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Configurações
              </button>
              <button
                type="button"
                onClick={() => navigatePublic(defaultSlug)}
                className="whitespace-nowrap shrink-0 py-1 text-teal-700 hover:text-teal-900 transition-colors"
              >
                Página Pública
              </button>
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <a
                href="#servicos"
                className="whitespace-nowrap shrink-0 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Serviços
              </a>
              <a
                href="#profissionais"
                className="whitespace-nowrap shrink-0 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Profissionais
              </a>
              <a
                href="#horarios"
                className="whitespace-nowrap shrink-0 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Horários
              </a>
              <button
                type="button"
                onClick={() => navigateOwner('agenda')}
                className="whitespace-nowrap shrink-0 text-teal-700 hover:text-teal-900 transition-colors"
              >
                Painel do Dono
              </button>
            </nav>
          )}

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {route.mode === 'owner' ? (
              <button
                type="button"
                onClick={() => {
                  if (route.tab !== 'agenda') {
                    navigateOwner('agenda');
                  }
                  setNewBookingTrigger((c) => c + 1);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Novo Agendamento
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigateOwner('agenda')}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Painel do Dono
              </button>
            )}
          </div>
        </div>

        {/* Mobile sub-navigation (compact single line) */}
        {route.mode === 'owner' && (
          <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
            <button
              type="button"
              onClick={() => navigateOwner('agenda')}
              className={`whitespace-nowrap shrink-0 ${
                route.tab === 'agenda' ? 'text-teal-700 font-semibold' : 'text-slate-600'
              }`}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => navigateOwner('servicos')}
              className={`whitespace-nowrap shrink-0 ${
                route.tab === 'servicos' ? 'text-teal-700 font-semibold' : 'text-slate-600'
              }`}
            >
              Serviços
            </button>
            <button
              type="button"
              onClick={() => navigateOwner('profissionais')}
              className={`whitespace-nowrap shrink-0 ${
                route.tab === 'profissionais' ? 'text-teal-700 font-semibold' : 'text-slate-600'
              }`}
            >
              Profissionais
            </button>
            <button
              type="button"
              onClick={() => navigateOwner('configuracoes')}
              className={`whitespace-nowrap shrink-0 ${
                route.tab === 'configuracoes' ? 'text-teal-700 font-semibold' : 'text-slate-600'
              }`}
            >
              Configurações
            </button>
            <button
              type="button"
              onClick={() => navigatePublic(defaultSlug)}
              className="whitespace-nowrap shrink-0 text-teal-700"
            >
              Página Pública
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {route.mode === 'public' ? (
          <PublicBookingView
            slug={route.publicSlug}
            onNavigateOwner={() => navigateOwner('agenda')}
          />
        ) : route.tab === 'agenda' ? (
          <OwnerDashboardView
            onToast={showToast}
            openNewBookingTrigger={newBookingTrigger}
          />
        ) : route.tab === 'servicos' ? (
          <ServicesManagerView onToast={showToast} />
        ) : route.tab === 'profissionais' ? (
          <ProfessionalsManagerView onToast={showToast} />
        ) : (
          <BusinessSettingsView
            onToast={showToast}
            onSlugUpdated={(newSlug) => setDefaultSlug(newSlug)}
            onOpenPublicSlug={(slug) => navigatePublic(slug)}
          />
        )}
      </main>

      {/* Quiet minimal footer */}
      <footer className="border-t border-slate-200 bg-white py-5 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>AgendaFácil · Agendamento online sem conflitos</span>
          <button
            type="button"
            onClick={() =>
              route.mode === 'owner' ? navigatePublic(defaultSlug) : navigateOwner('agenda')
            }
            className="text-slate-700 hover:text-slate-900 font-medium"
          >
            {route.mode === 'owner'
              ? `Visualizar página pública (/${defaultSlug})`
              : 'Acessar painel administrativo'}
          </button>
        </div>
      </footer>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-lg flex items-center gap-2.5 text-sm font-medium ${
            toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-slate-900 border-slate-800 text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
