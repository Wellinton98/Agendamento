import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { db, initDatabase } from './src/server/db.ts';
import {
  computeAvailableSlots,
  formatDateYYYYMMDD,
  getDayOfWeekFromYYYYMMDD,
  isWithinWorkWindows,
  minutesToTime,
  timeToMinutes,
} from './src/server/availability.ts';
import type {
  Agendamento,
  AppointmentStatus,
  HorarioTrabalho,
  Negocio,
  Profissional,
  Servico,
} from './src/shared/types.ts';

initDatabase();

const app = express();
app.use(express.json());

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getDefaultBusiness(): Negocio {
  const row = db.prepare('SELECT * FROM negocio ORDER BY id ASC LIMIT 1').get() as Negocio | undefined;
  if (!row) {
    throw new HttpError(404, 'Nenhum negócio cadastrado.');
  }
  return row;
}

function getBusinessBySlug(slug: string): Negocio {
  const row = db.prepare('SELECT * FROM negocio WHERE slug = ?').get(slug) as Negocio | undefined;
  if (!row) {
    throw new HttpError(404, `Negócio "/${slug}" não encontrado.`);
  }
  return row;
}

function sanitizeSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// PUBLIC ROUTES (Página Pública de Agendamento /:slug)
// ---------------------------------------------------------------------------

app.get('/api/public/default-slug', (_req, res) => {
  const negocio = getDefaultBusiness();
  res.json({ slug: negocio.slug });
});

app.get('/api/public/:slug', (req, res, next) => {
  try {
    const negocio = getBusinessBySlug(req.params.slug);
    const servicos = db
      .prepare('SELECT * FROM servico WHERE negocio_id = ? AND ativo = 1 ORDER BY preco ASC, nome ASC')
      .all(negocio.id) as Servico[];
    const profissionaisRaw = db
      .prepare('SELECT * FROM profissional WHERE negocio_id = ? AND ativo = 1 ORDER BY id ASC')
      .all(negocio.id) as Profissional[];

    const getHorarios = db.prepare(
      'SELECT * FROM horario_trabalho WHERE profissional_id = ? ORDER BY dia_semana ASC, hora_inicio ASC'
    );
    const profissionais = profissionaisRaw.map((p) => ({
      ...p,
      horarios: getHorarios.all(p.id) as HorarioTrabalho[],
    }));

    res.json({ negocio, servicos, profissionais });
  } catch (err) {
    next(err);
  }
});

