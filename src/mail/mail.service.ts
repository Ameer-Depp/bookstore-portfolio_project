import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { User } from '../entities/user.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = 'no-reply@bookstore.local';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('MAIL_HOST');

    if (!host) {
      this.logger.log(
        'MAIL_HOST not set — emails will be logged to console instead of sent',
      );
      return;
    }

    this.fromAddress = this.config.get<string>('MAIL_FROM') || this.fromAddress;

    const port = Number(this.config.get<string>('MAIL_PORT') ?? 587);
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; everything else (587, 2525) is STARTTLS.
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    this.logger.log(`Mailer configured for ${host}:${port}`);
  }

  // ---------- Public API ----------

  async sendOrderConfirmation(user: User, order: Order): Promise<void> {
    const items = (order.items ?? []).map((item: OrderItem) => ({
      title: item.book?.title ?? 'Book',
      unitPrice: item.unitPrice,
    }));

    const itemsHtml = items
      .map(
        (i) =>
          `<tr><td style="padding:6px 0">${escapeHtml(i.title)}</td>` +
          `<td style="padding:6px 0;text-align:right">$${i.unitPrice}</td></tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2>Thank you for your purchase, ${escapeHtml(user.name)}!</h2>
        <p>Your order <strong>${order.id}</strong> has been confirmed.</p>
        <table style="width:100%;border-collapse:collapse">
          ${itemsHtml}
          <tr><td style="padding-top:10px;border-top:1px solid #ccc"><strong>Total</strong></td>
              <td style="padding-top:10px;border-top:1px solid #ccc;text-align:right">
                <strong>$${order.totalAmount}</strong></td></tr>
        </table>
        <p style="margin-top:20px">
          Your books are now available in your library.
        </p>
      </div>
    `;

    await this.send({
      to: user.email,
      subject: `Your bookstore order ${order.id.slice(0, 8)}`,
      html,
      logLabel: `order confirmation for ${user.email}`,
    });
  }

  async sendPasswordReset(user: User, resetUrl: string): Promise<void> {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2>Password reset requested</h2>
        <p>Hi ${escapeHtml(user.name)},</p>
        <p>Someone (hopefully you) requested a password reset for your account.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:10px 16px;
                    background:#2563eb;color:#fff;text-decoration:none;
                    border-radius:4px">
            Reset password
          </a>
        </p>
        <p style="color:#666;font-size:12px">
          This link expires in one hour. If you did not request this, you can
          ignore this email — your password will not change.
        </p>
        <p style="color:#666;font-size:12px;word-break:break-all">
          Or paste this URL into your browser:<br>${escapeHtml(resetUrl)}
        </p>
      </div>
    `;

    await this.send({
      to: user.email,
      subject: 'Reset your password',
      html,
      logLabel: `password reset for ${user.email}`,
    });
  }

  // ---------- Internal ----------

  private async send(options: {
    to: string;
    subject: string;
    html: string;
    logLabel: string;
  }): Promise<void> {
    if (!this.transporter) {
      // No SMTP configured — log a compact rendition to the console.
      // Section 1 of the spec: email sending is best-effort and must
      // never break the caller; the try/catch in callers handles failures.
      this.logger.log(
        `[MAIL-DEV] ${options.logLabel} → ${options.to} | "${options.subject}"`,
      );
      this.logger.debug(`[MAIL-DEV] Body: ${options.html}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Sent ${options.logLabel} to ${options.to}`);
    } catch (err) {
      // Section 1: sending is best-effort. Never let an SMTP failure
      // bubble up and roll back a checkout or a password reset.
      this.logger.error(
        `Failed to send ${options.logLabel} to ${options.to}: ${
          (err as Error).message
        }`,
      );
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
