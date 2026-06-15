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
    // 1. Busca contas PENDENTES que vencem HOJE OU ESTÃO ATRASADAS
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .eq('status', 'pendente')
      .lte('dueDate', dataFormatada); // Vence hoje ou antes (atrasadas)

    if (billsError) throw billsError;
    if (!bills || bills.length === 0) return res.status(200).json({ message: 'Nenhuma conta pendente.' });

    // 2. Pega os emails dos usuários
    const userIds = [...new Set(bills.map(b => b.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, email')
      .in('user_id', userIds);

    if (profilesError) throw profilesError;

    // 3. Cria um mapa de user_id → email
    const emailMap = {};
    profiles.forEach(p => {
      emailMap[p.user_id] = p.email;
    });

    // 4. Agrupa as contas por usuário
    const gruposPorUsuario = bills.reduce((acc, bill) => {
      const email = emailMap[bill.user_id];
      if (!email) return acc;
      if (!acc[email]) acc[email] = [];
      acc[email].push(bill);
      return acc;
    }, {});

    // 5. Envia e-mail para cada usuário encontrado
    for (const email in gruposPorUsuario) {
      const contasDoUsuario = gruposPorUsuario[email];
      let listaHtml = contasDoUsuario.map(b => {
        const vencimento = b.dueDate.split('-').reverse().join('/');
        const diasAtraso = Math.floor((new Date() - new Date(b.dueDate)) / (1000 * 60 * 60 * 24));
        const status = diasAtraso > 0 ? `(${diasAtraso} dias atrasada)` : '(vence hoje)';
        return `<li><strong>${b.provider}</strong> - Vencimento: ${vencimento} ${status} - R$ ${b.amount}</li>`;
      }).join('');

      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: '⚠️ Alerta: Contas Pendentes - AÇÃO NECESSÁRIA',
        html: `<div style="font-family: sans-serif;"><h2>Olá!</h2><p>Você tem contas pendentes que vencem hoje ou estão atrasadas:</p><ul>${listaHtml}</ul><p style="color: red;"><strong>Por favor, regularize em breve!</strong></p></div>`
      });
    }

    return res.status(200).json({ success: true, totalEmailsEnviados: Object.keys(gruposPorUsuario).length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
