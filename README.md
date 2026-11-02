# FlowTech — CETI Dr. João Carvalho

Portal responsivo para alunos, professores e gestores. A aplicação usa React/Vite no cliente e uma API Node.js com SQLite no servidor. Contas, sessões, notas, comunicados, cardápio e rotas são persistidos no banco.

## Requisitos

- Node.js 22.18 ou superior (inclui `node:sqlite`);
- npm 10 ou superior.

## Desenvolvimento

1. Instale as dependências: `npm install`.
2. Inicie a API e a interface juntas: `npm run dev`.
3. Abra [http://localhost:3000](http://localhost:3000).
4. Use **Cadastrar conta** para criar uma conta; não há credenciais ou estudantes de demonstração predefinidos.

A interface Vite encaminha `/api` à API local, que usa `http://127.0.0.1:3001` por padrão. Os dados SQLite são criados em `data/flowtech.sqlite`; use `FLOWTECH_DB_PATH` para escolher outro caminho. A API aceita `HOST` e `PORT` para configuração do endereço, e `FLOWTECH_ALLOWED_ORIGINS` (origens separadas por vírgula) para origens adicionais confiáveis.

No desenvolvimento, `npm run dev` escolhe automaticamente outra porta disponível para a API se a porta configurada (por padrão, `3001`) já estiver ocupada, e ajusta o proxy da interface.

Para produção local, rode `npm run build` e depois `npm start`; o servidor disponibiliza os arquivos compilados de `dist/` e a API na mesma origem. Configure HTTPS no proxy reverso e `NODE_ENV=production` para habilitar o atributo `Secure` do cookie de sessão.

## Contas, dados e permissões

- Alunos informam nome, e-mail, senha, turma oficial, seu WhatsApp e o WhatsApp de um responsável. Não há envio de código ou verificação desses números.
- Gênero não é solicitado no cadastro. Quando não há essa informação salva, o perfil usa uma forma inclusiva; perfis existentes com gênero salvo mantêm a forma correspondente.
- Alunos, professores, gestores e funcionários podem escolher o perfil no cadastro. **A seleção não confirma vínculo com a escola.** Qualquer pessoa pode se cadastrar com um perfil de equipe; antes de usar dados reais ou publicar a aplicação, substitua esse cadastro aberto por convites, aprovação institucional ou identidade escolar verificada.
- Senhas novas devem ter de 10 a 30 caracteres e são armazenadas com scrypt; sessões usam tokens aleatórios em cookies `HttpOnly`, `SameSite=Lax`, com expiração e limite de tentativas de login. As operações protegidas também verificam o perfil no servidor.
- O SQLite contém dados pessoais (inclusive números de alunos e responsáveis) sem criptografia do arquivo. Restrinja o acesso ao servidor e ao diretório do banco, use armazenamento protegido e faça backups controlados antes de operar com dados reais.
- O Mural publica avisos para uma turma por vez. Professores e gestores veem os WhatsApps dos alunos e dos responsáveis; os atalhos abrem o serviço externo. Conversas não são armazenadas pelo FlowTech e o portal não declara criptografia ponta a ponta.
- Funcionários podem consultar Visão geral, Boletim, Horários e Cardápio sem permissão para alterar notas, horários ou cardápio. Também podem editar rotas de Transporte e publicar, editar e remover somente os próprios comunicados no Mural e no Calendário. Contatos de alunos e responsáveis permanecem restritos a professores e gestores. A seção Transporte não exibe os nomes dos motoristas nem dos monitores. Excluir a própria conta remove os comunicados publicados por ela; notas acadêmicas são preservadas.
- Professores e gestores podem publicar, editar e remover somente os próprios comunicados no Mural e no Calendário.
- Gestores podem editar disciplina, classificação curricular (BNCC ou Técnica), horário e professor responsável nas grades. As alterações são compartilhadas com todos os perfis autorizados a consultar os horários.
- Todas as contas podem alterar o nome e a foto no painel do perfil. Fotos são redimensionadas e armazenadas no SQLite junto aos demais dados da conta.
- As listas de estudantes e de notas começam vazias. O catálogo de disciplinas e os dados atuais de cardápio e transporte são conteúdo institucional preexistente. As grades de todas as oito turmas estão disponíveis na seção Horários. O PDF fornecido lista a ordem das aulas e os professores, mas não informa horários por relógio nem salas; esses dados não são inventados. A grade de **3º ano Desenvolvimento de Sistemas** mantém somente as aulas cadastradas, com seus horários, professores e disciplinas; períodos preenchidos com traços e blocos demonstrativos de almoço e intervalo não são exibidos.
- Cardápio e transporte usam os dados preexistentes até que um gestor publique alterações. A publicação persiste os novos dados para todas as contas.

## Verificação

```bash
npm run check
npm test
npm run build
```

`npm test` inclui testes das regras acadêmicas e da API (sessões, isolamento por turma, permissões de notas/contatos, publicação e validação).

## Estrutura

```text
shared/
  classes.mjs           relação central das oito turmas
server/
  index.mjs             API HTTP, SQLite, autenticação e autorização
  server.test.mjs       testes de integração da API
src/
  data/school.ts        tipos e acesso à lista central
  data/api.ts           cliente HTTP e erros da API
  components/           telas e fluxos por perfil
  types/auth.ts         modelos de conta, notas e comunicados
```