app.get('/api/public/:slug/disponibilidade', (req, res, next) => {
  try {
    const negocio = getBusinessBySlug(req.params.slug);
    const profissionalId = Number(req.query.profissionalId);
    const servicoId = Number(req.query.servicoId);
    const data = String(req.query.data || '');
    const agoraIso = req.query.agora ? String(req.query.agora) : undefined;
    const excludeAgendamentoId = req.query.excludeAgendamentoId
      ? Number(req.query.excludeAgendamentoId)
      : undefined;

    if (!profissionalId || !servicoId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new HttpError(400, 'Parâmetros inválidos. Informe profissionalId, servicoId e data (YYYY-MM-DD).');
    }

    const prof = db
      .prepare('SELECT * FROM profissional WHERE id = ? AND negocio_id = ? AND ativo = 1')
      .get(profissionalId, negocio.id) as Profissional | undefined;
    if (!prof) {
      throw new HttpError(404, 'Profissional não encontrado neste estabelecimento.');
    }

    const servico = db
      .prepare('SELECT * FROM servico WHERE id = ? AND negocio_id = ? AND ativo = 1')
      .get(servicoId, negocio.id) as Servico | undefined;
    if (!servico) {
      throw new HttpError(404, 'Serviço não encontrado neste estabelecimento.');
    }

    const diaSemana = getDayOfWeekFromYYYYMMDD(data);
    const faixas = db
      .prepare(
        'SELECT hora_inicio, hora_fim FROM horario_trabalho WHERE profissional_id = ? AND dia_semana = ? ORDER BY hora_inicio ASC'
      )
      .all(profissionalId, diaSemana) as Pick<HorarioTrabalho, 'hora_inicio' | 'hora_fim'>[];

    const dayStart = `${data}T00:00`;
    const dayEnd = `${data}T23:59`;
    const agendamentos = db
      .prepare(
        `SELECT id, inicio, fim FROM agendamento
         WHERE profissional_id = ?
           AND status = 'confirmado'
           AND inicio < ?
           AND fim > ?`
      )
      .all(profissionalId, dayEnd, dayStart) as Array<{ id: number; inicio: string; fim: string }>;

    const filteredAgendamentos = excludeAgendamentoId
      ? agendamentos.filter((a) => a.id !== excludeAgendamentoId)
      : agendamentos;

    const slots = computeAvailableSlots({
      data,
      duracaoMin: servico.duracao_min,
      passoMin: negocio.passo_min,
      faixasTrabalho: faixas,
      agendamentosConfirmados: filteredAgendamentos,
      minStartIso: agoraIso,
    });

    res.json({
      data,
      dia_semana: diaSemana,
      passo_min: negocio.passo_min,
      duracao_min: servico.duracao_min,
      slots,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/public/:slug/agendamentos', (req, res, next) => {
  try {
    const negocio = getBusinessBySlug(req.params.slug);
    const {
      profissional_id,
      servico_id,
      data,
      hora_inicio,
      cliente_nome,
      cliente_telefone,
      cliente_email = '',
      observacao = '',
      lembrete_canal = negocio.lembrete_canal,
    } = req.body ?? {};

    const profId = Number(profissional_id);
    const servId = Number(servico_id);
    const nome = String(cliente_nome || '').trim();
    const telefone = String(cliente_telefone || '').trim();
    const email = String(cliente_email || '').trim();
    const obs = String(observacao || '').trim();

    if (!profId || !servId || !/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || !/^\d{2}:\d{2}$/.test(String(hora_inicio))) {
      throw new HttpError(400, 'Dados de data, horário, serviço ou profissional inválidos.');
    }
    if (nome.length < 2 || telefone.length < 8) {
      throw new HttpError(400, 'Informe seu nome completo e telefone/WhatsApp válido.');
    }

    // IMMEDIATE transaction ensures serialized write-lock conflict checking
    const createBookingTx = db.transaction(() => {
      const prof = db
        .prepare('SELECT * FROM profissional WHERE id = ? AND negocio_id = ? AND ativo = 1')
        .get(profId, negocio.id) as Profissional | undefined;
      if (!prof) {
        throw new HttpError(404, 'Profissional não encontrado ou inativo.');
      }

      const servico = db
        .prepare('SELECT * FROM servico WHERE id = ? AND negocio_id = ? AND ativo = 1')
        .get(servId, negocio.id) as Servico | undefined;
      if (!servico) {
        throw new HttpError(404, 'Serviço não encontrado ou inativo.');
      }

      const startMin = timeToMinutes(String(hora_inicio));
      const endMin = startMin + servico.duracao_min;
      const horaFim = minutesToTime(endMin);
      const inicioIso = `${data}T${hora_inicio}`;
      const fimIso = `${data}T${horaFim}`;

      const diaSemana = getDayOfWeekFromYYYYMMDD(String(data));
      const faixas = db
        .prepare(
          'SELECT hora_inicio, hora_fim FROM horario_trabalho WHERE profissional_id = ? AND dia_semana = ?'
        )
        .all(profId, diaSemana) as Pick<HorarioTrabalho, 'hora_inicio' | 'hora_fim'>[];

      if (!isWithinWorkWindows(String(hora_inicio), horaFim, faixas)) {
        throw new HttpError(
          409,
          'Horário fora do expediente de trabalho do profissional (ou invade pausa de almoço).'
        );
      }

      // Conflict rule: newStart < existingEnd AND newEnd > existingStart
      const conflict = db
        .prepare(
          `SELECT id, inicio, fim, cliente_nome FROM agendamento
           WHERE profissional_id = ?
             AND status = 'confirmado'
             AND inicio < ?
             AND fim > ?
           LIMIT 1`
        )
        .get(profId, fimIso, inicioIso) as { id: number; inicio: string; fim: string } | undefined;

      if (conflict) {
        throw new HttpError(
          409,
          `Conflito de horário: este intervalo (${hora_inicio}–${horaFim}) já foi reservado por outro cliente.`
        );
      }

      const insertRes = db
        .prepare(
          `INSERT INTO agendamento (
            profissional_id, servico_id, cliente_nome, cliente_telefone, cliente_email,
            inicio, fim, status, observacao, lembrete_canal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado', ?, ?)`
        )
        .run(profId, servId, nome, telefone, email, inicioIso, fimIso, obs, lembrete_canal);

      const created = db
        .prepare(
          `SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome,
                  s.duracao_min as servico_duracao_min, s.preco as servico_preco
           FROM agendamento a
           JOIN profissional p ON p.id = a.profissional_id
           JOIN servico s ON s.id = a.servico_id
           WHERE a.id = ?`
        )
        .get(insertRes.lastInsertRowid) as Agendamento;

      return created;
    });

    const agendamento = createBookingTx.immediate();
    res.status(201).json({ agendamento });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// OWNER ROUTES (Painel do Dono)
// ---------------------------------------------------------------------------

app.get('/api/owner/overview', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const today = req.query.hoje ? String(req.query.hoje) : formatDateYYYYMMDD(new Date());

    const dayStart = `${today}T00:00`;
    const dayEnd = `${today}T23:59`;

    const hojeRows = db
      .prepare(
        `SELECT a.status, s.preco
         FROM agendamento a
         JOIN profissional p ON p.id = a.profissional_id
         JOIN servico s ON s.id = a.servico_id
         WHERE p.negocio_id = ? AND a.inicio >= ? AND a.inicio <= ?`
      )
      .all(negocio.id, dayStart, dayEnd) as Array<{ status: AppointmentStatus; preco: number }>;

    const hojeTotal = hojeRows.filter((r) => r.status !== 'cancelado').length;
    const hojeConfirmados = hojeRows.filter((r) => r.status === 'confirmado').length;
    const hojeReceitaPrevista = hojeRows
      .filter((r) => r.status === 'confirmado' || r.status === 'concluido')
      .reduce((acc, r) => acc + r.preco, 0);

    const attendance = db
      .prepare(
        `SELECT
           SUM(CASE WHEN a.status = 'concluido' THEN 1 ELSE 0 END) as concluidos,
           SUM(CASE WHEN a.status = 'faltou' THEN 1 ELSE 0 END) as faltas
         FROM agendamento a
         JOIN profissional p ON p.id = a.profissional_id
         WHERE p.negocio_id = ?`
      )
      .get(negocio.id) as { concluidos: number | null; faltas: number | null };

    const concluidos = attendance.concluidos || 0;
    const faltas = attendance.faltas || 0;
    const taxaComparecimento =
      concluidos + faltas > 0 ? Math.round((concluidos / (concluidos + faltas)) * 100) : 100;

    res.json({
      negocio,
      hoje_total: hojeTotal,
      hoje_confirmados: hojeConfirmados,
      hoje_receita_prevista: hojeReceitaPrevista,
      taxa_comparecimento: taxaComparecimento,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/owner/negocio', (_req, res, next) => {
  try {
    res.json({ negocio: getDefaultBusiness() });
  } catch (err) {
    next(err);
  }
});

app.put('/api/owner/negocio', (req, res, next) => {
  try {
    const current = getDefaultBusiness();
    const { nome, telefone, endereco, slug, passo_min, lembrete_canal } = req.body ?? {};
    const cleanNome = String(nome || '').trim();
    const cleanTel = String(telefone || '').trim();
    const cleanEnd = String(endereco || '').trim();
    const cleanSlug = sanitizeSlug(String(slug || current.slug));
    const passo = Number(passo_min) === 15 ? 15 : 30;
    const canal = ['whatsapp', 'email', 'ambos'].includes(String(lembrete_canal))
      ? String(lembrete_canal)
      : 'whatsapp';

    if (cleanNome.length < 2 || cleanSlug.length < 3) {
      throw new HttpError(400, 'Nome do negócio e slug público (mínimo 3 caracteres) são obrigatórios.');
    }

    const slugConflict = db
      .prepare('SELECT id FROM negocio WHERE slug = ? AND id != ?')
      .get(cleanSlug, current.id);
    if (slugConflict) {
      throw new HttpError(409, 'Este slug já está em uso por outro estabelecimento.');
    }

    db.prepare(
      `UPDATE negocio
       SET nome = ?, telefone = ?, endereco = ?, slug = ?, passo_min = ?, lembrete_canal = ?
       WHERE id = ?`
    ).run(cleanNome, cleanTel, cleanEnd, cleanSlug, passo, canal, current.id);

    res.json({ negocio: getDefaultBusiness() });
  } catch (err) {
    next(err);
  }
});

// Services CRUD
app.get('/api/owner/servicos', (_req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const servicos = db
      .prepare('SELECT * FROM servico WHERE negocio_id = ? ORDER BY ativo DESC, nome ASC')
      .all(negocio.id) as Servico[];
    res.json({ servicos });
  } catch (err) {
    next(err);
  }
});

app.post('/api/owner/servicos', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const { nome, duracao_min, preco } = req.body ?? {};
    const cleanNome = String(nome || '').trim();
    const duracao = Number(duracao_min);
    const valor = Number(preco);

    if (cleanNome.length < 2 || !Number.isFinite(duracao) || duracao < 5 || !Number.isFinite(valor) || valor < 0) {
      throw new HttpError(400, 'Informe nome válido, duração (>= 5 min) e preço (>= 0).');
    }

    const r = db
      .prepare('INSERT INTO servico (negocio_id, nome, duracao_min, preco, ativo) VALUES (?, ?, ?, ?, 1)')
      .run(negocio.id, cleanNome, Math.round(duracao), valor);
    const servico = db.prepare('SELECT * FROM servico WHERE id = ?').get(r.lastInsertRowid) as Servico;
    res.status(201).json({ servico });
  } catch (err) {
    next(err);
  }
});

app.put('/api/owner/servicos/:id', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM servico WHERE id = ? AND negocio_id = ?')
      .get(id, negocio.id) as Servico | undefined;
    if (!existing) throw new HttpError(404, 'Serviço não encontrado.');

    const { nome, duracao_min, preco, ativo } = req.body ?? {};
    const cleanNome = nome !== undefined ? String(nome).trim() : existing.nome;
    const duracao = duracao_min !== undefined ? Number(duracao_min) : existing.duracao_min;
    const valor = preco !== undefined ? Number(preco) : existing.preco;
    const isAtivo = ativo !== undefined ? (ativo ? 1 : 0) : existing.ativo;

    if (cleanNome.length < 2 || duracao < 5 || valor < 0) {
      throw new HttpError(400, 'Dados do serviço inválidos.');
    }

    db.prepare('UPDATE servico SET nome = ?, duracao_min = ?, preco = ?, ativo = ? WHERE id = ?').run(
      cleanNome,
      Math.round(duracao),
      valor,
      isAtivo,
      id
    );
    const servico = db.prepare('SELECT * FROM servico WHERE id = ?').get(id) as Servico;
    res.json({ servico });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/owner/servicos/:id', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const linked = db.prepare('SELECT COUNT(*) as c FROM agendamento WHERE servico_id = ?').get(id) as {
      c: number;
    };
    if (linked.c > 0) {
      // Soft-deactivate if historical appointments reference this service
      db.prepare('UPDATE servico SET ativo = 0 WHERE id = ? AND negocio_id = ?').run(id, negocio.id);
      return res.json({ deleted: false, deactivated: true });
    }
    db.prepare('DELETE FROM servico WHERE id = ? AND negocio_id = ?').run(id, negocio.id);
    res.json({ deleted: true, deactivated: false });
  } catch (err) {
    next(err);
  }
});

// Professionals & Work Hours CRUD
app.get('/api/owner/profissionais', (_req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const profs = db
      .prepare('SELECT * FROM profissional WHERE negocio_id = ? ORDER BY ativo DESC, id ASC')
      .all(negocio.id) as Profissional[];
    const getHorarios = db.prepare(
      'SELECT * FROM horario_trabalho WHERE profissional_id = ? ORDER BY dia_semana ASC, hora_inicio ASC'
    );
    res.json({
      profissionais: profs.map((p) => ({
        ...p,
        horarios: getHorarios.all(p.id) as HorarioTrabalho[],
      })),
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/owner/profissionais', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const { nome, especialidade = '', foto_url = null } = req.body ?? {};
    const cleanNome = String(nome || '').trim();
    if (cleanNome.length < 2) {
      throw new HttpError(400, 'Informe o nome do profissional.');
    }

    const createProfTx = db.transaction(() => {
      const r = db
        .prepare('INSERT INTO profissional (negocio_id, nome, especialidade, foto_url, ativo) VALUES (?, ?, ?, ?, 1)')
        .run(negocio.id, cleanNome, String(especialidade).trim(), foto_url);
      const profId = Number(r.lastInsertRowid);

      // Default work schedule Mon-Sat 09:00-12:00 / 13:30-18:30
      const insH = db.prepare(
        'INSERT INTO horario_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)'
      );
      for (const dia of [1, 2, 3, 4, 5, 6]) {
        insH.run(profId, dia, '09:00', '12:00');
        insH.run(profId, dia, '13:30', '18:30');
      }
      return profId;
    });

    const profId = createProfTx();
    const prof = db.prepare('SELECT * FROM profissional WHERE id = ?').get(profId) as Profissional;
    const horarios = db
      .prepare('SELECT * FROM horario_trabalho WHERE profissional_id = ? ORDER BY dia_semana ASC, hora_inicio ASC')
      .all(profId) as HorarioTrabalho[];
    res.status(201).json({ profissional: { ...prof, horarios } });
  } catch (err) {
    next(err);
  }
});

app.put('/api/owner/profissionais/:id', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM profissional WHERE id = ? AND negocio_id = ?')
      .get(id, negocio.id) as Profissional | undefined;
    if (!existing) throw new HttpError(404, 'Profissional não encontrado.');

    const { nome, especialidade, ativo } = req.body ?? {};
    const cleanNome = nome !== undefined ? String(nome).trim() : existing.nome;
    const cleanEsp = especialidade !== undefined ? String(especialidade).trim() : existing.especialidade;
    const isAtivo = ativo !== undefined ? (ativo ? 1 : 0) : existing.ativo;

    if (cleanNome.length < 2) throw new HttpError(400, 'Nome do profissional inválido.');

    db.prepare('UPDATE profissional SET nome = ?, especialidade = ?, ativo = ? WHERE id = ?').run(
      cleanNome,
      cleanEsp,
      isAtivo,
      id
    );
    const prof = db.prepare('SELECT * FROM profissional WHERE id = ?').get(id) as Profissional;
    const horarios = db
      .prepare('SELECT * FROM horario_trabalho WHERE profissional_id = ? ORDER BY dia_semana ASC, hora_inicio ASC')
      .all(id) as HorarioTrabalho[];
    res.json({ profissional: { ...prof, horarios } });
  } catch (err) {
    next(err);
  }
});

