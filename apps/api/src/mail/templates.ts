import { PRIVACY_PATH, roleDescriptions, roleLabels, type WorkspaceRole } from '@financas/shared';
import type { MailMessage } from './mailer.js';

/**
 * The name where the logo is not beside it (ADR 0043). It is the sender's name too
 * (`MAIL_FROM_NAME`), so the subjects stay short and start with what to do.
 */
export const MAIL_BRAND = 'CodeLélis Finanças';

/**
 * The approved palette (ADR 0043), written out: e-mail clients know no CSS variables. Light
 * only, declared with `color-scheme`, so a client that darkens messages keeps the contrast.
 */
const colors = {
  page: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#475569',
  primary: '#0066ff',
  onPrimary: '#ffffff',
};
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Why the person got it, under every e-mail of the account. */
const ACCOUNT_REASON = `Você recebeu este e-mail porque este endereço está ligado a uma conta do ${MAIL_BRAND}.`;

interface Content {
  subject: string;
  /** The line the inbox shows after the subject, before the message is opened. */
  preview: string;
  /** Already escaped HTML. */
  paragraphs: string[];
  button: { label: string; url: string };
  note: string;
  reason: string;
}

/**
 * The e-mails all look the same: the logo, a card with the message and one button, then why it
 * came and the links to the app and the privacy policy. Tables and inline styles, which every
 * client renders; no tracking pixel or tracked link (ADR 0012). The logo is served by the web app
 * and has the brand name as its alternative text, for the clients that block images.
 */
