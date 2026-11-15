export type AppointmentStatus = 'confirmado' | 'cancelado' | 'concluido' | 'faltou';
export type ReminderChannel = 'whatsapp' | 'email' | 'ambos';

export interface Negocio {
  id: number;
  nome: string;
  telefone: string;
  endereco: string;
  slug: string;
  passo_min: number;
  lembrete_canal: ReminderChannel;
  capa_url: string | null;
}

export interface Servico {
  id: number;
  negocio_id: number;
  nome: string;
  duracao_min: number;
  preco: number;
  ativo: number;
}

export interface Profissional {
  id: number;
  negocio_id: number;
  nome: string;
  especialidade: string;
  foto_url: string | null;
  ativo: number;
}

export interface HorarioTrabalho {
  id: number;
  profissional_id: number;
  dia_semana: number; // 0 = Domingo, 1 = Segunda ... 6 = Sábado
  hora_inicio: string; // HH:MM
  hora_fim: string; // HH:MM
}

export interface Agendamento {
  id: number;
  profissional_id: number;
  servico_id: number;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_email: string;
  inicio: string; // YYYY-MM-DDTHH:MM
  fim: string; // YYYY-MM-DDTHH:MM
  status: AppointmentStatus;
  observacao: string;
  lembrete_enviado_em: string | null;
  lembrete_canal: string | null;
  criado_em: string;
  // Joined fields for UI convenience
  profissional_nome?: string;
  servico_nome?: string;
  servico_duracao_min?: number;
  servico_preco?: number;
}

export interface LembreteLog {
  id: number;
  agendamento_id: number;
  canal: 'whatsapp' | 'email';
  destinatario: string;
  mensagem: string;
  enviado_em: string;
}

export interface SlotDisponivel {
  hora_inicio: string; // HH:MM
  hora_fim: string; // HH:MM
  inicio_iso: string; // YYYY-MM-DDTHH:MM
  fim_iso: string; // YYYY-MM-DDTHH:MM
}

export interface PublicBusinessPayload {
  negocio: Negocio;
  servicos: Servico[];
  profissionais: Array<Profissional & { horarios: HorarioTrabalho[] }>;
}

export interface DashboardSummary {
  negocio: Negocio;
  hoje_total: number;
  hoje_confirmados: number;
  hoje_receita_prevista: number;
  taxa_comparecimento: number;
}