app.put('/api/owner/profissionais/:id/horarios', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const profId = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM profissional WHERE id = ? AND negocio_id = ?')
      .get(profId, negocio.id) as Profissional | undefined;
    if (!existing) throw new HttpError(404, 'Profissional não encontrado.');

    const { horarios } = req.body ?? {};
    if (!Array.isArray(horarios)) {
      throw new HttpError(400, 'Lista de horários inválida.');
    }

    for (const h of horarios) {
      const dia = Number(h.dia_semana);
      if (dia < 0 || dia > 6 || !/^\d{2}:\d{2}$/.test(h.hora_inicio) || !/^\d{2}:\d{2}$/.test(h.hora_fim)) {
        throw new HttpError(400, 'Faixa de horário em formato inválido.');
      }
      if (timeToMinutes(h.hora_inicio) >= timeToMinutes(h.hora_fim)) {
        throw new HttpError(400, `Hora inicial (${h.hora_inicio}) deve ser menor que hora final (${h.hora_fim}).`);
      }
    }

    const updateTx = db.transaction(() => {
      db.prepare('DELETE FROM horario_trabalho WHERE profissional_id = ?').run(profId);
      const ins = db.prepare(
        'INSERT INTO horario_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim) VALUES (?, ?, ?, ?)'
      );
      for (const h of horarios) {
        ins.run(profId, Number(h.dia_semana), String(h.hora_inicio), String(h.hora_fim));
      }
      return db
        .prepare('SELECT * FROM horario_trabalho WHERE profissional_id = ? ORDER BY dia_semana ASC, hora_inicio ASC')
        .all(profId) as HorarioTrabalho[];
    });

    const saved = updateTx();
    res.json({ horarios: saved });
  } catch (err) {
    next(err);
  }
});

