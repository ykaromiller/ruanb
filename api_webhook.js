/**
 * /api/webhook
 * Recebido automaticamente pelo Mercado Pago quando o status do pagamento muda.
 * Atualiza o Firebase e confirma o agendamento quando aprovado.
 *
 * Configure no painel do MP:
 *   URL: https://SEU-PROJETO.vercel.app/api/webhook
 *   Evento: payment
 */

const https = require('https');
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

function mpGet(paymentId) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.mercadopago.com',
      path:     '/v1/payments/' + paymentId,
      headers:  { 'Authorization': 'Bearer ' + process.env.MP_ACCESS_TOKEN },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Parse error: ' + raw)); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  // MP só envia POST, mas aceita GET para teste
  if (req.method === 'GET') return res.status(200).send('Webhook ativo');
  if (req.method !== 'POST') return res.status(405).end();

  const topic  = (req.body && req.body.type)                    || req.query.topic;
  const dataId = (req.body && req.body.data && req.body.data.id) || req.query.id;

  // Só processa notificações de pagamento
  if (topic !== 'payment' || !dataId) {
    return res.status(200).json({ status: 'ignored', topic, dataId });
  }

  try {
    // Busca detalhes do pagamento na API do MP
    const payment = await mpGet(dataId);
    const aptId   = payment.external_reference;
    const status  = payment.status; // approved | rejected | pending | cancelled

    if (!aptId) return res.status(200).json({ status: 'no_reference' });

    const db   = getFirebase();
    const snap = await db.ref('appointments/' + aptId).get();

    if (!snap.exists()) {
      console.warn('[webhook] Agendamento não encontrado:', aptId);
      return res.status(200).json({ status: 'apt_not_found' });
    }

    const updates = {
      mp_payment_id: String(payment.id),
      mp_status:     status,
      mp_updated_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      // ✅ PAGO — confirma o agendamento automaticamente
      updates.paymentStatus = 'paid';
      updates.paidAt        = new Date().toISOString();

      // Notificação em tempo real para o barbeiro no frontend
      await db.ref('notifications/' + aptId).set({
        type:      'payment_confirmed',
        aptId,
        amount:    payment.transaction_amount,
        method:    'pix',
        timestamp: new Date().toISOString(),
        read:      false,
      });

      console.log('[webhook] ✅ PIX aprovado:', aptId, 'R$', payment.transaction_amount);

    } else if (status === 'rejected' || status === 'cancelled') {
      updates.paymentStatus = 'rejected';
      console.log('[webhook] ❌ Pagamento', status, ':', aptId);
    }

    await db.ref('appointments/' + aptId).update(updates);
    return res.status(200).json({ status: 'ok', aptId, payment_status: status });

  } catch (err) {
    console.error('[webhook] Error:', err.message);
    // Sempre retorna 200 para o MP não retentar indefinidamente
    return res.status(200).json({ status: 'error', message: err.message });
  }
};
