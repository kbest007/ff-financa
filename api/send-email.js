import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export default async function handler(req, res) {
  // Garante que o timezone local seja considerado (UTC-3)
  const hoje = new Date();
  hoje.setHours(hoje.getHours() - 3);
  const dataFormatada = hoje.toISOString().split('T')[0];

  try {
    // 1. Busca contas que vencem hoje e não estão pagas
    const { data: contas, error } = await supabase
      .from('contas')
      .select('*')
      .eq('data_vencimento', dataFormatada)
      .eq('pago', false);

    if (error) throw error;

    if (!contas || contas.length === 0) {
      return res.status(200).json({ message: 'Nenhuma conta vencendo hoje.' });
    }

    // 2. Monta a lista de contas para o e-mail
    let listaContasHtml = '';
    contas.forEach(conta => {
      listaContasHtml += `<li><strong>${conta.descricao}</strong>: R$ ${conta.valor.toFixed(2)}</li>`;
    });

    // 3. Configura e envia o e-mail informativo
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, // Envia para você mesmo
      subject: `⚠️ Alerta de Vencimento: ${contas.length} conta(s) vence(m) hoje!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Bom dia!</h2>
          <p>Este é um lembrete automático de que existem contas do seu sistema de finanças vencendo hoje (<strong>${dataFormatada.split('-').reverse().join('/')}</strong>):</p>
          <ul style="font-size: 16px; line-height: 1.6;">
            ${listaContasHtml}
          </ul>
          <p>Não se esqueça de efetuar o pagamento e dar a baixa no aplicativo!</p>
          <br>
          <hr style="border: 0; border-top: 1px solid #eee;">
          <small style="color: #999;">Robô de Notificações FF Finanças - Vercel Cron Jobs</small>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, message: 'E-mail de alerta enviado!' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
