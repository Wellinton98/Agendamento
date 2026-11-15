import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'agendafacil.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS negocio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      endereco TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      passo_min INTEGER NOT NULL DEFAULT 30 CHECK (passo_min IN (15, 30)),
      lembrete_canal TEXT NOT NULL DEFAULT 'whatsapp' CHECK (lembrete_canal IN ('whatsapp', 'email', 'ambos')),
      capa_url TEXT
    );

    CREATE TABLE IF NOT EXISTS servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocio(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      duracao_min INTEGER NOT NULL CHECK (duracao_min >= 5),
      preco REAL NOT NULL CHECK (preco >= 0),
      ativo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS profissional (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id INTEGER NOT NULL REFERENCES negocio(id) ON DELETE CASCADE,
      nome TEXT NOT NULL,
      especialidade TEXT NOT NULL DEFAULT '',
      foto_url TEXT,
      ativo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS horario_trabalho (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profissional_id INTEGER NOT NULL REFERENCES profissional(id) ON DELETE CASCADE,
      dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
      hora_inicio TEXT NOT NULL,
      hora_fim TEXT NOT NULL,
      CHECK (hora_inicio < hora_fim)
    );

    CREATE TABLE IF NOT EXISTS agendamento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profissional_id INTEGER NOT NULL REFERENCES profissional(id) ON DELETE CASCADE,
      servico_id INTEGER NOT NULL REFERENCES servico(id) ON DELETE RESTRICT,
      cliente_nome TEXT NOT NULL,
      cliente_telefone TEXT NOT NULL,
      cliente_email TEXT NOT NULL DEFAULT '',
      inicio TEXT NOT NULL,
      fim TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'cancelado', 'concluido', 'faltou')),
      observacao TEXT NOT NULL DEFAULT '',
      lembrete_enviado_em TEXT,
      lembrete_canal TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (inicio < fim)
    );

    CREATE TABLE IF NOT EXISTS lembrete_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER NOT NULL REFERENCES agendamento(id) ON DELETE CASCADE,
      canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email')),
      destinatario TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      enviado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_servico_negocio ON servico(negocio_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_profissional_negocio ON profissional(negocio_id, ativo);
    CREATE INDEX IF NOT EXISTS idx_horario_prof_dia ON horario_trabalho(profissional_id, dia_semana);
    CREATE INDEX IF NOT EXISTS idx_agendamento_prof_status_interval ON agendamento(profissional_id, status, inicio, fim);
  `);

  const count = db.prepare('SELECT COUNT(*) as c FROM negocio').get() as { c: number };
  if (count.c === 0) {
    seedInitialData();
  }
}

function addDaysYYYYMMDD(baseDate: Date, offsetDays: number): string {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offsetDays, 12, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedInitialData() {
  const seed = db.transaction(() => {
    const insertNegocio = db.prepare(`
      INSERT INTO negocio (nome, telefone, endereco, slug, passo_min, lembrete_canal, capa_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const negocioRes = insertNegocio.run(
      'Barbearia do João',
      '(11) 98765-4321',
      'Rua Augusta, 1420 · Consolação, São Paulo',
      'barbearia-do-joao',
      30,
      'whatsapp',
      '/src/assets/images/studio_barbearia_1794782561978.jpg'
    );
    const negocioId = Number(negocioRes.lastInsertRowid);

    const insertServico = db.prepare(`
      INSERT INTO servico (negocio_id, nome, duracao_min, preco, ativo)
      VALUES (?, ?, ?, ?, 1)
    `);
    const sCorte = Number(insertServico.run(negocioId, 'Corte Masculino', 30, 55.0).lastInsertRowid);
    const sBarba = Number(insertServico.run(negocioId, 'Barba Terapia (Toalha Quente)', 30, 45.0).lastInsertRowid);
    const sCombo = Number(insertServico.run(negocioId, 'Combo Corte + Barba', 60, 90.0).lastInsertRowid);
    const sAcabamento = Number(insertServico.run(negocioId, 'Pezinho e Sobrancelha', 15, 25.0).lastInsertRowid);

    const insertProf = db.prepare(`
      INSERT INTO profissional (negocio_id, nome, especialidade, foto_url, ativo)
      VALUES (?, ?, ?, ?, 1)
    `);
    const pJoao = Number(
      insertProf.run(
        negocioId,
        'João Silva',
        'Cortes clássicos e navalha',
        '/src/assets/images/barber_joao_1794782560837.jpg'
      ).lastInsertRowid
    );
    const pLucas = Number(
      insertProf.run(
        negocioId,
        'Lucas Mendes',
        'Degradê e visagismo',
        '/src/assets/images/barber_lucas_1794782561244.jpg'
      ).lastInsertRowid
    );
    const pRafael = Number(
      insertProf.run(
        negocioId,
        'Rafael Costa',
        'Barba terapia e tesoura',
        '/src/assets/images/barber_rafael_1794782561577.jpg'
      ).lastInsertRowid
    );

    const insertHorario = db.prepare(`
      INSERT INTO horario_trabalho (profissional_id, dia_semana, hora_inicio, hora_fim)
      VALUES (?, ?, ?, ?)
    `);

    // João & Lucas: Segunda a Sábado (09:00-12:00 e 13:30-19:30, pausa almoço 12:00-13:30) + Domingo manhã (09:00-14:00)
    for (const profId of [pJoao, pLucas]) {
      insertHorario.run(profId, 0, '09:00', '14:00'); // Domingo
      for (const dia of [1, 2, 3, 4, 5, 6]) {
        insertHorario.run(profId, dia, '09:00', '12:00');
        insertHorario.run(profId, dia, '13:30', '19:30');
      }
    }

    // Rafael: Terça a Sábado (10:00-13:00 e 14:00-20:00) + Domingo (10:00-15:00)
    insertHorario.run(pRafael, 0, '10:00', '15:00');
    for (const dia of [2, 3, 4, 5, 6]) {
      insertHorario.run(pRafael, dia, '10:00', '13:00');
      insertHorario.run(pRafael, dia, '14:00', '20:00');
    }

    const now = new Date();
    const d0 = addDaysYYYYMMDD(now, 0);
    const d1 = addDaysYYYYMMDD(now, 1);
    const d2 = addDaysYYYYMMDD(now, 2);
    const dPrev1 = addDaysYYYYMMDD(now, -1);

    const insertAg = db.prepare(`
      INSERT INTO agendamento (
        profissional_id, servico_id, cliente_nome, cliente_telefone, cliente_email,
        inicio, fim, status, observacao, lembrete_enviado_em, lembrete_canal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Ontem (histórico para taxa de comparecimento realista)
    insertAg.run(pJoao, sCombo, 'Marcelo Duarte', '(11) 99123-4410', 'marcelo.duarte@email.com', `${dPrev1}T10:00`, `${dPrev1}T11:00`, 'concluido', '', `${dPrev1}T08:00`, 'whatsapp');
    insertAg.run(pLucas, sCorte, 'Thiago Ferraz', '(11) 98442-1190', '', `${dPrev1}T14:00`, `${dPrev1}T14:30`, 'concluido', '', `${dPrev1}T09:00`, 'whatsapp');
    insertAg.run(pRafael, sBarba, 'Bruno Vasconcelos', '(11) 97310-8821', '', `${dPrev1}T16:00`, `${dPrev1}T16:30`, 'faltou', 'Não respondeu ao lembrete', `${dPrev1}T10:00`, 'whatsapp');

    // Hoje (dia atual)
    insertAg.run(pJoao, sCorte, 'Gabriel Nogueira', '(11) 99654-3210', 'gabriel.n@email.com', `${d0}T09:00`, `${d0}T09:30`, 'concluido', '', `${dPrev1}T18:00`, 'whatsapp');
    insertAg.run(pJoao, sCombo, 'Henrique Albuquerque', '(11) 99118-7623', 'henrique@email.com', `${d0}T10:00`, `${d0}T11:00`, 'confirmado', 'Preferência por tesoura no topo', `${dPrev1}T18:05`, 'whatsapp');
    insertAg.run(pJoao, sBarba, 'Eduardo Martins', '(11) 98234-5501', '', `${d0}T11:30`, `${d0}T12:00`, 'confirmado', '', null, null);
    insertAg.run(pLucas, sCorte, 'Felipe Salles', '(11) 97612-0049', 'felipe.salles@email.com', `${d0}T09:30`, `${d0}T10:00`, 'confirmado', '', `${dPrev1}T19:00`, 'email');
    insertAg.run(pLucas, sAcabamento, 'Caio Tavares', '(11) 99441-2280', '', `${d0}T11:00`, `${d0}T11:15`, 'confirmado', '', null, null);
    insertAg.run(pRafael, sCombo, 'Rodrigo Peixoto', '(11) 98871-9034', 'rodrigo.p@email.com', `${d0}T10:30`, `${d0}T11:30`, 'confirmado', 'Barba desenhada baixa', `${dPrev1}T20:00`, 'whatsapp');

    // Amanhã e depois de amanhã (visão semanal)
    insertAg.run(pJoao, sCorte, 'Mateus Queiroz', '(11) 99701-3344', '', `${d1}T09:30`, `${d1}T10:00`, 'confirmado', '', null, null);
    insertAg.run(pJoao, sCombo, 'André Bastos', '(11) 99322-7812', 'andre.bastos@email.com', `${d1}T14:00`, `${d1}T15:00`, 'confirmado', '', null, null);
    insertAg.run(pLucas, sBarba, 'Vitor Fonseca', '(11) 98109-4511', '', `${d1}T15:30`, `${d1}T16:00`, 'confirmado', '', null, null);
    insertAg.run(pRafael, sCorte, 'Leonardo Pires', '(11) 99812-6700', '', `${d2}T11:00`, `${d2}T11:30`, 'confirmado', '', null, null);
    insertAg.run(pJoao, sCorte, 'Pedro Azevedo', '(11) 99400-1122', '', `${d2}T16:00`, `${d2}T16:30`, 'cancelado', 'Cliente pediu cancelamento', null, null);
  });

  seed();
}
