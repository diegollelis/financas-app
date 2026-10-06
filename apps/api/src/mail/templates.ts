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

/** Subjects are headers: user-typed names must not carry line breaks into them. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

/**
 * Someone tried to sign up with an e-mail that already has an account (ADR 0022). The sign-up
 * answers as if it were new, so nobody learns which e-mails have an account; the owner hears it
 * here, with the way in. It signs no one in and verifies nothing.
 */
export function existingAccountEmail(
  to: string,
  name: string,
  links: { signIn: string; resetPassword: string },
): MailMessage {
  const note =
    'Se não foi você que tentou se cadastrar, ignore este e-mail: nada mudou na sua conta.';
  return {
    to,
    subject: 'Você já tem uma conta no Finanças',
    text: `Olá, ${name}!\n\nAlguém tentou criar uma conta no Finanças com este e-mail, mas ele já tem uma.\n\nPara entrar: ${links.signIn}\nSe não lembra a senha, crie uma nova: ${links.resetPassword}\n\n${note}`,
    html: layout(
      [
        `Olá, ${escapeHtml(name)}!`,
        'Alguém tentou criar uma conta no Finanças com este e-mail, mas ele já tem uma.',
        `Se não lembra a senha, <a href="${escapeHtml(links.resetPassword)}">crie uma nova</a>.`,
      ],
      { label: 'Entrar', url: links.signIn },
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

export function invitationEmail(
  to: string,
  invite: { inviterName: string; workspaceName: string; canEdit: boolean; url: string },
): MailMessage {
  const access = invite.canEdit ? 'ver e editar' : 'ver';
  const note =
    'O convite vale por 7 dias. Para aceitar, entre (ou crie sua conta) com este mesmo e-mail. Se não esperava este convite, ignore este e-mail.';
  return {
    to,
    subject: oneLine(
      `${invite.inviterName} convidou você para "${invite.workspaceName}" no Finanças`,
    ),
    text: `${invite.inviterName} convidou você para ${access} as finanças do espaço "${invite.workspaceName}".\n\nPara aceitar, abra o link abaixo:\n${invite.url}\n\n${note}`,
    html: layout(
      [
        `<strong>${escapeHtml(invite.inviterName)}</strong> convidou você para ${access} as finanças do espaço <strong>${escapeHtml(invite.workspaceName)}</strong>.`,
      ],
      { label: 'Ver convite', url: invite.url },
      note,
    ),
  };
}
