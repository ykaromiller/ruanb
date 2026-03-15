/**
 * /api/create-pix
 * Cria um pagamento PIX real no Mercado Pago e retorna o QR Code.
 * 
 * Variável de ambiente necessária no Vercel:
 *   MP_ACCESS_TOKEN = APP_USR-seu-token-aqui
 */

const https = require('https');

function mpRequest(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: 'api.mercadopago.com',
      path,
      method:  'POST',
      headers: {
        'Authorization':      'Bearer ' + process.env.MP_ACCESS_TOKEN,
        'Content-Type':       'application/json',
        'X-Idempotency-Key':  Date.now() + '-' + Math.random(),
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Parse error: ' + raw)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Firebase Admin (para salvar mp_payment_id no agendamento) ──────────────
const admin = require('firebase-admin');

function getFirebase() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }
  return admin.database();
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { aptId, amount, description, payerName } = req.body;
  if (!aptId || !amount) {
    return res.status(400).json({ error: 'aptId e amount são obrigatórios' });
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado no Vercel' });
  }

  try {
    // Cria pagamento PIX no Mercado Pago
    const result = await mpRequest('/v1/payments', {
      transaction_amount: Number(amount),
      description:        description || 'Barbearia Ruan',
      payment_method_id:  'pix',
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // expira em 30min
      notification_url:   process.env.VERCEL_URL
        ? 'https://' + process.env.VERCEL_URL + '/api/webhook'
        : process.env.WEBHOOK_URL || '',
      external_reference: aptId,
      payer: {
        email:      'pagamento@barbearia.com',
        first_name: (payerName || 'Cliente').split(' ')[0],
        last_name:  (payerName || 'Ruan').split(' ').slice(1).join(' ') || 'Barbearia',
      },
    });

    if (result.error) throw new Error(result.message || result.error);

    // Salva mp_payment_id no Firebase para o webhook encontrar depois
    try {
      const db = getFirebase();
      await db.ref('appointments/' + aptId).update({
        mp_payment_id: String(result.id),
        mp_status:     result.status,
      });
    } catch(fbErr) {
      console.error('[create-pix] Firebase update error:', fbErr.message);
      // Não falha — o pagamento foi criado, só o registro auxiliar falhou
    }

    const tx = (result.point_of_interaction && result.point_of_interaction.transaction_data) || {};

    return res.status(200).json({
      payment_id:     result.id,
      status:         result.status,
      qr_code:        tx.qr_code        || null,
      qr_code_base64: tx.qr_code_base64 || null,
    });

  } catch (err) {
    console.error('[create-pix] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
