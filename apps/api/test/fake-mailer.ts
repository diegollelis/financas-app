import { Mailer, type MailMessage } from '../src/mail/mailer.js';

/** Keeps the e-mails in memory instead of sending them, so tests can open the links. */
export class FakeMailer extends Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** The link in the last e-mail sent to `to`. */
  lastLinkTo(to: string): URL {
    const message = this.sent.findLast((m) => m.to === to);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`No e-mail with a link was sent to ${to}`);
    return new URL(link);
  }
}
