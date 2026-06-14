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
  // Define a data de hoje (ajustada para o fuso horário correto)
  const hoje = new Date();
  hoje.setHours(hoje.getHours() - 3);
  const dataFormatada = hoje.toISOString().split('T')[0];

  try {
    // 1. Busca contas com status 'PENDING' que vencem HOJE ou ANTES (Atrasadas)
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('status', 'PENDING')
      .lte('dueDate', dataFormatada); // lte = Menor ou igual (pega tudo que venceu até hoje)

    if (error) throw error;

    if (!bills || bills.length === 0) {
      return res.status(200).json({ message: 'Nenhuma conta pendente ou vencida.' });
    }

    // 2. Monta a lista de contas para o e-mail
    let listaContasHtml = '';
    bills.forEach(bill => {
      // Formata a data para ficar mais legível no e-mail (DD/MM/AAAA)
      const dataVenc = bill.dueDate.split('-').reverse().join('/');
      listaContasHtml += `<li><strong>${bill.provider}</strong> (Vencimento: ${dataVenc}): R$ ${bill.amount.toFixed(2)}</li>`;
    });

    // 3. Configura e envia o e-mail informativo
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, 
      subject: `⚠️ Alerta: Você tem ${bills.length} conta(s) pendente(s)!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Olá!</h2>
          <p>Este é um lembrete automático das suas contas pendentes ou atrasadas até o dia <strong>${dataFormatada.split('-').reverse().join('/')}</strong>:</p>
          <ul style="font-size: 16px; line-height: 1.6;">
            ${listaContasHtml}
          </ul>
          <p>Por favor, verifique seus pagamentos no painel financeiro.</p>
          <br>
          <hr style="border: 0; border-top: 1px solid #eee;">
          <small style="color: #999;">Robô de Notificações FF Finanças</small>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ success: true, message: `E-mail enviado com ${bills.length} conta(s).` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