// Appointments management (Day / Week view, Status, Reschedule, Reminder)
app.get('/api/owner/agendamentos', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const dataInicio = String(req.query.dataInicio || formatDateYYYYMMDD(new Date()));
    const dataFim = String(req.query.dataFim || dataInicio);
    const profissionalId = req.query.profissionalId ? Number(req.query.profissionalId) : null;
    const status = req.query.status ? String(req.query.status) : null;

    let sql = `
      SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome,
             s.duracao_min as servico_duracao_min, s.preco as servico_preco
      FROM agendamento a
      JOIN profissional p ON p.id = a.profissional_id
      JOIN servico s ON s.id = a.servico_id
      WHERE p.negocio_id = ?
        AND a.inicio >= ?
        AND a.inicio <= ?
    `;
    const params: Array<string | number> = [negocio.id, `${dataInicio}T00:00`, `${dataFim}T23:59`];

    if (profissionalId) {
      sql += ' AND a.profissional_id = ?';
      params.push(profissionalId);
    }
    if (status && status !== 'todos') {
      sql += ' AND a.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY a.inicio ASC';
    const agendamentos = db.prepare(sql).all(...params) as Agendamento[];
    res.json({ agendamentos });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/owner/agendamentos/:id/status', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const { status } = req.body ?? {};
    if (!['confirmado', 'cancelado', 'concluido', 'faltou'].includes(String(status))) {
      throw new HttpError(400, 'Status inválido.');
    }

    const row = db
      .prepare(
        `SELECT a.* FROM agendamento a
         JOIN profissional p ON p.id = a.profissional_id
         WHERE a.id = ? AND p.negocio_id = ?`
      )
      .get(id, negocio.id) as Agendamento | undefined;
    if (!row) throw new HttpError(404, 'Agendamento não encontrado.');

    // If reactivating a cancelled appointment back to 'confirmado', verify no conflict exists!
    if (status === 'confirmado' && row.status !== 'confirmado') {
      const reactivateTx = db.transaction(() => {
        const conflict = db
          .prepare(
            `SELECT id FROM agendamento
             WHERE profissional_id = ? AND status = 'confirmado' AND id != ?
               AND inicio < ? AND fim > ?
             LIMIT 1`
          )
          .get(row.profissional_id, row.id, row.fim, row.inicio);
        if (conflict) {
          throw new HttpError(409, 'Não é possível reativar: já existe outro agendamento confirmado neste horário.');
        }
        db.prepare('UPDATE agendamento SET status = ? WHERE id = ?').run(status, id);
      });
      reactivateTx.immediate();
    } else {
      db.prepare('UPDATE agendamento SET status = ? WHERE id = ?').run(status, id);
    }

    const updated = db
      .prepare(
        `SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome,
                s.duracao_min as servico_duracao_min, s.preco as servico_preco
         FROM agendamento a
         JOIN profissional p ON p.id = a.profissional_id
         JOIN servico s ON s.id = a.servico_id
         WHERE a.id = ?`
      )
      .get(id) as Agendamento;

    res.json({ agendamento: updated });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/owner/agendamentos/:id/remarcar', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const { data, hora_inicio, profissional_id } = req.body ?? {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || !/^\d{2}:\d{2}$/.test(String(hora_inicio))) {
      throw new HttpError(400, 'Informe nova data (YYYY-MM-DD) e novo horário (HH:MM).');
    }

    const rescheduleTx = db.transaction(() => {
      const current = db
        .prepare(
          `SELECT a.*, s.duracao_min FROM agendamento a
           JOIN profissional p ON p.id = a.profissional_id
           JOIN servico s ON s.id = a.servico_id
           WHERE a.id = ? AND p.negocio_id = ?`
        )
        .get(id, negocio.id) as (Agendamento & { duracao_min: number }) | undefined;
      if (!current) throw new HttpError(404, 'Agendamento não encontrado.');

      const targetProfId = profissional_id ? Number(profissional_id) : current.profissional_id;
      const prof = db
        .prepare('SELECT * FROM profissional WHERE id = ? AND negocio_id = ? AND ativo = 1')
        .get(targetProfId, negocio.id) as Profissional | undefined;
      if (!prof) throw new HttpError(404, 'Profissional de destino não encontrado ou inativo.');

      const startMin = timeToMinutes(String(hora_inicio));
      const endMin = startMin + current.duracao_min;
      const horaFim = minutesToTime(endMin);
      const novoInicio = `${data}T${hora_inicio}`;
      const novoFim = `${data}T${horaFim}`;

      const diaSemana = getDayOfWeekFromYYYYMMDD(String(data));
      const faixas = db
        .prepare('SELECT hora_inicio, hora_fim FROM horario_trabalho WHERE profissional_id = ? AND dia_semana = ?')
        .all(targetProfId, diaSemana) as Pick<HorarioTrabalho, 'hora_inicio' | 'hora_fim'>[];

      if (!isWithinWorkWindows(String(hora_inicio), horaFim, faixas)) {
        throw new HttpError(409, 'Novo horário está fora do expediente do profissional.');
      }

      const conflict = db
        .prepare(
          `SELECT id FROM agendamento
           WHERE profissional_id = ? AND status = 'confirmado' AND id != ?
             AND inicio < ? AND fim > ?
           LIMIT 1`
        )
        .get(targetProfId, id, novoFim, novoInicio);

      if (conflict) {
        throw new HttpError(409, 'Conflito ao remarcar: já existe outro agendamento confirmado neste horário.');
      }

      db.prepare(
        `UPDATE agendamento
         SET profissional_id = ?, inicio = ?, fim = ?, status = 'confirmado'
         WHERE id = ?`
      ).run(targetProfId, novoInicio, novoFim, id);

      return db
        .prepare(
          `SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome,
                  s.duracao_min as servico_duracao_min, s.preco as servico_preco
           FROM agendamento a
           JOIN profissional p ON p.id = a.profissional_id
           JOIN servico s ON s.id = a.servico_id
           WHERE a.id = ?`
        )
        .get(id) as Agendamento;
    });

    const agendamento = rescheduleTx.immediate();
    res.json({ agendamento });
  } catch (err) {
    next(err);
  }
});

