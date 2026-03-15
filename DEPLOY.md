# 🚀 Deploy — Barbearia Ruan no Vercel

## Estrutura de arquivos

```
barbearia-ruan/
├── public/
│   └── index.html          ← o site
├── api/
│   ├── create-pix.js       ← cria PIX no Mercado Pago
│   ├── webhook.js          ← recebe confirmação do MP
│   └── check-pix.js        ← verifica status (fallback)
├── package.json
└── vercel.json
```

---

## PASSO 1 — Pegar o Access Token do Mercado Pago

1. Acesse: https://mercadopago.com.br/developers/panel
2. Clique no seu app (ou crie um novo app qualquer)
3. Clique em **Credenciais de produção**
4. Copie o **Access token** — começa com `APP_USR-...`

---

## PASSO 2 — Pegar as credenciais do Firebase

Você precisa de uma **Service Account** para o backend acessar o Firebase.

1. Acesse: https://console.firebase.google.com
2. Projeto **barbearia-ruan** → ⚙️ Configurações do projeto
3. Aba **Contas de serviço**
4. Clique em **Gerar nova chave privada** → baixa um arquivo `.json`
5. Abra o arquivo e copie estes valores:
   - `project_id`
   - `client_email`
   - `private_key` (o texto longo com `-----BEGIN RSA PRIVATE KEY-----`)

---

## PASSO 3 — Subir no Vercel

### Opção A: Via interface web (mais fácil)

1. Acesse https://vercel.com e faça login
2. Clique em **Add New → Project**
3. Importe do GitHub (suba os arquivos primeiro) ou use **Deploy from CLI**
4. Após importar, vá em **Settings → Environment Variables**
5. Adicione estas variáveis:

| Nome | Valor |
|------|-------|
| `MP_ACCESS_TOKEN` | `APP_USR-seu-token-aqui` |
| `FIREBASE_PROJECT_ID` | `barbearia-ruan` |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@barbearia-ruan.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN RSA PRIVATE KEY-----\n...` (cole tudo) |
| `FIREBASE_DATABASE_URL` | `https://barbearia-ruan-default-rtdb.firebaseio.com` |
| `WEBHOOK_URL` | `https://SEU-PROJETO.vercel.app/api/webhook` |

6. Clique em **Redeploy** após salvar as variáveis

### Opção B: Via CLI

```bash
npm i -g vercel
vercel login
cd barbearia-ruan
vercel

# Depois de fazer deploy, configure as variáveis:
vercel env add MP_ACCESS_TOKEN
vercel env add FIREBASE_PROJECT_ID
vercel env add FIREBASE_CLIENT_EMAIL
vercel env add FIREBASE_PRIVATE_KEY
vercel env add FIREBASE_DATABASE_URL
vercel env add WEBHOOK_URL

# Redeploy com as variáveis
vercel --prod
```

---

## PASSO 4 — Configurar Webhook no Mercado Pago

1. Acesse: https://mercadopago.com.br/developers/panel/notifications
2. Clique em **Webhooks → Criar**
3. URL: `https://SEU-PROJETO.vercel.app/api/webhook`
4. Eventos: marque **Pagamentos** ✅
5. Salve

> Teste clicando em **Simular** — deve retornar status 200.

---

## PASSO 5 — Testar

1. Abra o site no Vercel
2. Crie uma conta → selecione serviço → data → horário
3. Escolha PIX → aguarde o QR Code aparecer
4. Escaneie com qualquer banco
5. Após pagar, a tela muda automaticamente para ✅ **Agendado!**

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| "MP_ACCESS_TOKEN não configurado" | Adicione a variável no Vercel e faça redeploy |
| QR Code não aparece | Verifique os logs em Vercel → Functions → create-pix |
| Webhook não dispara | Confirme a URL no painel do MP e teste com "Simular" |
| Firebase erro | Verifique se `FIREBASE_PRIVATE_KEY` tem as quebras de linha `\n` corretas |

---

## Fluxo técnico

```
Cliente → /api/create-pix → Mercado Pago (cria PIX)
                          ↓
                    QR Code aparece na tela
                          ↓
               Cliente paga pelo app do banco
                          ↓
        Mercado Pago → POST /api/webhook (automático)
                          ↓
              Firebase: paymentStatus = "paid"
                          ↓
         Frontend detecta via onValue (tempo real)
                          ↓
              ✅ Tela de confirmação automática
```
