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
  const hoje = new Date();
  hoje.setHours(hoje.getHours() - 3);
  const dataFormatada = hoje.toISOString().split('T')[0];

  try {
    // 1. Busca na tabela 'bills' as contas pendentes que vencem hoje
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('dueDate', dataFormatada)
      .eq('status', 'PENDING');

    if (error) throw error;

    if (!bills || bills.length === 0) {
      return res.status(200).json({ message: 'Nenhuma conta vencendo hoje.' });
    }

    // 2. Monta a lista de contas para o e-mail
    let listaContasHtml = '';
    bills.forEach(bill => {
      listaContasHtml += `<li><strong>${bill.provider}</strong>: R$ ${bill.amount.toFixed(2)}</li>`;
    });

    // 3. Configura e envia o e-mail
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, 
      subject: `⚠️ Alerta de Vencimento: ${bills.length} conta(s) vence(m) hoje!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Bom dia!</h2>
          <p>Lembrete de contas que vencem hoje (<strong>${dataFormatada.split('-').reverse().join('/')}</strong>):</p>
          <ul>${listaContasHtml}</ul>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'E-mail de alerta enviado!' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
