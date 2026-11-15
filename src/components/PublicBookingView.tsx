import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import {
  addDaysToYYYYMMDD,
  buildReminderMessage,
  buildWhatsAppHref,
  DIAS_SEMANA_CURTO,
  formatBRL,
  formatDateBRLong,
  formatDateBRShort,
  formatPhoneInput,
  getLocalNowYYYYMMDDTHHMM,
  getLocalTodayYYYYMMDD,
} from '../lib/formatters.ts';
import { SmartImage } from './SmartImage.tsx';
import type {
  Agendamento,
  PublicBusinessPayload,
  SlotDisponivel,
} from '../shared/types.ts';

interface PublicBookingViewProps {
  slug: string;
  onNavigateOwner: () => void;
}

export function PublicBookingView({ slug, onNavigateOwner }: PublicBookingViewProps) {
  const [payload, setPayload] = useState<PublicBusinessPayload | null>(null);
  const [loadingBusiness, setLoadingBusiness] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);

  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedProfId, setSelectedProfId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalTodayYYYYMMDD());
  const [slots, setSlots] = useState<SlotDisponivel[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotDisponivel | null>(null);

  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  const [observacao, setObservacao] = useState('');
  const [lembreteCanal, setLembreteCanal] = useState<'whatsapp' | 'email'>('whatsapp');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Agendamento | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadBusiness = useCallback(async () => {
    setLoadingBusiness(true);
    setBusinessError(null);
    try {
      const data = await api.getPublicBusiness(slug);
      setPayload(data);
      if (data.servicos.length > 0) {
        setSelectedServiceId((prev) =>
          prev && data.servicos.some((s) => s.id === prev) ? prev : data.servicos[0].id
        );
      }
      if (data.profissionais.length > 0) {
        setSelectedProfId((prev) =>
          prev && data.profissionais.some((p) => p.id === prev) ? prev : data.profissionais[0].id
        );
      }
      setLembreteCanal(data.negocio.lembrete_canal === 'email' ? 'email' : 'whatsapp');
    } catch (err) {
      setBusinessError(
        err instanceof Error ? err.message : 'Não foi possível carregar o estabelecimento.'
      );
    } finally {
      setLoadingBusiness(false);
    }
  }, [slug]);

  useEffect(() => {
    loadBusiness();
  }, [loadBusiness]);

  const fetchSlots = useCallback(async () => {
    if (!selectedProfId || !selectedServiceId || !selectedDate) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    try {
      const res = await api.getDisponibilidade({
        slug,
        profissionalId: selectedProfId,
        servicoId: selectedServiceId,
        data: selectedDate,
        agora: getLocalNowYYYYMMDDTHHMM(),
      });
      setSlots(res.slots);
      setSelectedSlot((prev) =>
        prev && res.slots.some((s) => s.hora_inicio === prev.hora_inicio) ? prev : null
      );
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, selectedProfId, selectedServiceId, selectedDate]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  const dateStrip = useMemo(() => {
    const today = getLocalTodayYYYYMMDD();
    return Array.from({ length: 14 }, (_, idx) => {
      const iso = addDaysToYYYYMMDD(today, idx);
      const [y, m, d] = iso.split('-').map(Number);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return {
        iso,
        dayNum: String(d).padStart(2, '0'),
        weekdayIndex: dt.getDay(),
        weekdayLabel: idx === 0 ? 'Hoje' : idx === 1 ? 'Amanhã' : DIAS_SEMANA_CURTO[dt.getDay()],
        monthLabel: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      };
    });
  }, []);

  const selectedService = useMemo(
    () => payload?.servicos.find((s) => s.id === selectedServiceId) || null,
    [payload, selectedServiceId]
  );

  const selectedProf = useMemo(
    () => payload?.profissionais.find((p) => p.id === selectedProfId) || null,
    [payload, selectedProfId]
  );

  const morningSlots = useMemo(
    () => slots.filter((s) => s.hora_inicio < '12:00'),
    [slots]
  );

  const afternoonSlots = useMemo(
    () => slots.filter((s) => s.hora_inicio >= '12:00'),
    [slots]
  );

  const handleCopyPublicLink = async () => {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfId || !selectedServiceId || !selectedSlot) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.createPublicAgendamento(slug, {
        profissional_id: selectedProfId,
        servico_id: selectedServiceId,
        data: selectedDate,
        hora_inicio: selectedSlot.hora_inicio,
        cliente_nome: clienteNome,
        cliente_telefone: clienteTelefone,
        cliente_email: clienteEmail,
        observacao,
        lembrete_canal: lembreteCanal,
      });
      setConfirmedBooking(res.agendamento);
      await fetchSlots();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError(err.message);
        await fetchSlots();
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Erro ao confirmar agendamento.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingBusiness) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="h-44 bg-slate-200/70 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <div className="h-40 bg-slate-200/70 rounded-xl animate-pulse" />
            <div className="h-40 bg-slate-200/70 rounded-xl animate-pulse" />
          </div>
          <div className="lg:col-span-4 h-72 bg-slate-200/70 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (businessError || !payload) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-slate-900">
            Página de agendamento não encontrada
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {businessError || `O link /${slug} não corresponde a nenhum negócio cadastrado.`}
          </p>
          <button
            type="button"
            onClick={onNavigateOwner}
            className="mt-6 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Ir para o Painel do Dono
          </button>
        </div>
      </div>
    );
  }

  const { negocio, servicos, profissionais } = payload;

  if (confirmedBooking) {
    const reminderText = buildReminderMessage({
      clienteNome: confirmedBooking.cliente_nome,
      negocioNome: negocio.nome,
      servicoNome: confirmedBooking.servico_nome || selectedService?.nome || '',
      profissionalNome: confirmedBooking.profissional_nome || selectedProf?.nome || '',
      inicioIso: confirmedBooking.inicio,
      endereco: negocio.endereco,
    });
    const waHref = buildWhatsAppHref(negocio.telefone, reminderText);

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 text-emerald-700 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-emerald-700">Horário reservado</p>
              <h1 className="text-2xl font-semibold text-slate-900">
                Agendamento confirmado
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Seu horário na <strong className="text-slate-900">{negocio.nome}</strong> foi bloqueado
            exclusivamente para você.
          </p>

          <dl className="mt-6 divide-y divide-slate-100 border-t border-b border-slate-200 text-sm">
            <div className="py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Serviço</dt>
              <dd className="font-medium text-slate-900 text-right">
                {confirmedBooking.servico_nome}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Profissional</dt>
              <dd className="font-medium text-slate-900 text-right">
                {confirmedBooking.profissional_nome}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Data e horário</dt>
              <dd className="font-mono tabular-nums font-medium text-slate-900 text-right">
                {formatDateBRShort(confirmedBooking.inicio.slice(0, 10))} ·{' '}
                {confirmedBooking.inicio.slice(11, 16)} – {confirmedBooking.fim.slice(11, 16)}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Valor</dt>
              <dd className="font-mono tabular-nums font-semibold text-slate-900 text-right">
                {formatBRL(confirmedBooking.servico_preco ?? selectedService?.preco ?? 0)}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-4">
              <dt className="text-slate-500">Local</dt>
              <dd className="text-slate-700 text-right">{negocio.endereco}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              Confirmar no WhatsApp
            </a>
            <button
              type="button"
              onClick={() => {
                setConfirmedBooking(null);
                setSelectedSlot(null);
                setObservacao('');
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Fazer outro agendamento
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Storefront Header */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div>
            <p className="text-xs font-medium text-teal-700">Agendamento online imediato</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              {negocio.nome}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                {negocio.endereco}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                {negocio.telefone}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Link público:{' '}
              <span className="font-mono text-slate-700">/{negocio.slug}</span>
            </div>
            <button
              type="button"
              onClick={handleCopyPublicLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Link copiado' : 'Copiar link'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 min-h-[200px] lg:min-h-full relative bg-slate-100">
          <SmartImage
            src={negocio.capa_url}
            alt={`Interior de ${negocio.nome}`}
            fallbackType="banner"
            className="w-full h-full object-cover lg:h-full"
          />
        </div>
      </section>

      {/* Main 2-column booking flow */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-8">
          {/* 01. Serviços */}
          <section id="servicos" className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">01. Escolha o serviço</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {servicos.length} disponíveis
              </span>
            </div>

            {servicos.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Nenhum serviço ativo no momento.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-b border-slate-100">
                {servicos.map((serv) => {
                  const active = serv.id === selectedServiceId;
                  return (
                    <button
                      key={serv.id}
                      type="button"
                      onClick={() => setSelectedServiceId(serv.id)}
                      className={`w-full py-3.5 px-3 text-left flex items-center justify-between gap-4 transition-colors rounded-lg ${
                        active ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            active ? 'border-teal-700 bg-teal-700' : 'border-slate-300 bg-white'
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {serv.nome}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 tabular-nums">
                            <span>{serv.duracao_min} min</span>
                          </div>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-semibold text-slate-900 shrink-0">
                        {formatBRL(serv.preco)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 02. Profissionais */}
          <section id="profissionais" className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-slate-900">02. Escolha o profissional</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {profissionais.length} ativos
              </span>
            </div>

            {profissionais.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">
                Nenhum profissional ativo no momento.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {profissionais.map((prof) => {
                  const active = prof.id === selectedProfId;
                  const initials = prof.nome
                    .split(' ')
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join('');
                  return (
                    <button
                      key={prof.id}
                      type="button"
                      onClick={() => setSelectedProfId(prof.id)}
                      className={`p-3.5 text-left rounded-xl border transition-colors flex flex-col gap-3 ${
                        active
                          ? 'border-teal-700 bg-teal-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <SmartImage
                          src={prof.foto_url}
                          alt={prof.nome}
                          initials={initials}
                          className="w-11 h-11 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {prof.nome}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {prof.especialidade || 'Especialista'}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 03. Dia e Horários Livres */}
          <section id="horarios" className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">03. Escolha o dia e horário</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Horários calculados em tempo real considerando expediente, pausas e agendamentos.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  min={getLocalTodayYYYYMMDD()}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  aria-label="Selecionar data no calendário"
                  className="px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
                <button
                  type="button"
                  onClick={fetchSlots}
                  title="Atualizar horários livres"
                  className="p-2 text-slate-500 border border-slate-200 rounded-lg hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSlots ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 14-day quick selector */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
              {dateStrip.map((d) => {
                const isSelected = d.iso === selectedDate;
                const profWorksThatDay = selectedProf
                  ? selectedProf.horarios.some((h) => h.dia_semana === d.weekdayIndex)
                  : true;
                return (
                  <button
                    key={d.iso}
                    type="button"
                    onClick={() => setSelectedDate(d.iso)}
                    className={`min-w-[70px] px-3 py-2 rounded-lg border text-center transition-colors shrink-0 ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : profWorksThatDay
                        ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        : 'bg-slate-50 border-slate-100 text-slate-400'
                    }`}
                  >
                    <div className="text-[11px] font-medium whitespace-nowrap">
                      {d.weekdayLabel}
                    </div>
                    <div className="text-base font-semibold font-mono tabular-nums mt-0.5">
                      {d.dayNum}
                    </div>
                    <div className="text-[10px] opacity-75">{d.monthLabel}</div>
                  </button>
                );
              })}
            </div>

            {/* Available slots */}
            {loadingSlots ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="py-8 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Calendar className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">
                  Nenhum horário livre para {formatDateBRLong(selectedDate)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  O profissional não atende nesta data ou todos os horários já foram preenchidos.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {morningSlots.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-slate-500 mb-2.5">Manhã</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {morningSlots.map((slot) => {
                        const active = selectedSlot?.hora_inicio === slot.hora_inicio;
                        return (
                          <button
                            key={slot.hora_inicio}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              setSubmitError(null);
                            }}
                            className={`py-2.5 px-2 rounded-lg border font-mono tabular-nums text-sm font-medium transition-colors ${
                              active
                                ? 'bg-teal-700 border-teal-700 text-white'
                                : 'bg-white border-slate-200 text-slate-800 hover:border-teal-700 hover:text-teal-800'
                            }`}
                          >
                            {slot.hora_inicio}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {afternoonSlots.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-slate-500 mb-2.5">Tarde e Noite</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {afternoonSlots.map((slot) => {
                        const active = selectedSlot?.hora_inicio === slot.hora_inicio;
                        return (
                          <button
                            key={slot.hora_inicio}
                            type="button"
                            onClick={() => {
                              setSelectedSlot(slot);
                              setSubmitError(null);
                            }}
                            className={`py-2.5 px-2 rounded-lg border font-mono tabular-nums text-sm font-medium transition-colors ${
                              active
                                ? 'bg-teal-700 border-teal-700 text-white'
                                : 'bg-white border-slate-200 text-slate-800 hover:border-teal-700 hover:text-teal-800'
                            }`}
                          >
                            {slot.hora_inicio}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 04. Seus dados */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">04. Seus dados para contato</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nome completo
                </label>
                <input
                  type="text"
                  required
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder="Ex.: Carlos Eduardo"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  WhatsApp / Telefone
                </label>
                <input
                  type="tel"
                  required
                  value={clienteTelefone}
                  onChange={(e) => setClienteTelefone(formatPhoneInput(e.target.value))}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  value={clienteEmail}
                  onChange={(e) => setClienteEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Receber lembrete por
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setLembreteCanal('whatsapp')}
                    className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                      lembreteCanal === 'whatsapp'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setLembreteCanal('email')}
                    className={`py-2 px-3 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors ${
                      lembreteCanal === 'email'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    E-mail
                  </button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Preferência de corte, referência ou recado para o profissional"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Sticky booking summary */}
        <aside className="lg:col-span-4 lg:sticky lg:top-24 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="text-base font-semibold text-slate-900">Resumo do agendamento</h3>

          <dl className="divide-y divide-slate-100 border-t border-b border-slate-100 text-sm">
            <div className="py-3 flex justify-between gap-3">
              <dt className="text-slate-500">Serviço</dt>
              <dd className="font-medium text-slate-900 text-right">
                {selectedService ? selectedService.nome : 'Selecione'}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-3">
              <dt className="text-slate-500">Duração</dt>
              <dd className="font-mono tabular-nums text-slate-700 text-right">
                {selectedService ? `${selectedService.duracao_min} min` : '—'}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-3">
              <dt className="text-slate-500">Profissional</dt>
              <dd className="font-medium text-slate-900 text-right">
                {selectedProf ? selectedProf.nome : 'Selecione'}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-3">
              <dt className="text-slate-500">Data</dt>
              <dd className="font-mono tabular-nums text-slate-900 text-right">
                {formatDateBRShort(selectedDate)}
              </dd>
            </div>
            <div className="py-3 flex justify-between gap-3">
              <dt className="text-slate-500">Horário</dt>
              <dd className="font-mono tabular-nums font-medium text-teal-800 text-right">
                {selectedSlot ? `${selectedSlot.hora_inicio} – ${selectedSlot.hora_fim}` : 'Escolha um horário'}
              </dd>
            </div>
            <div className="py-3.5 flex justify-between gap-3">
              <dt className="font-medium text-slate-900">Total</dt>
              <dd className="font-mono tabular-nums text-base font-bold text-slate-900 text-right">
                {selectedService ? formatBRL(selectedService.preco) : '—'}
              </dd>
            </div>
          </dl>

          {submitError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedSlot || !selectedService || !selectedProf}
            className="w-full py-3 px-4 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4" />
            {submitting
              ? 'Verificando e reservando...'
              : selectedSlot
              ? `Confirmar às ${selectedSlot.hora_inicio}`
              : 'Selecione um horário livre'}
          </button>

          <p className="text-xs text-slate-500 leading-relaxed">
            Bloqueio automático de conflitos: ao confirmar, o horário é verificado em transação no
            banco de dados para impedir reservas simultâneas.
          </p>
        </aside>
      </form>
    </div>
  );
}
