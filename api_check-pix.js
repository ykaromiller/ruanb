/**
 * /api/check-pix
 * Fallback: verifica se o pagamento foi aprovado.
 * Chamado pelo botão "Já Paguei" se o webhook ainda não chegou.
 */

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { aptId } = req.body;
  if (!aptId) return res.status(400).json({ error: 'aptId obrigatório' });

  try {
    const db   = getFirebase();
    const snap = await db.ref('appointments/' + aptId).get();
    if (!snap.exists()) return res.status(404).json({ error: 'Agendamento não encontrado' });

    const apt = snap.val();
    return res.status(200).json({
      paymentStatus: apt.paymentStatus,
      mp_status:     apt.mp_status || null,
      paidAt:        apt.paidAt    || null,
    });
  } catch (err) {
    console.error('[check-pix] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
