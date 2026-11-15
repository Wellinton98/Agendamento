import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '../lib/api.ts';
import { formatBRL } from '../lib/formatters.ts';
import type { Servico } from '../shared/types.ts';

interface ServicesManagerViewProps {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export function ServicesManagerView({ onToast }: ServicesManagerViewProps) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Servico | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [duracaoMin, setDuracaoMin] = useState(30);
  const [preco, setPreco] = useState(50);
  const [saving, setSaving] = useState(false);

  const loadServicos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getOwnerServicos();
      setServicos(res.servicos);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao carregar serviços.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadServicos();
  }, [loadServicos]);

  const openCreate = () => {
    setEditing(null);
    setNome('');
    setDuracaoMin(30);
    setPreco(50);
    setShowForm(true);
  };

  const openEdit = (s: Servico) => {
    setEditing(s);
    setNome(s.nome);
    setDuracaoMin(s.duracao_min);
    setPreco(s.preco);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.updateServico(editing.id, {
          nome,
          duracao_min: Number(duracaoMin),
          preco: Number(preco),
        });
        onToast('Serviço atualizado.');
      } else {
        await api.createServico({
          nome,
          duracao_min: Number(duracaoMin),
          preco: Number(preco),
        });
        onToast('Serviço cadastrado.');
      }
      setShowForm(false);
      await loadServicos();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao salvar serviço.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (s: Servico) => {
    try {
      await api.updateServico(s.id, { ativo: s.ativo === 1 ? 0 : 1 });
      onToast(s.ativo === 1 ? 'Serviço desativado.' : 'Serviço reativado.');
      await loadServicos();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao alterar serviço.', 'error');
    }
  };

  const handleDelete = async (s: Servico) => {
    try {
      const res = await api.deleteServico(s.id);
      onToast(
        res.deactivated
          ? 'Serviço desativado (possui agendamentos no histórico).'
          : 'Serviço excluído.'
      );
      await loadServicos();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao excluir serviço.', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catálogo de Serviços</h1>
          <p className="text-sm text-slate-600 mt-1">
            A duração de cada serviço define o tamanho exato do bloco ocupado na agenda.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Novo Serviço
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : servicos.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <h2 className="text-base font-semibold text-slate-900">Nenhum serviço cadastrado</h2>
            <p className="text-sm text-slate-500 mt-1">
              Cadastre os serviços do seu estabelecimento para liberar a página pública.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
            >
              Cadastrar Primeiro Serviço
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Serviço</th>
                  <th className="py-3 px-4">Duração</th>
                  <th className="py-3 px-4">Preço</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {servicos.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-900">{s.nome}</td>
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700">
                      {s.duracao_min} min
                    </td>
                    <td className="py-3.5 px-4 font-mono tabular-nums font-medium text-slate-900">
                      {formatBRL(s.preco)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium">
                      <span className={s.ativo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                        {s.ativo === 1 ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(s)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          {s.ativo === 1 ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          title="Excluir serviço"
                          className="p-1.5 text-red-600 border border-slate-200 rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editing ? 'Editar serviço' : 'Novo serviço'}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome do serviço
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Corte Masculino"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Duração (minutos)
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={480}
                    step={5}
                    value={duracaoMin}
                    onChange={(e) => setDuracaoMin(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    value={preco}
                    onChange={(e) => setPreco(Number(e.target.value))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  {saving ? 'Salvando...' : 'Salvar Serviço'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
