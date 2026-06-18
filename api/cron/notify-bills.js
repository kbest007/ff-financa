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
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, provider, amount, dueDate, status, user_id')
      .lte('dueDate', hoje)
      .neq('status', 'paga');

    if (billsError) throw billsError;

    if (!bills || bills.length === 0) {
      return res.status(200).json({ message: 'Nenhuma conta pendente para hoje.' });
    }

    const userIds = [...new Set(bills.map(b => b.user_id))];

    const { data: licenses, error: licensesError } = await supabase
      .from('user_licenses')
      .select('user_id, user_email')
      .in('user_id', userIds);

    if (licensesError) throw licensesError;

    const emailMap = {};
    licenses.forEach(lic => {
      emailMap[lic.user_id] = lic.user_email;
    });

    const emailPromises = bills.map(async (bill) => {
      const userEmail = emailMap[bill.user_id];
      if (!userEmail) return;

      const valorFormatado = Number(bill.amount).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });

      const dataFormatada = bill.dueDate.split('-').reverse().join('/');
      const atrasada = bill.dueDate < hoje;

      const assunto = atrasada
        ? `🚨 Conta Atrasada: ${bill.provider} (venceu em ${dataFormatada})`
        : `⚠️ Lembrete de Vencimento: ${bill.provider}`;

      const mensagemData = atrasada
        ? `venceu em <strong>${dataFormatada}</strong> e ainda consta como <strong>Pendente</strong>`
        : `tem vencimento programado para <strong>hoje</strong>`;

      return transporter.sendMail({
        from: `"FF Finanças" <${process.env.GMAIL_USER}>`,
        to: userEmail,
        subject: assunto,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #2C3E50; margin-bottom: 20px;">Lembrete de Pagamento</h2>
            <p>Olá,</p>
            <p>Informamos que a conta abaixo ${mensagemData} no sistema:</p>
            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${atrasada ? '#C0392B' : '#E67E22'}; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 5px 0;"><strong>Conta:</strong> ${bill.provider}</p>
              <p style="margin: 5px 0;"><strong>Valor:</strong> <span style="color: #C0392B; font-weight: bold;">${valorFormatado}</span></p>
              <p style="margin: 5px 0;"><strong>Vencimento:</strong> ${dataFormatada}</p>
            </div>
            <p style="font-size: 14px; color: #777;">Se você já efetuou o pagamento, acesse o sistema e marque a conta como paga para interromper as notificações automáticas.</p>
            <br />
            <a href="https://ff-financa.vercel.app/" style="display: inline-block; background-color: #27AE60; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Acessar o Painel</a>
          </div>
        `
      });
    });

    await Promise.all(emailPromises);
    return res.status(200).json({ message: `Sucesso: ${bills.length} e-mails processados.` });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
