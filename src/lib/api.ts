import type {
  Agendamento,
  AppointmentStatus,
  DashboardSummary,
  HorarioTrabalho,
  LembreteLog,
  Negocio,
  Profissional,
  PublicBusinessPayload,
  Servico,
  SlotDisponivel,
} from '../shared/types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'Erro ao comunicar com o servidor.');
  }
  return data as T;
}

export const api = {
  getDefaultSlug: () => request<{ slug: string }>('/api/public/default-slug'),

  getPublicBusiness: (slug: string) =>
    request<PublicBusinessPayload>(`/api/public/${encodeURIComponent(slug)}`),

  getDisponibilidade: (params: {
    slug: string;
    profissionalId: number;
    servicoId: number;
    data: string;
    agora?: string;
    excludeAgendamentoId?: number;
  }) => {
    const qs = new URLSearchParams({
      profissionalId: String(params.profissionalId),
      servicoId: String(params.servicoId),
      data: params.data,
    });
    if (params.agora) qs.set('agora', params.agora);
    if (params.excludeAgendamentoId) {
      qs.set('excludeAgendamentoId', String(params.excludeAgendamentoId));
    }
    return request<{
      data: string;
      dia_semana: number;
      passo_min: number;
      duracao_min: number;
      slots: SlotDisponivel[];
    }>(`/api/public/${encodeURIComponent(params.slug)}/disponibilidade?${qs.toString()}`);
  },

  createPublicAgendamento: (
    slug: string,
    payload: {
      profissional_id: number;
      servico_id: number;
      data: string;
      hora_inicio: string;
      cliente_nome: string;
      cliente_telefone: string;
      cliente_email?: string;
      observacao?: string;
      lembrete_canal?: 'whatsapp' | 'email' | 'ambos';
    }
  ) =>
    request<{ agendamento: Agendamento }>(`/api/public/${encodeURIComponent(slug)}/agendamentos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Owner endpoints
  getOwnerOverview: (hoje: string) =>
    request<DashboardSummary>(`/api/owner/overview?hoje=${encodeURIComponent(hoje)}`),

  getOwnerNegocio: () => request<{ negocio: Negocio }>('/api/owner/negocio'),

  updateOwnerNegocio: (payload: Partial<Negocio>) =>
    request<{ negocio: Negocio }>('/api/owner/negocio', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getOwnerServicos: () => request<{ servicos: Servico[] }>('/api/owner/servicos'),

  createServico: (payload: { nome: string; duracao_min: number; preco: number }) =>
    request<{ servico: Servico }>('/api/owner/servicos', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateServico: (id: number, payload: Partial<Servico>) =>
    request<{ servico: Servico }>(`/api/owner/servicos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteServico: (id: number) =>
    request<{ deleted: boolean; deactivated: boolean }>(`/api/owner/servicos/${id}`, {
      method: 'DELETE',
    }),

  getOwnerProfissionais: () =>
    request<{ profissionais: Array<Profissional & { horarios: HorarioTrabalho[] }> }>(
      '/api/owner/profissionais'
    ),

  createProfissional: (payload: { nome: string; especialidade: string }) =>
    request<{ profissional: Profissional & { horarios: HorarioTrabalho[] } }>(
      '/api/owner/profissionais',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateProfissional: (id: number, payload: Partial<Profissional>) =>
    request<{ profissional: Profissional & { horarios: HorarioTrabalho[] } }>(
      `/api/owner/profissionais/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  updateProfissionalHorarios: (
    id: number,
    horarios: Array<Pick<HorarioTrabalho, 'dia_semana' | 'hora_inicio' | 'hora_fim'>>
  ) =>
    request<{ horarios: HorarioTrabalho[] }>(`/api/owner/profissionais/${id}/horarios`, {
      method: 'PUT',
      body: JSON.stringify({ horarios }),
    }),

  getOwnerAgendamentos: (params: {
    dataInicio: string;
    dataFim: string;
    profissionalId?: number | null;
    status?: string;
  }) => {
    const qs = new URLSearchParams({
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
    });
    if (params.profissionalId) qs.set('profissionalId', String(params.profissionalId));
    if (params.status) qs.set('status', params.status);
    return request<{ agendamentos: Agendamento[] }>(`/api/owner/agendamentos?${qs.toString()}`);
  },

  updateAgendamentoStatus: (id: number, status: AppointmentStatus) =>
    request<{ agendamento: Agendamento }>(`/api/owner/agendamentos/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  remarcarAgendamento: (
    id: number,
    payload: { data: string; hora_inicio: string; profissional_id?: number }
  ) =>
    request<{ agendamento: Agendamento }>(`/api/owner/agendamentos/${id}/remarcar`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  enviarLembrete: (id: number, payload: { canal: 'whatsapp' | 'email'; mensagem: string }) =>
    request<{ agendamento: Agendamento }>(`/api/owner/agendamentos/${id}/lembrete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLembretesLog: () => request<{ logs: Array<LembreteLog & { cliente_nome: string; inicio: string }> }>('/api/owner/lembretes'),
};