app.post('/api/owner/agendamentos/:id/lembrete', (req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const id = Number(req.params.id);
    const { canal, mensagem } = req.body ?? {};
    const targetCanal: 'whatsapp' | 'email' = canal === 'email' ? 'email' : 'whatsapp';

    const row = db
      .prepare(
        `SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome
         FROM agendamento a
         JOIN profissional p ON p.id = a.profissional_id
         JOIN servico s ON s.id = a.servico_id
         WHERE a.id = ? AND p.negocio_id = ?`
      )
      .get(id, negocio.id) as Agendamento | undefined;
    if (!row) throw new HttpError(404, 'Agendamento não encontrado.');

    const destinatario = targetCanal === 'email' ? row.cliente_email || 'sem-email' : row.cliente_telefone;
    const nowIso = new Date().toISOString();

    const sendTx = db.transaction(() => {
      db.prepare(
        `INSERT INTO lembrete_log (agendamento_id, canal, destinatario, mensagem, enviado_em)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, targetCanal, destinatario, String(mensagem || ''), nowIso);

      db.prepare('UPDATE agendamento SET lembrete_enviado_em = ?, lembrete_canal = ? WHERE id = ?').run(
        nowIso,
        targetCanal,
        id
      );

      return db
        .prepare(
          `SELECT a.*, p.nome as profissional_nome, s.nome as servico_nome,
                  s.duracao_min as servico_duracao_min, s.preco as servico_preco
           FROM agendamento a
           JOIN profissional p ON p.id = a.profissional_id
           JOIN servico s ON s.id = a.servico_id
           WHERE a.id = ?`
        )
        .get(id) as Agendamento;
    });

    const agendamento = sendTx();
    res.json({ agendamento });
  } catch (err) {
    next(err);
  }
});

app.get('/api/owner/lembretes', (_req, res, next) => {
  try {
    const negocio = getDefaultBusiness();
    const logs = db
      .prepare(
        `SELECT l.*, a.cliente_nome, a.inicio
         FROM lembrete_log l
         JOIN agendamento a ON a.id = l.agendamento_id
         JOIN profissional p ON p.id = a.profissional_id
         WHERE p.negocio_id = ?
         ORDER BY l.id DESC
         LIMIT 25`
      )
      .all(negocio.id);
    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgendaFácil server running on http://localhost:${PORT}`);
  });
}

startServer();
