# AgendaFácil — Plano de evolução SaaS multiestabelecimento

## Objetivo

Evoluir o AgendaFácil de uma instalação que opera com um negócio padrão para uma plataforma SaaS multiestabelecimento. Cada estabelecimento terá seu próprio acesso administrativo, equipe, serviços, clientes, configurações e agendamentos, sem acesso cruzado aos dados de outros estabelecimentos.

## Estado atual auditado

Auditoria estática do código da branch de origem, antes de implementar autenticação ou multi-tenancy:

- SQLite é inicializado em `src/server/db.ts`, com arquivo `data/agendafacil.db`.
- A tabela `negocio` já existe e possui `slug` único.
- `servico` e `profissional` já possuem `negocio_id`.
- `horario_trabalho` pertence ao profissional.
- `agendamento` referencia profissional e serviço, mas não possui `negocio_id` próprio; o estabelecimento é inferido pelo profissional.
- `lembrete_log` referencia o agendamento.
- Não existe tabela de usuários, credenciais, sessões ou associação usuário-estabelecimento.
- As rotas `/api/owner/*` não exigem autenticação e usam `getDefaultBusiness()`, que seleciona o primeiro negócio cadastrado.
- A página pública já resolve o negócio pelo slug e valida que profissional e serviço pertencem ao negócio da URL.
- O frontend não possui fluxo de login; o painel do proprietário é acessível pela navegação atual.
- O envio de lembretes ainda é apenas registro no banco, sem integração real com WhatsApp ou e-mail.

## Decisões de arquitetura propostas

1. **Identidade e acesso:** criar usuários com e-mail normalizado e hash de senha forte; nunca armazenar senha em texto puro.
2. **Vínculo explícito:** criar associação entre usuário e estabelecimento (membership), com papel/permissão. Isso permite que futuramente um proprietário tenha mais de um estabelecimento e que uma equipe tenha acessos limitados.
3. **Administrador da plataforma:** papel global separado do proprietário/colaborador de estabelecimento. O acesso global não deve ser confundido com as permissões normais do negócio.
4. **Contexto autenticado:** após login, o servidor identifica o usuário e o estabelecimento autorizado pela sessão. O backend nunca deve aceitar `negocio_id` enviado livremente pelo navegador como fonte de autorização.
5. **Isolamento no backend:** todas as consultas e mutações administrativas devem filtrar pelo estabelecimento obtido do contexto autenticado. IDs de serviços, profissionais e agendamentos devem ser validados dentro desse mesmo estabelecimento.
6. **Rotas públicas:** continuam acessíveis por slug, mas só expõem os campos públicos necessários e só permitem criar agendamentos para serviços/profissionais daquele estabelecimento.
7. **Integridade relacional:** avaliar chaves estrangeiras compostas ou validações transacionais para impedir que um agendamento relacione profissional de um negócio com serviço de outro.
8. **Migração segura:** criar migrações versionadas, fazer backup do SQLite e associar os dados atuais ao estabelecimento legado antes de ativar o novo modelo. Não apagar nem recriar o banco existente.
9. **Sessões e segurança web:** usar cookies HttpOnly, Secure em produção, SameSite apropriado, expiração e proteção contra CSRF conforme a estratégia escolhida; limitar tentativas de login e não revelar se um e-mail está cadastrado.
10. **Persistência em produção:** configurar caminho de banco por variável de ambiente e volume persistente no host. Para crescimento com múltiplas instâncias, avaliar PostgreSQL em vez de SQLite.

## Plano de implementação

### Fase 0 — Proteção e preparação
- Criar branch de trabalho separada.
- Preservar o banco SQLite atual e documentar como fazer backup.
- Adicionar migrações versionadas e testes de migração/reversão quando possível.

### Fase 1 — Autenticação e autorização
- Criar usuários, memberships e papéis.
- Implementar cadastro inicial do estabelecimento + proprietário em uma transação.
- Implementar login, logout, sessão e endpoint de usuário atual.
- Proteger todas as rotas `/api/owner/*`.
- Remover o uso de `getDefaultBusiness()` das rotas administrativas.

### Fase 2 — Multi-tenancy completo
- Resolver estabelecimento ativo pelo vínculo autenticado.
- Aplicar escopo do estabelecimento em overview, configurações, serviços, profissionais, horários, agendamentos e lembretes.
- Garantir integridade entre estabelecimento, profissional, serviço e agendamento.
- Preservar páginas públicas por slug e garantir que retornem somente dados daquele estabelecimento.

### Fase 3 — Frontend
- Criar telas de cadastro, login e saída.
- Tornar o painel privado por sessão.
- Exibir informações do estabelecimento autenticado.
- Tratar sessão expirada e erros 401/403.

### Fase 4 — Testes de isolamento e produção
- Criar dois estabelecimentos de teste, cada um com usuário, equipe, serviços e agendamentos próprios.
- Verificar que A não consegue ler, editar, cancelar ou remarcar dados de B, mesmo alterando IDs e chamadas HTTP.
- Testar agendamentos públicos por slug, concorrência, cancelamento e remarcação.
- Testar migração com cópia do banco real e persistência após reinício/deploy.
- Configurar backup, logs e variáveis de ambiente antes de produção.

## Critérios de aceite essenciais

- Nenhuma rota administrativa funciona sem sessão válida.
- Um usuário só acessa estabelecimentos aos quais está vinculado.
- O backend determina o escopo do estabelecimento; o cliente não pode escolher outro ID para escapar do isolamento.
- Nenhum registro de serviço, profissional, horário, agendamento ou lembrete de outro estabelecimento é retornado ou alterado.
- O agendamento público de um slug não aceita IDs pertencentes a outro estabelecimento.
- A migração preserva o estabelecimento e os registros existentes.
- Os testes automatizados de isolamento passam antes do deploy.

## Riscos conhecidos a tratar durante a implementação

- O banco atual não tem tabela de autenticação nem migrações versionadas.
- O painel atual não tem login e usa o primeiro negócio do banco como contexto.
- A relação do agendamento com o negócio é indireta, através do profissional; será necessário reforçar a integridade entre profissional e serviço.
- O banco usa SQLite local. SQLite pode servir para uma primeira instância com volume persistente, mas não deve ser compartilhado entre múltiplas instâncias de aplicação.
- O seed inicial cria dados fictícios de uma barbearia; o fluxo SaaS deverá distinguir dados de demonstração de novos cadastros reais.

## Limite desta etapa

Este documento registra a auditoria e o desenho técnico. Ainda não altera o esquema de produção, não cria usuários e não ativa autenticação. A implementação será feita em etapas pequenas, com backup e testes, preservando o banco atual.
