import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Plus,
  Send,
  UserX,
  X,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import {
  addDaysToYYYYMMDD,
  buildReminderMessage,
  buildWhatsAppHref,
  formatBRL,
  formatDateBRLong,
  formatDateBRShort,
  formatPhoneInput,
  getLocalNowYYYYMMDDTHHMM,
  getLocalTodayYYYYMMDD,
  getStartOfWeekYYYYMMDD,
} from '../lib/formatters.ts';
import type {
  Agendamento,
  AppointmentStatus,
  DashboardSummary,
  Negocio,
  Profissional,
  Servico,
  SlotDisponivel,
} from '../shared/types.ts';

interface OwnerDashboardViewProps {
  onToast: (msg: string, type?: 'success' | 'error') => void;
  openNewBookingTrigger: number;
}

const STATUS_LABELS: Record<AppointmentStatus, { label: string; textClass: string }> = {
  confirmado: { label: 'Confirmado', textClass: 'text-teal-700' },
  concluido: { label: 'Concluído', textClass: 'text-emerald-700' },
  faltou: { label: 'Faltou', textClass: 'text-amber-700' },
  cancelado: { label: 'Cancelado', textClass: 'text-slate-400 line-through' },
};

export function OwnerDashboardView({
  onToast,
  openNewBookingTrigger,
}: OwnerDashboardViewProps) {
  const [viewMode, setViewMode] = useState<'dia' | 'semana'>('dia');
  const [focusDate, setFocusDate] = useState<string>(getLocalTodayYYYYMMDD());
  const [filterProfId, setFilterProfId] = useState<number | 'todos'>('todos');
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  const [overview, setOverview] = useState<DashboardSummary | null>(null);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(true);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<Agendamento | null>(null);
  const [rescheduleProfId, setRescheduleProfId] = useState<number>(0);
  const [rescheduleDate, setRescheduleDate] = useState<string>(getLocalTodayYYYYMMDD());
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotDisponivel[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [rescheduleHora, setRescheduleHora] = useState<string>('');
  const [savingReschedule, setSavingReschedule] = useState(false);

  // Reminder modal state
  const [reminderTarget, setReminderTarget] = useState<Agendamento | null>(null);
  const [reminderChannel, setReminderChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [reminderText, setReminderText] = useState<string>('');
  const [sendingReminder, setSendingReminder] = useState(false);

  // Manual new booking modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newServId, setNewServId] = useState<number>(0);
  const [newProfId, setNewProfId] = useState<number>(0);
  const [newDate, setNewDate] = useState<string>(getLocalTodayYYYYMMDD());
  const [newSlots, setNewSlots] = useState<SlotDisponivel[]>([]);
  const [loadingNewSlots, setLoadingNewSlots] = useState(false);
  const [newHora, setNewHora] = useState<string>('');
  const [newNome, setNewNome] = useState('');
  const [newTel, setNewTel] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  const weekDays = useMemo(() => {
    const start = getStartOfWeekYYYYMMDD(focusDate);
    return Array.from({ length: 7 }, (_, i) => addDaysToYYYYMMDD(start, i));
  }, [focusDate]);

  const dateRange = useMemo(() => {
    if (viewMode === 'dia') {
      return { dataInicio: focusDate, dataFim: focusDate };
    }
    return { dataInicio: weekDays[0], dataFim: weekDays[6] };
  }, [viewMode, focusDate, weekDays]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = getLocalTodayYYYYMMDD();
      const [ov, profRes, servRes, agRes] = await Promise.all([
        api.getOwnerOverview(today),
        api.getOwnerProfissionais(),
        api.getOwnerServicos(),
        api.getOwnerAgendamentos({
          dataInicio: dateRange.dataInicio,
          dataFim: dateRange.dataFim,
          profissionalId: filterProfId === 'todos' ? null : filterProfId,
          status: filterStatus,
        }),
      ]);
      setOverview(ov);
      setProfissionais(profRes.profissionais);
      setServicos(servRes.servicos);
      setAgendamentos(agRes.agendamentos);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao carregar agenda.', 'error');
    } finally {
      setLoading(false);
    }
  }, [dateRange.dataInicio, dateRange.dataFim, filterProfId, filterStatus, onToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open new booking modal when triggered from Top Bar CTA
  useEffect(() => {
    if (openNewBookingTrigger > 0) {
      const activeServices = servicos.filter((s) => s.ativo === 1);
      const activeProfs = profissionais.filter((p) => p.ativo === 1);
      if (activeServices.length > 0) setNewServId(activeServices[0].id);
      if (activeProfs.length > 0) setNewProfId(activeProfs[0].id);
      setNewDate(focusDate);
      setNewHora('');
      setNewNome('');
      setNewTel('');
      setNewEmail('');
      setNewError(null);
      setShowNewModal(true);
    }
  }, [openNewBookingTrigger, servicos, profissionais, focusDate]);

  // Fetch slots for Reschedule modal
  useEffect(() => {
    if (!rescheduleTarget || !overview?.negocio.slug || !rescheduleProfId || !rescheduleDate) return;
    setLoadingRescheduleSlots(true);
    api
      .getDisponibilidade({
        slug: overview.negocio.slug,
        profissionalId: rescheduleProfId,
        servicoId: rescheduleTarget.servico_id,
        data: rescheduleDate,
        excludeAgendamentoId: rescheduleTarget.id,
      })
      .then((res) => {
        setRescheduleSlots(res.slots);
        setRescheduleHora(res.slots[0]?.hora_inicio || '');
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingRescheduleSlots(false));
  }, [rescheduleTarget, overview?.negocio.slug, rescheduleProfId, rescheduleDate]);

  // Fetch slots for New Manual Booking modal
  useEffect(() => {
    if (!showNewModal || !overview?.negocio.slug || !newProfId || !newServId || !newDate) return;
    setLoadingNewSlots(true);
    api
      .getDisponibilidade({
        slug: overview.negocio.slug,
        profissionalId: newProfId,
        servicoId: newServId,
        data: newDate,
        agora: getLocalNowYYYYMMDDTHHMM(),
      })
      .then((res) => {
        setNewSlots(res.slots);
        setNewHora(res.slots[0]?.hora_inicio || '');
      })
      .catch(() => setNewSlots([]))
      .finally(() => setLoadingNewSlots(false));
  }, [showNewModal, overview?.negocio.slug, newProfId, newServId, newDate]);

  const handleStatusChange = async (id: number, status: AppointmentStatus) => {
    try {
      await api.updateAgendamentoStatus(id, status);
      const msgs: Record<AppointmentStatus, string> = {
        concluido: 'Atendimento marcado como concluído.',
        faltou: 'Ausência registrada.',
        cancelado: 'Agendamento cancelado e horário liberado.',
        confirmado: 'Agendamento reativado.',
      };
      onToast(msgs[status]);
      await loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao atualizar status.', 'error');
    }
  };

  const openReschedule = (ag: Agendamento) => {
    setRescheduleTarget(ag);
    setRescheduleProfId(ag.profissional_id);
    setRescheduleDate(ag.inicio.slice(0, 10));
    setRescheduleHora('');
  };

  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleHora) return;
    setSavingReschedule(true);
    try {
      await api.remarcarAgendamento(rescheduleTarget.id, {
        data: rescheduleDate,
        hora_inicio: rescheduleHora,
        profissional_id: rescheduleProfId,
      });
      onToast('Agendamento remarcado com sucesso.');
      setRescheduleTarget(null);
      await loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Não foi possível remarcar.', 'error');
    } finally {
      setSavingReschedule(false);
    }
  };

  const openReminder = (ag: Agendamento, negocio: Negocio) => {
    setReminderTarget(ag);
    setReminderChannel(ag.cliente_email && !ag.cliente_telefone ? 'email' : 'whatsapp');
    setReminderText(
      buildReminderMessage({
        clienteNome: ag.cliente_nome,
        negocioNome: negocio.nome,
        servicoNome: ag.servico_nome || '',
        profissionalNome: ag.profissional_nome || '',
        inicioIso: ag.inicio,
        endereco: negocio.endereco,
      })
    );
  };

  const handleRegisterReminder = async () => {
    if (!reminderTarget) return;
    setSendingReminder(true);
    try {
      await api.enviarLembrete(reminderTarget.id, {
        canal: reminderChannel,
        mensagem: reminderText,
      });
      onToast(`Lembrete via ${reminderChannel === 'whatsapp' ? 'WhatsApp' : 'E-mail'} registrado.`);
      setReminderTarget(null);
      await loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao registrar lembrete.', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleCreateManualBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overview?.negocio.slug || !newHora) return;
    setSavingNew(true);
    setNewError(null);
    try {
      await api.createPublicAgendamento(overview.negocio.slug, {
        profissional_id: newProfId,
        servico_id: newServId,
        data: newDate,
        hora_inicio: newHora,
        cliente_nome: newNome,
        cliente_telefone: newTel,
        cliente_email: newEmail,
      });
      onToast('Novo agendamento salvo na agenda.');
      setShowNewModal(false);
      await loadData();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setNewError(err.message);
      } else {
        setNewError(err instanceof Error ? err.message : 'Erro ao criar agendamento.');
      }
    } finally {
      setSavingNew(false);
    }
  };

  const shiftFocusDate = (days: number) => {
    setFocusDate((prev) => addDaysToYYYYMMDD(prev, days));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Agendamentos Hoje</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {overview ? overview.hoje_total : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Ativos no dia atual</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Aguardando Atendimento</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-teal-700">
            {overview ? overview.hoje_confirmados : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Horários confirmados hoje</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Receita Prevista Hoje</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {overview ? formatBRL(overview.hoje_receita_prevista) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Confirmados + concluídos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Comparecimento</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {overview ? `${overview.taxa_comparecimento}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">Concluídos vs. faltas</p>
        </div>
      </section>

      {/* Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Day / Week toggle */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('dia')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'dia'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda do Dia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('semana')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'semana'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda da Semana
            </button>
          </div>

          {/* Date stepper */}
          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => shiftFocusDate(viewMode === 'dia' ? -1 : -7)}
              className="p-2 text-slate-600 hover:bg-slate-50 transition-colors"
              aria-label="Período anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFocusDate(getLocalTodayYYYYMMDD())}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-l border-r border-slate-200 whitespace-nowrap"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => shiftFocusDate(viewMode === 'dia' ? 1 : 7)}
              className="p-2 text-slate-600 hover:bg-slate-50 transition-colors"
              aria-label="Próximo período"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <input
            type="date"
            value={focusDate}
            onChange={(e) => {
              if (e.target.value) setFocusDate(e.target.value);
            }}
            className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white text-slate-700"
          />

          <span className="text-sm font-medium text-slate-800">
            {viewMode === 'dia'
              ? formatDateBRLong(focusDate)
              : `${formatDateBRShort(weekDays[0])} — ${formatDateBRShort(weekDays[6])}`}
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={filterProfId}
            onChange={(e) =>
              setFilterProfId(e.target.value === 'todos' ? 'todos' : Number(e.target.value))
            }
            aria-label="Filtrar por profissional"
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="todos">Todos os profissionais</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filtrar por status"
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
          >
            <option value="todos">Todos os status</option>
            <option value="confirmado">Confirmado</option>
            <option value="concluido">Concluído</option>
            <option value="faltou">Faltou</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
      </section>

      {/* Main Schedule View */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : viewMode === 'dia' ? (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {agendamentos.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-900">
                Nenhum agendamento para este filtro
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Não há horários marcados para {formatDateBRLong(focusDate)}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Horário</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Serviço</th>
                    <th className="py-3 px-4">Profissional</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Lembrete</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {agendamentos.map((ag) => {
                    const st = STATUS_LABELS[ag.status];
                    return (
                      <tr key={ag.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                          {ag.inicio.slice(11, 16)} – {ag.fim.slice(11, 16)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900">{ag.cliente_nome}</div>
                          <div className="text-xs font-mono tabular-nums text-slate-500">
                            {ag.cliente_telefone}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-900">{ag.servico_nome}</div>
                          <div className="text-xs font-mono tabular-nums text-slate-500">
                            {ag.servico_duracao_min} min · {formatBRL(ag.servico_preco ?? 0)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                          {ag.profissional_nome}
                        </td>
                        <td className={`py-3.5 px-4 text-xs font-semibold whitespace-nowrap ${st.textClass}`}>
                          {st.label}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {ag.lembrete_enviado_em ? (
                            <span className="text-xs text-emerald-700 font-medium">
                              Enviado ({ag.lembrete_canal === 'email' ? 'E-mail' : 'WhatsApp'})
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => overview && openReminder(ag, overview.negocio)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Enviar lembrete
                            </button>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {ag.status === 'confirmado' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(ag.id, 'concluido')}
                                  title="Marcar como concluído"
                                  className="px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors"
                                >
                                  Concluir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openReschedule(ag)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                                >
                                  Remarcar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(ag.id, 'faltou')}
                                  title="Registrar falta"
                                  className="p-1.5 text-amber-700 border border-slate-200 rounded-md hover:bg-amber-50 transition-colors"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(ag.id, 'cancelado')}
                                  title="Cancelar horário"
                                  className="p-1.5 text-red-700 border border-slate-200 rounded-md hover:bg-red-50 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {ag.status !== 'confirmado' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openReschedule(ag)}
                                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                                >
                                  Remarcar
                                </button>
                                {ag.status === 'cancelado' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(ag.id, 'confirmado')}
                                    className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 transition-colors"
                                  >
                                    Reativar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        /* Visão da Semana (7 colunas) */
        <section className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((dayIso) => {
            const dayItems = agendamentos.filter((a) => a.inicio.startsWith(dayIso));
            const isToday = dayIso === getLocalTodayYYYYMMDD();
            return (
              <div
                key={dayIso}
                className={`bg-white border rounded-xl flex flex-col min-h-[260px] ${
                  isToday ? 'border-teal-700' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setFocusDate(dayIso);
                    setViewMode('dia');
                  }}
                  className={`px-3 py-2.5 border-b text-left flex items-center justify-between transition-colors ${
                    isToday
                      ? 'bg-teal-50/60 border-teal-200 text-teal-900'
                      : 'bg-slate-50/70 border-slate-200 text-slate-800 hover:bg-slate-100/70'
                  }`}
                >
                  <span className="text-xs font-semibold">{formatDateBRShort(dayIso)}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {dayItems.filter((i) => i.status !== 'cancelado').length}
                  </span>
                </button>

                <div className="p-2 space-y-2 flex-1">
                  {dayItems.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-6">Sem horários</p>
                  ) : (
                    dayItems.map((ag) => {
                      const st = STATUS_LABELS[ag.status];
                      return (
                        <div
                          key={ag.id}
                          className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1 text-xs"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono tabular-nums font-semibold text-slate-900">
                              {ag.inicio.slice(11, 16)}
                            </span>
                            <span className={`text-[11px] font-medium ${st.textClass}`}>
                              {st.label}
                            </span>
                          </div>
                          <div className="font-medium text-slate-900 truncate">{ag.cliente_nome}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {ag.servico_nome} · {ag.profissional_nome}
                          </div>
                          {ag.status === 'confirmado' && (
                            <div className="pt-1.5 flex items-center justify-between gap-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => openReschedule(ag)}
                                className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
                              >
                                Remarcar
                              </button>
                              <button
                                type="button"
                                onClick={() => overview && openReminder(ag, overview.negocio)}
                                className="text-[11px] font-medium text-teal-700 hover:text-teal-900"
                              >
                                Lembrete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Modal: Remarcar Agendamento */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-teal-700" />
                  Remarcar horário
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {rescheduleTarget.cliente_nome} · {rescheduleTarget.servico_nome} (
                  {rescheduleTarget.servico_duracao_min} min)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReschedule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Profissional
                </label>
                <select
                  value={rescheduleProfId}
                  onChange={(e) => setRescheduleProfId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900"
                >
                  {profissionais
                    .filter((p) => p.ativo === 1)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nova data</label>
                <input
                  type="date"
                  required
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Horários livres disponíveis
                </label>
                {loadingRescheduleSlots ? (
                  <p className="text-xs text-slate-500 py-2">Calculando horários...</p>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    Nenhum horário livre nesta data para este profissional.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto pr-1">
                    {rescheduleSlots.map((slot) => (
                      <button
                        key={slot.hora_inicio}
                        type="button"
                        onClick={() => setRescheduleHora(slot.hora_inicio)}
                        className={`py-2 text-xs font-mono tabular-nums font-medium rounded-lg border transition-colors ${
                          rescheduleHora === slot.hora_inicio
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-teal-700'
                        }`}
                      >
                        {slot.hora_inicio}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingReschedule || !rescheduleHora}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {savingReschedule ? 'Salvando...' : 'Confirmar Remarcação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enviar Lembrete WhatsApp / E-mail */}
      {reminderTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Enviar lembrete ao cliente
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {reminderTarget.cliente_nome} · {reminderTarget.cliente_telefone}
                  {reminderTarget.cliente_email ? ` · ${reminderTarget.cliente_email}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReminderTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setReminderChannel('whatsapp')}
                className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 ${
                  reminderChannel === 'whatsapp'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setReminderChannel('email')}
                className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 ${
                  reminderChannel === 'email'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                E-mail
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Mensagem do lembrete
              </label>
              <textarea
                rows={4}
                value={reminderText}
                onChange={(e) => setReminderText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {reminderChannel === 'whatsapp' ? (
                <a
                  href={buildWhatsAppHref(reminderTarget.cliente_telefone, reminderText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Abrir WhatsApp Web
                </a>
              ) : (
                <a
                  href={`mailto:${reminderTarget.cliente_email}?subject=${encodeURIComponent(
                    `Lembrete de agendamento — ${overview?.negocio.nome || ''}`
                  )}&body=${encodeURIComponent(reminderText)}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Abrir aplicativo de E-mail
                </a>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReminderTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={sendingReminder}
                  onClick={handleRegisterReminder}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  <Check className="w-3.5 h-3.5" />
                  {sendingReminder ? 'Registrando...' : 'Marcar como Enviado'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Agendamento Manual */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-teal-700" />
                  Novo agendamento manual
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Usa a mesma verificação transacional de conflitos da página pública.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateManualBooking} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Serviço</label>
                  <select
                    value={newServId}
                    onChange={(e) => setNewServId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {servicos
                      .filter((s) => s.ativo === 1)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome} ({s.duracao_min}m · {formatBRL(s.preco)})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Profissional
                  </label>
                  <select
                    value={newProfId}
                    onChange={(e) => setNewProfId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {profissionais
                      .filter((p) => p.ativo === 1)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  min={getLocalTodayYYYYMMDD()}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Horário disponível
                </label>
                {loadingNewSlots ? (
                  <p className="text-xs text-slate-500">Buscando horários...</p>
                ) : newSlots.length === 0 ? (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Sem horários livres nesta data.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
                    {newSlots.map((slot) => (
                      <button
                        key={slot.hora_inicio}
                        type="button"
                        onClick={() => setNewHora(slot.hora_inicio)}
                        className={`py-1.5 text-xs font-mono tabular-nums font-medium rounded-lg border ${
                          newHora === slot.hora_inicio
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        {slot.hora_inicio}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nome do cliente
                  </label>
                  <input
                    type="text"
                    required
                    value={newNome}
                    onChange={(e) => setNewNome(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    required
                    value={newTel}
                    onChange={(e) => setNewTel(formatPhoneInput(e.target.value))}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    E-mail (opcional)
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {newError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{newError}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNew || !newHora}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
                >
                  {savingNew ? 'Salvando...' : 'Confirmar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
