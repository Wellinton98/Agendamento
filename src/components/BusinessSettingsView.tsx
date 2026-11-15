import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Mail, MessageCircle, Save } from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatDateBRShort, formatPhoneInput } from '../lib/formatters.ts';
import type { LembreteLog, Negocio, ReminderChannel } from '../shared/types.ts';

interface BusinessSettingsViewProps {
  onToast: (msg: string, type?: 'success' | 'error') => void;
  onSlugUpdated: (newSlug: string) => void;
  onOpenPublicSlug: (slug: string) => void;
}

export function BusinessSettingsView({
  onToast,
  onSlugUpdated,
  onOpenPublicSlug,
}: BusinessSettingsViewProps) {
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [slug, setSlug] = useState('');
  const [passoMin, setPassoMin] = useState<number>(30);
  const [lembreteCanal, setLembreteCanal] = useState<ReminderChannel>('whatsapp');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [logs, setLogs] = useState<Array<LembreteLog & { cliente_nome: string; inicio: string }>>(
    []
  );

  const loadSettings = useCallback(async () => {
    try {
      const [negRes, logRes] = await Promise.all([api.getOwnerNegocio(), api.getLembretesLog()]);
      setNegocio(negRes.negocio);
      setNome(negRes.negocio.nome);
      setTelefone(negRes.negocio.telefone);
      setEndereco(negRes.negocio.endereco);
      setSlug(negRes.negocio.slug);
      setPassoMin(negRes.negocio.passo_min);
      setLembreteCanal(negRes.negocio.lembrete_canal);
      setLogs(logRes.logs);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao carregar configurações.', 'error');
    }
  }, [onToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateOwnerNegocio({
        nome,
        telefone,
        endereco,
        slug,
        passo_min: passoMin,
        lembrete_canal: lembreteCanal,
      });
      setNegocio(res.negocio);
      setSlug(res.negocio.slug);
      onSlugUpdated(res.negocio.slug);
      onToast('Configurações do estabelecimento atualizadas.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao salvar configurações.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    const url = `${window.location.origin}/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Configurações do Negócio e Lembretes
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Personalize o link público de agendamento, a granularidade dos horários livres e o canal de lembretes.
        </p>
      </div>

      {/* Shareable Public Link Bar */}
      {negocio && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Seu link público de agendamento</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {window.location.origin}/{negocio.slug}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
            <button
              type="button"
              onClick={() => onOpenPublicSlug(negocio.slug)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Página Pública
            </button>
          </div>
        </section>
      )}

      {/* Business Form */}
      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      >
        <h2 className="text-lg font-semibold text-slate-900">Dados do estabelecimento</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Nome do estabelecimento
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Telefone / WhatsApp comercial
            </label>
            <input
              type="tel"
              required
              value={telefone}
              onChange={(e) => setTelefone(formatPhoneInput(e.target.value))}
              className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-lg"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Endereço</label>
            <input
              type="text"
              required
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Slug da página pública
            </label>
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <span className="px-3 py-2 text-xs font-mono text-slate-500 bg-slate-50 border-r border-slate-200">
                /
              </span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="flex-1 px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Passo de geração de horários livres
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPassoMin(15)}
                className={`py-2 text-xs font-medium rounded-md ${
                  passoMin === 15 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                A cada 15 min
              </button>
              <button
                type="button"
                onClick={() => setPassoMin(30)}
                className={`py-2 text-xs font-medium rounded-md ${
                  passoMin === 30 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                A cada 30 min
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Canal padrão de lembrete
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg max-w-md">
              {(['whatsapp', 'email', 'ambos'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setLembreteCanal(ch)}
                  className={`py-2 text-xs font-medium rounded-md capitalize ${
                    lembreteCanal === ch ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'E-mail' : 'Ambos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </form>

      {/* Reminder Log History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Histórico de lembretes enviados</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro dos lembretes disparados pelo painel para reduzir faltas.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {logs.length} registros
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Nenhum lembrete disparado manualmente nesta sessão ainda. Use o botão{' '}
            <strong>Enviar lembrete</strong> na Agenda para registrar envios por WhatsApp ou E-mail.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-3.5 flex items-start justify-between gap-4 text-sm">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {log.canal === 'whatsapp' ? (
                      <MessageCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <Mail className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <span className="font-medium text-slate-900">{log.cliente_nome}</span>
                    <span className="text-xs font-mono text-slate-500">{log.destinatario}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{log.mensagem}</p>
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                  Ag. {formatDateBRShort(log.inicio.slice(0, 10))} {log.inicio.slice(11, 16)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
