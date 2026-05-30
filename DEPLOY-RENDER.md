# 🚀 Deploy do server BarberMan no Render

O **site (client)** já roda no Vercel. Falta o **server** (API + WhatsApp + lembretes).
Vamos hospedá-lo no **Render**, que mantém o processo sempre rodando.

Arquitetura final:
```
Navegador → Vercel (site React)  ──/api──►  Render (server Node)  ──►  Firestore
                                              └── WhatsApp Web (Chromium)
```

---

## Passo 1 — Enviar os arquivos novos pro GitHub
Já preparei `server/Dockerfile`, `render.yaml`, ajustes de código e o `vercel.json`.
Commite e dê push (eu posso fazer isso por você).

## Passo 2 — Criar o serviço no Render
1. Acesse <https://render.com> e entre com sua conta do **GitHub**.
2. **New → Blueprint**.
3. Selecione o repositório **`juninhosouza810/Barber-Brother`**.
4. O Render lê o `render.yaml` e propõe criar o serviço **`barberman-api`**. Clique em **Apply**.

## Passo 3 — Configurar a credencial do Firebase (secreta)
O `serviceAccountKey.json` **não** vai pro GitHub. Em vez disso:
1. Abra o arquivo `server/serviceAccountKey.json` (no seu PC) e **copie todo o conteúdo**.
2. No Render: serviço **barberman-api → Environment → Add Environment Variable**.
3. Key: `FIREBASE_SERVICE_ACCOUNT` · Value: **cole o JSON inteiro** · salve.
4. O serviço reinicia e conecta no Firestore (`🔥 Dados carregados do Firestore`).

## Passo 4 — Pegar a URL e conectar o site
1. No topo do serviço aparece a URL pública, ex.: `https://barberman-api.onrender.com`.
2. Se for **diferente** dessa, me avise (ou edite você): no `vercel.json`, troque a URL
   na linha do rewrite `/api/:path*` pela URL real do seu serviço.
3. Push → o Vercel redeploya e o site passa a falar com a API. ✅

## Passo 5 — Conectar o WhatsApp
1. Abra o site → **/admin** (PIN padrão `1234`) → aba **WhatsApp → Conectar**.
2. Leia o QR Code com o celular (*WhatsApp → Aparelhos conectados*).

---

## ⚠️ Sobre o plano grátis
- **Dorme após 15 min sem acesso** → o WhatsApp desconecta e os lembretes param.
  Para ficar **24/7**, no `render.yaml` troque `plan: free` por `plan: starter` (~US$ 7/mês).
- **Sessão do WhatsApp some ao reiniciar** (re-parear o QR). Para mantê-la, no plano pago
  descomente o bloco `disk:` no `render.yaml` (monta um disco em `/app/data`).
- Seus **dados estão no Firestore** — esses não se perdem em nenhum caso.

## 🔧 Variáveis de ambiente (resumo)
| Variável | Para quê | Onde |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Credencial do Firestore (JSON) | Render (secreta) |
| `PUPPETEER_EXECUTABLE_PATH` | Caminho do Chromium (`/usr/bin/chromium`) | já no `render.yaml` |
| `PORT` | Porta do server | injetada pelo Render |
