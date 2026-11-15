import { useCallback, useEffect, useState } from 'react';
import { Clock, Plus, Save, Trash2, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api.ts';
import { DIAS_SEMANA_COMPLETO } from '../lib/formatters.ts';
import { SmartImage } from './SmartImage.tsx';
import type { HorarioTrabalho, Profissional } from '../shared/types.ts';

interface ProfessionalsManagerViewProps {
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

type ProfWithHorarios = Profissional & { horarios: HorarioTrabalho[] };
type DraftHorario = { dia_semana: number; hora_inicio: string; hora_fim: string };

export function ProfessionalsManagerView({ onToast }: ProfessionalsManagerViewProps) {
  const [profissionais, setProfissionais] = useState<ProfWithHorarios[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<number | null>(null);
  const [draftHorarios, setDraftHorarios] = useState<DraftHorario[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingHorarios, setSavingHorarios] = useState(false);

  // Add/Edit Professional Modal
  const [showProfModal, setShowProfModal] = useState(false);
  const [editingProf, setEditingProf] = useState<ProfWithHorarios | null>(null);
  const [profNome, setProfNome] = useState('');
  const [profEspecialidade, setProfEspecialidade] = useState('');
  const [savingProf, setSavingProf] = useState(false);

  const loadProfissionais = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getOwnerProfissionais();
      setProfissionais(res.profissionais);
      if (res.profissionais.length > 0) {
        const target =
          res.profissionais.find((p) => p.id === selectedProfId) || res.profissionais[0];
        setSelectedProfId(target.id);
        setDraftHorarios(
          target.horarios.map((h) => ({
            dia_semana: h.dia_semana,
            hora_inicio: h.hora_inicio,
            hora_fim: h.hora_fim,
          }))
        );
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao carregar profissionais.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast, selectedProfId]);

  useEffect(() => {
    loadProfissionais();
  }, [loadProfissionais]);

  const handleSelectProf = (prof: ProfWithHorarios) => {
    setSelectedProfId(prof.id);
    setDraftHorarios(
      prof.horarios.map((h) => ({
        dia_semana: h.dia_semana,
        hora_inicio: h.hora_inicio,
        hora_fim: h.hora_fim,
      }))
    );
  };

  const selectedProf = profissionais.find((p) => p.id === selectedProfId) || null;

  const addWindowForDay = (dia: number) => {
    const existingForDay = draftHorarios.filter((h) => h.dia_semana === dia);
    const defaultStart = existingForDay.length === 0 ? '09:00' : '13:30';
    const defaultEnd = existingForDay.length === 0 ? '12:00' : '19:00';
    setDraftHorarios((prev) => [
      ...prev,
      { dia_semana: dia, hora_inicio: defaultStart, hora_fim: defaultEnd },
    ]);
  };

  const updateWindow = (
    idxInAll: number,
    field: 'hora_inicio' | 'hora_fim',
    value: string
  ) => {
    setDraftHorarios((prev) =>
      prev.map((item, i) => (i === idxInAll ? { ...item, [field]: value } : item))
    );
  };

  const removeWindow = (idxInAll: number) => {
    setDraftHorarios((prev) => prev.filter((_, i) => i !== idxInAll));
  };

  const handleSaveHorarios = async () => {
    if (!selectedProf) return;
    setSavingHorarios(true);
    try {
      await api.updateProfissionalHorarios(selectedProf.id, draftHorarios);
      onToast(`Grade de horários de ${selectedProf.nome} atualizada.`);
      await loadProfissionais();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao salvar horários.', 'error');
    } finally {
      setSavingHorarios(false);
    }
  };

  const openNewProf = () => {
    setEditingProf(null);
    setProfNome('');
    setProfEspecialidade('');
    setShowProfModal(true);
  };

  const openEditProf = (p: ProfWithHorarios) => {
    setEditingProf(p);
    setProfNome(p.nome);
    setProfEspecialidade(p.especialidade);
    setShowProfModal(true);
  };

  const handleSaveProf = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProf(true);
    try {
      if (editingProf) {
        await api.updateProfissional(editingProf.id, {
          nome: profNome,
          especialidade: profEspecialidade,
        });
        onToast('Profissional atualizado.');
      } else {
        const res = await api.createProfissional({
          nome: profNome,
          especialidade: profEspecialidade,
        });
        setSelectedProfId(res.profissional.id);
        onToast('Profissional cadastrado com horários padrão.');
      }
      setShowProfModal(false);
      await loadProfissionais();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao salvar profissional.', 'error');
    } finally {
      setSavingProf(false);
    }
  };

  const handleToggleProfActive = async (p: ProfWithHorarios) => {
    try {
      await api.updateProfissional(p.id, { ativo: p.ativo === 1 ? 0 : 1 });
      onToast(p.ativo === 1 ? 'Profissional desativado.' : 'Profissional reativado.');
      await loadProfissionais();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erro ao alterar status.', 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Profissionais e Horários de Trabalho
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cadastre múltiplas faixas por dia (ex.: manhã e tarde) para configurar pausas de almoço.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewProf}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          Novo Profissional
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 h-64 bg-slate-200/70 rounded-xl animate-pulse" />
          <div className="lg:col-span-8 h-96 bg-slate-200/70 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Professionals list */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {profissionais.map((p) => {
              const selected = p.id === selectedProfId;
              const initials = p.nome
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('');
              return (
                <div
                  key={p.id}
                  className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                    selected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProf(p)}
                    className="flex items-center gap-3 text-left min-w-0 flex-1"
                  >
                    <SmartImage
                      src={p.foto_url}
                      alt={p.nome}
                      initials={initials}
                      className="w-11 h-11 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{p.nome}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {p.especialidade || 'Especialista'} ·{' '}
                        <span className={p.ativo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                          {p.ativo === 1 ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditProf(p)}
                      className="px-2 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-white"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleProfActive(p)}
                      className="px-2 py-1 text-xs font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-white"
                    >
                      {p.ativo === 1 ? 'Pausar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </aside>

          {/* Work Schedule Matrix */}
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            {selectedProf ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-700" />
                      Expediente semanal — {selectedProf.nome}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tabela <span className="font-mono">horario_trabalho</span> · adicione 2 faixas no mesmo dia para pausa de almoço.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={savingHorarios}
                    onClick={handleSaveHorarios}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingHorarios ? 'Salvando...' : 'Salvar Horários'}
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5, 6, 0].map((dia) => {
                    const dayEntries = draftHorarios
                      .map((item, idx) => ({ item, idx }))
                      .filter((x) => x.item.dia_semana === dia);

                    return (
                      <div
                        key={dia}
                        className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                      >
                        <div className="w-40 shrink-0">
                          <div className="text-sm font-medium text-slate-900">
                            {DIAS_SEMANA_COMPLETO[dia]}
                          </div>
                          <div className="text-xs text-slate-500">
                            {dayEntries.length === 0
                              ? 'Fechado / Folga'
                              : `${dayEntries.length} ${dayEntries.length === 1 ? 'faixa' : 'faixas'}`}
                          </div>
                        </div>

                        <div className="flex-1 space-y-2">
                          {dayEntries.map(({ item, idx }) => (
                            <div key={idx} className="flex flex-wrap items-center gap-2">
                              <input
                                type="time"
                                value={item.hora_inicio}
                                onChange={(e) => updateWindow(idx, 'hora_inicio', e.target.value)}
                                className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                              <span className="text-xs text-slate-400">até</span>
                              <input
                                type="time"
                                value={item.hora_fim}
                                onChange={(e) => updateWindow(idx, 'hora_fim', e.target.value)}
                                className="px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded-lg bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => removeWindow(idx)}
                                title="Remover faixa"
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => addWindowForDay(dia)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {dayEntries.length === 0 ? 'Adicionar expediente' : 'Adicionar faixa (ex.: pós-almoço)'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Selecione um profissional.</p>
            )}
          </section>
        </div>
      )}

      {showProfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingProf ? 'Editar profissional' : 'Novo profissional'}
              </h2>
              <button
                type="button"
                onClick={() => setShowProfModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProf} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={profNome}
                  onChange={(e) => setProfNome(e.target.value)}
                  placeholder="Ex.: Bruno Almeida"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Especialidade
                </label>
                <input
                  type="text"
                  value={profEspecialidade}
                  onChange={(e) => setProfEspecialidade(e.target.value)}
                  placeholder="Ex.: Barba e corte clássico"
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingProf}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  {savingProf ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
