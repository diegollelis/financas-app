import { describe, expect, it } from 'vitest';
import { resetPasswordEmail, verificationEmail } from './templates.js';

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
