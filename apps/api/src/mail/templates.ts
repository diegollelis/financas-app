import type { MailMessage } from './mailer.js';

/** The user's name goes into HTML: escape it so it cannot inject markup into the e-mail. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(paragraphs: string[], button: { label: string; url: string }, note: string) {
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: system-ui, sans-serif; color: #18181b; line-height: 1.5">
    ${paragraphs.map((p) => `<p>${p}</p>`).join('\n    ')}
    <p>
      <a href="${escapeHtml(button.url)}"
        style="display: inline-block; padding: 10px 16px; background: #18181b; color: #fff; border-radius: 8px; text-decoration: none">
        ${button.label}
      </a>
    </p>
    <p style="color: #71717a; font-size: 14px">${note}</p>
  </body>
</html>`;
  return html;
}

export function verificationEmail(to: string, name: string, url: string): MailMessage {
  const note =
    'O link vale por 1 hora. Se você não criou uma conta no Finanças, ignore este e-mail.';
  return {
    to,
    subject: 'Confirme seu e-mail no Finanças',
    text: `Olá, ${name}!\n\nConfirme seu e-mail abrindo o link abaixo:\n${url}\n\n${note}`,
    html: layout(
      [`Olá, ${escapeHtml(name)}!`, 'Confirme seu e-mail para concluir o cadastro no Finanças.'],
      { label: 'Confirmar e-mail', url },
      note,
    ),
  };
}

export function resetPasswordEmail(to: string, name: string, url: string): MailMessage {
  const note =
    'O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.';
  return {
    to,
    subject: 'Redefina sua senha no Finanças',
    text: `Olá, ${name}!\n\nPara criar uma nova senha, abra o link abaixo:\n${url}\n\n${note}`,
    html: layout(
      [`Olá, ${escapeHtml(name)}!`, 'Recebemos um pedido para redefinir a sua senha.'],
      { label: 'Criar nova senha', url },
      note,
    ),
  };
}
