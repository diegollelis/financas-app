import { describe, expect, it } from 'vitest';
import { MAIL_BRAND, mailTemplates } from './templates.js';

const web = 'http://web.test';
const { invitationEmail, resetPasswordEmail, verificationEmail } = mailTemplates(web);

describe('e-mail templates', () => {
  it('puts the link in the text and HTML versions', () => {
    const message = verificationEmail('maria@example.com', 'Maria', 'http://api.test/x?token=abc');

    expect(message.to).toBe('maria@example.com');
    expect(message.subject).toBe('Confirme seu e-mail');
    expect(message.text).toContain('http://api.test/x?token=abc');
    expect(message.html).toContain('href="http://api.test/x?token=abc"');
  });

  it('escapes the name in the HTML version', () => {
    const message = resetPasswordEmail('maria@example.com', '<b>Maria</b>', 'http://api.test/r');

    expect(message.html).toContain('&lt;b&gt;Maria&lt;/b&gt;');
    expect(message.html).not.toContain('<b>Maria</b>');
  });

  it('carries the brand: the logo from the web app, named for blocked images, and the footer', () => {
    const message = resetPasswordEmail('maria@example.com', 'Maria', 'http://api.test/r');

    expect(message.html).toContain(`src="${web}/brand/logo-horizontal-light.png"`);
    expect(message.html).toContain(`alt="${MAIL_BRAND}"`);
    expect(message.html).toContain(`href="${web}/privacidade"`);
    expect(message.html).toContain('Este endereço não recebe respostas.');
    expect(message.text).toContain(`Política de privacidade: ${web}/privacidade`);
  });

  it('tracks nothing: every link and image points at the web app or the button', () => {
    const message = verificationEmail('maria@example.com', 'Maria', 'http://api.test/x?token=abc');
    const targets = [...message.html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
      (match) => match[1] ?? '',
    );

    for (const target of targets) {
      expect(target.startsWith(web) || target === 'http://api.test/x?token=abc').toBe(true);
    }
  });
});

describe('invitation e-mail', () => {
  it('names who invited, the workspace and the access as the web app does, escaping the names', () => {
    const message = invitationEmail('joao@example.com', {
      inviterName: 'Maria <b>',
      workspaceName: 'Casa & praia',
      role: 'VIEWER',
      url: 'http://web.test/convites/abc',
    });

    expect(message.subject).toBe('Maria <b> convidou você para "Casa & praia"');
    expect(message.text).toContain('Seu acesso: Só visualizar. Vê tudo, sem mudar nada.');
    expect(message.text).toContain('http://web.test/convites/abc');
    expect(message.html).toContain('Maria &lt;b&gt;');
    expect(message.html).not.toContain('Maria <b>');
    expect(message.html).toContain('Casa &amp; praia');
  });

  it('keeps the subject on one line, whatever the names contain', () => {
    const message = invitationEmail('joao@example.com', {
      inviterName: 'Maria\nBcc: alguem@example.com',
      workspaceName: 'Casa',
      role: 'EDITOR',
      url: 'http://web.test/convites/abc',
    });

    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.text).toContain('Seu acesso: Pode editar.');
  });
});