function render(web: string, content: Content): { html: string; text: string } {
  const home = new URL('/', web).toString();
  const privacy = new URL(PRIVACY_PATH, web).toString();
  const logo = new URL('/brand/logo-horizontal-light.png', web).toString();
  const url = escapeHtml(content.button.url);
  const link = `color: ${colors.primary}; text-decoration: underline`;

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: ${colors.page}">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0">${escapeHtml(content.preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${colors.page}">
      <tr>
        <td align="center" style="padding: 24px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: ${colors.card}; border: 1px solid ${colors.border}; border-radius: 12px">
            <tr>
              <td style="padding: 24px 24px 0">
                <a href="${home}"><img src="${logo}" width="180" height="40" alt="${MAIL_BRAND}" style="display: block; border: 0; width: 180px; height: 40px; font-family: ${font}; font-size: 18px; font-weight: 600; color: ${colors.text}"></a>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px; font-family: ${font}; font-size: 16px; line-height: 1.5; color: ${colors.text}">
                ${content.paragraphs.map((p) => `<p style="margin: 0 0 16px">${p}</p>`).join('\n                ')}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0">
                  <tr>
                    <td style="background: ${colors.primary}; border-radius: 8px">
                      <a href="${url}" style="display: inline-block; padding: 12px 20px; font-family: ${font}; font-size: 16px; font-weight: 600; color: ${colors.onPrimary}; text-decoration: none; border-radius: 8px">${content.button.label}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 0 0 16px; font-size: 14px; color: ${colors.muted}">${content.note}</p>
                <p style="margin: 0; font-size: 13px; color: ${colors.muted}; word-break: break-all">Se o botão não abrir, copie este endereço no navegador: <a href="${url}" style="${link}">${url}</a></p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px">
            <tr>
              <td style="padding: 16px 24px; font-family: ${font}; font-size: 13px; line-height: 1.5; color: ${colors.muted}">
                <p style="margin: 0 0 8px">${content.reason} Este endereço não recebe respostas.</p>
                <p style="margin: 0"><a href="${home}" style="${link}">${MAIL_BRAND}</a>&nbsp;&nbsp;&nbsp;<a href="${privacy}" style="${link}">Política de privacidade</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `\n\n${content.reason} Este endereço não recebe respostas.\n${MAIL_BRAND}: ${home}\nPolítica de privacidade: ${privacy}`;
  return { html, text };
}

/** Builds a message: the text version is the template's own, plus the same footer. */
function message(to: string, web: string, text: string, content: Content): MailMessage {
  const rendered = render(web, content);
  return { to, subject: content.subject, text: text + rendered.text, html: rendered.html };
}

/** The e-mails of the app, with links to the web app at `web` (`WEB_ORIGIN`). */
export function mailTemplates(web: string) {
  return {
    verificationEmail: (to: string, name: string, url: string): MailMessage => {
      const note = `O link vale por 1 hora. Se você não criou uma conta no ${MAIL_BRAND}, ignore este e-mail.`;
      return message(
        to,
        web,
        `Olá, ${name}!\n\nConfirme seu e-mail abrindo o link abaixo:\n${url}\n\n${note}`,
        {
          subject: 'Confirme seu e-mail',
          preview: `Falta só confirmar o e-mail para concluir o cadastro no ${MAIL_BRAND}.`,
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            `Confirme seu e-mail para concluir o cadastro no ${MAIL_BRAND}.`,
          ],
          button: { label: 'Confirmar e-mail', url },
          note,
          reason: ACCOUNT_REASON,
        },
      );
    },

    /**
     * Someone tried to sign up with an e-mail that already has an account (ADR 0022). The
     * sign-up answers as if it were new, so nobody learns which e-mails have an account; the
     * owner hears it here, with the way in. It signs no one in and verifies nothing.
     */
    existingAccountEmail: (
      to: string,
      name: string,
      links: { signIn: string; resetPassword: string },
    ): MailMessage => {
      const note =
        'Se não foi você que tentou se cadastrar, ignore este e-mail: nada mudou na sua conta.';
      return message(
        to,
        web,
        `Olá, ${name}!\n\nAlguém tentou criar uma conta no ${MAIL_BRAND} com este e-mail, mas ele já tem uma.\n\nPara entrar: ${links.signIn}\nSe não lembra a senha, crie uma nova: ${links.resetPassword}\n\n${note}`,
        {
          subject: 'Você já tem uma conta',
          preview: 'Alguém tentou se cadastrar com este e-mail, que já tem uma conta.',
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            `Alguém tentou criar uma conta no ${MAIL_BRAND} com este e-mail, mas ele já tem uma.`,
            `Se não lembra a senha, <a href="${escapeHtml(links.resetPassword)}" style="color: ${colors.primary}">crie uma nova</a>.`,
          ],
          button: { label: 'Entrar', url: links.signIn },
          note,
          reason: ACCOUNT_REASON,
        },
      );
    },

    resetPasswordEmail: (to: string, name: string, url: string): MailMessage => {
      const note =
        'O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.';
      return message(
        to,
        web,
        `Olá, ${name}!\n\nPara criar uma nova senha, abra o link abaixo:\n${url}\n\n${note}`,
        {
          subject: 'Redefina sua senha',
          preview: 'Recebemos um pedido para redefinir a sua senha.',
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            'Recebemos um pedido para redefinir a sua senha.',
          ],
          button: { label: 'Criar nova senha', url },
          note,
          reason: ACCOUNT_REASON,
        },
      );
    },

    /** The access by the same name and words as the invitation page and Membros. */
    invitationEmail: (
      to: string,
      invite: { inviterName: string; workspaceName: string; role: WorkspaceRole; url: string },
    ): MailMessage => {
      const access = `Seu acesso: ${roleLabels[invite.role]}.`;
      const allows = capitalize(roleDescriptions[invite.role]);
      const workspace =
        'Um espaço reúne as finanças de uma pessoa, de uma casa ou de um grupo. A sua conta e o seu espaço pessoal continuam só seus.';
      const note =
        'O convite vale por 7 dias. Para aceitar, entre (ou crie sua conta) com este mesmo e-mail. Se não esperava este convite, ignore este e-mail.';
      return message(
        to,
        web,
        `${invite.inviterName} convidou você para o espaço "${invite.workspaceName}".\n\n${access} ${allows}\n\n${workspace}\n\nPara aceitar, abra o link abaixo:\n${invite.url}\n\n${note}`,
        {
          subject: oneLine(`${invite.inviterName} convidou você para "${invite.workspaceName}"`),
          preview: `${access} ${allows}`,
          paragraphs: [
            `<strong>${escapeHtml(invite.inviterName)}</strong> convidou você para o espaço <strong>${escapeHtml(invite.workspaceName)}</strong>.`,
            `<strong>${access}</strong> ${allows}`,
            workspace,
          ],
          button: { label: 'Ver convite', url: invite.url },
          note,
          reason: `Você recebeu este e-mail porque ${escapeHtml(oneLine(invite.inviterName))} convidou este endereço para um espaço no ${MAIL_BRAND}.`,
        },
      );
    },

    /**
     * The link that confirms deleting the account (ADR 0041). It opens a page of the web app,
     * which asks once more before deleting: whoever holds an unlocked device cannot delete it in
     * one tap.
     */
    deleteAccountEmail: (to: string, name: string, url: string): MailMessage => {
      const note =
        'O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: a sua conta continua como está. Se achar que alguém entrou nela, troque a senha.';
      return message(
        to,
        web,
        `Olá, ${name}!\n\nRecebemos um pedido para excluir a sua conta no ${MAIL_BRAND} e todos os seus dados. Para confirmar, abra o link abaixo:\n${url}\n\n${note}`,
        {
          subject: 'Confirme a exclusão da sua conta',
          preview: 'Recebemos um pedido para excluir a sua conta e todos os seus dados.',
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            `Recebemos um pedido para excluir a sua conta no ${MAIL_BRAND} e todos os seus dados.`,
            'Ao abrir o link, você confirma a exclusão mais uma vez. Depois disso, ela não pode ser desfeita.',
          ],
          button: { label: 'Confirmar exclusão', url },
          note,
          reason: ACCOUNT_REASON,
        },
      );
    },

    /** Changing the account's e-mail (ADR 0049): the link goes to the new address. */
    changeEmailVerificationEmail: (to: string, name: string, url: string): MailMessage => {
      const note =
        'O link vale por 1 hora. Se você não pediu esta troca, ignore este e-mail: nada muda.';
      return message(
        to,
        web,
        `Olá, ${name}!\n\nVocê pediu para usar este endereço na sua conta do ${MAIL_BRAND}. Confirme abrindo o link abaixo:\n${url}\n\nAté confirmar, a conta continua com o e-mail de antes.\n\n${note}`,
        {
          subject: 'Confirme seu novo e-mail',
          preview: 'Confirme o endereço para usá-lo na sua conta.',
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            `Você pediu para usar este endereço na sua conta do ${MAIL_BRAND}.`,
            'Até confirmar, a conta continua com o e-mail de antes.',
          ],
          button: { label: 'Confirmar novo e-mail', url },
          note,
          reason: `Você recebeu este e-mail porque este endereço foi informado como o novo e-mail de uma conta do ${MAIL_BRAND}.`,
        },
      );
    },

    /**
     * The notice to the address in use when someone asks to change it (ADR 0049): whoever owns
     * it learns at once, and can act if it was not them.
     */
    changeEmailNoticeEmail: (
      to: string,
      name: string,
      newEmail: string,
      resetPasswordUrl: string,
    ): MailMessage => {
      const note =
        'A troca só acontece se o novo endereço for confirmado. Se foi você, não precisa fazer nada.';
      return message(
        to,
        web,
        `Olá, ${name}!\n\nFoi pedida a troca do e-mail da sua conta no ${MAIL_BRAND} para ${newEmail}.\n\nSe não foi você, troque sua senha agora: ${resetPasswordUrl}\n\n${note}`,
        {
          subject: 'Pedido de troca do seu e-mail',
          preview: 'Foi pedida a troca do e-mail da sua conta. Se não foi você, troque a senha.',
          paragraphs: [
            `Olá, ${escapeHtml(name)}!`,
            `Foi pedida a troca do e-mail da sua conta no ${MAIL_BRAND} para <strong>${escapeHtml(newEmail)}</strong>.`,
            'Se não foi você, troque sua senha agora.',
          ],
          button: { label: 'Trocar senha', url: resetPasswordUrl },
          note,
          reason: ACCOUNT_REASON,
        },
      );
    },
  };
}

export type MailTemplates = ReturnType<typeof mailTemplates>;
