import { describe, expect, it } from 'vitest';
import { invitationEmail, resetPasswordEmail, verificationEmail } from './templates.js';

describe('e-mail templates', () => {
  it('puts the link in the text and HTML versions', () => {
    const message = verificationEmail('maria@example.com', 'Maria', 'http://api.test/x?token=abc');

    expect(message.to).toBe('maria@example.com');
    expect(message.text).toContain('http://api.test/x?token=abc');
    expect(message.html).toContain('href="http://api.test/x?token=abc"');
  });

  it('escapes the name in the HTML version', () => {
    const message = resetPasswordEmail('maria@example.com', '<b>Maria</b>', 'http://api.test/r');

    expect(message.html).toContain('&lt;b&gt;Maria&lt;/b&gt;');
    expect(message.html).not.toContain('<b>Maria</b>');
  });
});

describe('invitation e-mail', () => {
  it('names who invited, the workspace and the access, escaping both names', () => {
    const message = invitationEmail('joao@example.com', {
      inviterName: 'Maria <b>',
      workspaceName: 'Casa & praia',
      canEdit: false,
      url: 'http://web.test/convites/abc',
    });

    expect(message.subject).toBe('Maria <b> convidou você para "Casa & praia" no Finanças');
    expect(message.text).toContain('para ver as finanças');
    expect(message.text).toContain('http://web.test/convites/abc');
    expect(message.html).toContain('Maria &lt;b&gt;');
    expect(message.html).toContain('Casa &amp; praia');
  });
});

describe('invitation e-mail subject', () => {
  it('keeps the subject on one line, whatever the names contain', () => {
    const message = invitationEmail('joao@example.com', {
      inviterName: 'Maria\nBcc: alguem@example.com',
      workspaceName: 'Casa',
      canEdit: true,
      url: 'http://web.test/convites/abc',
    });

    expect(message.subject).not.toMatch(/[\r\n]/);
  });
});
