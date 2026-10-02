export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends e-mail. An abstract class (not an interface) so it can be a Nest injection token; the
 * implementation is picked by MAIL_TRANSPORT, and tests replace it with a fake.
 * Errors never carry the message content: links in it contain tokens (ADR 0012).
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

type Sender = { email: string; name: string };

/** Development: delivers to Mailpit's inbox (http://localhost:8025) through its HTTP API. */
export class MailpitMailer extends Mailer {
  constructor(
    private readonly baseUrl: string,
    private readonly from: Sender,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(new URL('/api/v1/send', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        From: { Email: this.from.email, Name: this.from.name },
        To: [{ Email: message.to }],
        Subject: message.subject,
        Text: message.text,
        HTML: message.html,
      }),
    });
    if (!response.ok) throw new Error(`Mailpit responded with status ${response.status}`);
  }
}

/** Production: Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer extends Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: Sender,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${this.from.name} <${this.from.email}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) throw new Error(`Resend responded with status ${response.status}`);
  }
}
