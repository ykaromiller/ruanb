const https = require('https');
const admin = require('firebase-admin');

function getFirebase() {
  if (!admin.apps.length) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
      .replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
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
        catch(e) { reject(new Error('Parse: ' + raw)); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  // Permite acesso público ao webhook (Mercado Pago precisa chamar sem autenticação)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('x-vercel-protection-bypass', process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '');

  if (req.method === 'GET') return res.status(200).send('Webhook ativo - OK');
  if (req.method !== 'POST') return res.status(200).end();

  const topic  = (req.body && req.body.type)                     || req.query.topic;
  const dataId = (req.body && req.body.data && req.body.data.id) || req.query.id;

  console.log('[webhook] topic:', topic, 'id:', dataId);

  if (topic !== 'payment' || !dataId) {
    return res.status(200).json({ status: 'ignored' });
  }

  try {
    const payment = await mpGet(dataId);
    const aptId   = payment.external_reference;
    const status  = payment.status;

    console.log('[webhook] payment status:', status, 'aptId:', aptId);

    if (!aptId) return res.status(200).json({ status: 'no_reference' });

    const db   = getFirebase();
    const snap = await db.ref('appointments/' + aptId).get();

    if (!snap.exists()) {
      console.warn('[webhook] aptId nao encontrado:', aptId);
      return res.status(200).json({ status: 'not_found' });
    }

    const updates = {
      mp_payment_id: String(payment.id),
      mp_status:     status,
      mp_updated_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      updates.paymentStatus = 'paid';
      updates.paidAt        = new Date().toISOString();

      await db.ref('notifications/' + aptId).set({
        type:      'payment_confirmed',
        aptId,
        amount:    payment.transaction_amount,
        method:    'pix',
        timestamp: new Date().toISOString(),
        read:      false,
      });

      console.log('[webhook] PAGO:', aptId, 'R$', payment.transaction_amount);

    } else if (status === 'rejected' || status === 'cancelled') {
      updates.paymentStatus = 'rejected';
      console.log('[webhook] REJEITADO:', aptId);
    }

    await db.ref('appointments/' + aptId).update(updates);
    return res.status(200).json({ status: 'ok', paymentStatus: updates.paymentStatus });

  } catch (err) {
    console.error('[webhook] Error:', err.message);
    return res.status(200).json({ status: 'error', message: err.message });
  }
};
