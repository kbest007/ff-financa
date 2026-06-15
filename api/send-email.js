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
  // Data de hoje (YYYY-MM-DD)
  const hoje = new Date();
  hoje.setHours(hoje.getHours() - 3);
  const dataFormatada = hoje.toISOString().split('T')[0];

  try {
    // 1. Busca TUDO que vence hoje ou antes, sem filtrar status
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .lte('dueDate', dataFormatada); 

    if (error) throw error;

    // Log para debug no console da Vercel
    console.log("Data de hoje:", dataFormatada);
    console.log("Contas encontradas:", bills);

    if (!bills || bills.length === 0) {
      return res.status(200).json({ 
        message: 'Nenhuma conta encontrada.',
        debug_date: dataFormatada 
      });
    }

    // 2. Monta a lista de contas
    let listaContasHtml = '';
    bills.forEach(bill => {
      listaContasHtml += `<li><strong>${bill.provider}</strong> (Vencimento: ${bill.dueDate}): R$ ${bill.amount}</li>`;
    });

    // 3. Envia e-mail
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, 
      subject: `⚠️ Alerta: ${bills.length} conta(s) encontrada(s)`,
      html: `
        <div style="font-family: sans-serif;">
          <h2>Contas vencidas ou hoje:</h2>
          <ul>${listaContasHtml}</ul>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, count: bills.length, bills });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
