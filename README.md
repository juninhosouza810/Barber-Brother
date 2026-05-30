# 🪒 BarberMan — Agendamento Premium para Barbearia

App completo de agendamento online para barbearia, com identidade visual exclusiva
(preto, dourado e branco), experiência **mobile-first** e operação simples.

- **Frontend:** React 18 + Vite + React Router (design system CSS próprio, ícones Lucide)
- **Backend:** Node.js + Express, persistência em arquivo JSON (zero dependências nativas)
- **Sem banco externo, sem build tools de C++** — roda direto no Windows/Mac/Linux.

## ▶️ Como rodar

Pré-requisito: **Node.js 18+** (testado no Node 24).

```bash
# 1. Instalar tudo (raiz + servidor + cliente)
npm run setup

# 2. Subir API (porta 4000) e site (porta 5173) juntos
npm run dev
```

Abra **http://localhost:5173**.

> No primeiro `npm run dev` o servidor cria `server/data/db.json` com dados de
> demonstração (serviços, barbeiros e horários).

### Comandos úteis
| Comando | O que faz |
|---|---|
| `npm run setup` | Instala dependências de raiz, `server` e `client` |
| `npm run dev` | Sobe API + frontend simultaneamente |
| `npm run dev:server` | Só a API (http://localhost:4000) |
| `npm run dev:client` | Só o frontend (http://localhost:5173) |
| `npm run build` | Build de produção do frontend (`client/dist`) |

## 🔐 Painel administrativo
Acesse pelo rodapé do site ou em **/admin**.
**PIN padrão da demo: `1234`** (alterável em `server/src/db.js` → `settings.adminPin`).

No painel você gerencia: agenda/agendamentos (confirmar, cancelar, remarcar, excluir),
serviços, barbeiros (+ horários por dia da semana), clientes, log de notificações e
configurações da barbearia.

## 📲 WhatsApp Web (envio automático)
A barbearia conecta o próprio número via **WhatsApp Web** e o sistema envia
mensagens automaticamente:
- **Ao confirmar o agendamento** → o cliente recebe os detalhes no WhatsApp.
- **4 horas antes do atendimento** → o cliente recebe um lembrete automático.

**Como conectar:** painel **/admin → aba WhatsApp → Conectar** e leia o QR Code com
o celular (*WhatsApp → Aparelhos conectados → Conectar um aparelho*). A sessão fica
salva em `server/data/.wwebjs_auth`, então não é preciso parear toda vez.

> Tecnicamente usa `whatsapp-web.js` (automatiza o WhatsApp Web via Chromium headless).
> Mantenha o celular com internet para o envio funcionar.

## ✨ Funcionalidades
- Tela inicial com chamada principal e CTAs (agendar / ver serviços)
- Catálogo de serviços com filtros por categoria, duração e preço
- Profissionais com foto, especialidades e dias de atendimento
- Fluxo de agendamento em etapas: serviço → barbeiro → data/hora → dados
- **Calendário visual** + **horários livres em tempo real** (slots ocupados bloqueados)
- Confirmação com status **pendente / confirmado / cancelado**
- Área do cliente (busca por telefone) para ver, **reagendar** ou **cancelar**
- Notificações simuladas por WhatsApp (mensagem pronta + link `wa.me` clicável)
- Filtros no admin por barbeiro, serviço, status e data

## ⚙️ Regras de negócio implementadas
- Cada agendamento ocupa o tempo da duração do serviço.
- **Dois clientes não podem ocupar o mesmo horário do mesmo barbeiro** (validado no servidor).
- Horários livres são **gerados a partir da agenda de cada profissional**.
- O cliente só consegue selecionar horários realmente livres.
- O administrador pode editar, cancelar e remarcar qualquer agendamento.
- Funciona bem no celular e no navegador (layout responsivo, bottom-nav no mobile).

## 🔥 Persistência no Firebase (Firestore)
Os dados são persistidos no **Cloud Firestore** (projeto `barberman-qryav`). O backend
mantém um **cache em memória** para respostas rápidas e sincroniza as alterações para o
Firestore por *diff* (upsert/delete) a cada gravação. Um arquivo `server/data/db.json`
é mantido apenas como **backup local** e *fallback* caso o Firestore esteja indisponível.

**Para rodar com Firestore** é necessária uma chave de service account em
`server/serviceAccountKey.json` (ignorada pelo Git):

1. Firebase Console → ⚙️ *Configurações do projeto* → **Contas de serviço**
2. **Gerar nova chave privada** → salve o arquivo como `server/serviceAccountKey.json`

> Sem a chave, o app continua funcionando apenas com o `db.json` local (modo offline).
> Coleções no Firestore: `clients`, `services`, `barbers`, `availability`, `blocks`,
> `appointments`, `notifications` e `meta/settings`.

## 🗂️ Estrutura de dados (coleções do Firestore / `server/data/db.json`)
- **clients**: nome, telefone, e-mail, histórico
- **services**: nome, descrição, duração, preço, categoria
- **barbers**: nome, foto, função, especialidades, bio
- **availability**: barbeiro, dia da semana, hora inicial, hora final
- **appointments**: cliente, serviço, barbeiro, data, hora, duração, status, observações
- **settings**: horário de funcionamento, intervalo de slots, buffer, políticas, PIN admin
- **notifications**: log das mensagens geradas

## 🔌 Próximos passos (integração real)
O envio de WhatsApp já é **real** (via `server/src/whatsapp.js`). Cada notificação
também fica registrada no log com status de entrega. A persistência pode migrar de
JSON para SQLite/Postgres mantendo a mesma camada de API. Para escala/produção, vale
avaliar a **WhatsApp Cloud API** oficial no lugar do WhatsApp Web.

## 🗺️ Estrutura do projeto
```
BarberMan/
├─ package.json          # scripts que orquestram server + client
├─ server/               # API Express + persistência JSON
│  └─ src/{index,db,schedule,notify}.js
└─ client/               # React + Vite
   └─ src/{App,api,lib,ui}.jsx + pages/
```
