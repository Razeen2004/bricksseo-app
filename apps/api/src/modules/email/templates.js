import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { getSettingSection } from '../../lib/settings.js';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Shared visual building blocks for every branded (customer-facing) email.
// Plain inline styles + tables throughout — no <style> block, no flexbox —
// so this survives Gmail, Outlook and Apple Mail's varying CSS support.
const COLORS = {
  bg: '#050608',
  card: '#0a0b10',
  border: '#1e212b',
  box: '#12141b',
  text: '#f5f5f7',
  muted: '#9399a8',
  footer: '#5b6170',
  accent: { bar: '#6366f1', bg: 'rgba(99,102,241,0.15)', fg: '#a5b4fc' },
  success: { bar: '#10b981', bg: 'rgba(16,185,129,0.14)', fg: '#34d399' },
  danger: { bar: '#ef4444', bg: 'rgba(239,68,68,0.14)', fg: '#f87171' },
  warning: { bar: '#f59e0b', bg: 'rgba(245,158,11,0.14)', fg: '#fbbf24' }
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

function emailHeader(tone) {
  const c = COLORS[tone] || COLORS.accent;
  return `<div style="padding:24px 32px;border-bottom:3px solid ${c.bar};">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;"><img src="{{logo_url}}" width="26" height="35" alt="Bricks SEO" style="display:block;width:26px;height:35px;" /></td>
      <td style="vertical-align:middle;padding-left:10px;"><span style="color:${COLORS.text};font-size:16px;font-weight:700;font-family:${FONT};">Bricks SEO</span></td>
    </tr></table>
  </div>`;
}

function badge(tone, label) {
  const c = COLORS[tone] || COLORS.accent;
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:6px 12px;border-radius:999px;font-family:${FONT};">${label}</span>`;
}

function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-top:28px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${COLORS.accent.bar};">
      <a href="${href}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;font-family:${FONT};">${label}</a>
    </td></tr></table>
  </td></tr></table>`;
}

function fieldBox(rows) {
  const trs = rows
    .map(
      ([label, value], i) => `<tr><td style="padding:14px 16px;${i < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ''}">
        <p style="margin:0 0 4px;color:${COLORS.footer};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:${FONT};">${label}</p>
        <p style="margin:0;color:${COLORS.text};font-size:14px;font-family:${MONO};">${value}</p>
      </td></tr>`
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.box};border:1px solid ${COLORS.border};border-radius:8px;margin-top:24px;">${trs}</table>`;
}

function emailShell(tone, bodyHtml, footerNote) {
  return `<div style="background:${COLORS.bg};padding:40px 16px;font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;overflow:hidden;">
      ${emailHeader(tone)}
      <div style="padding:32px;">${bodyHtml}</div>
    </div>
    <p style="text-align:center;color:${COLORS.footer};font-size:12px;line-height:1.6;margin-top:20px;font-family:${FONT};">${footerNote}<br /><a href="mailto:{{support_email}}" style="color:${COLORS.footer};text-decoration:underline;">Contact support</a></p>
  </div>
</div>`;
}

// This is the one place that builds the pre-formatted HTML "box" for a list
// of license keys. {{license_keys_html}} is inserted into the HTML body
// as-is (never escaped) since it's generated here, not typed by a user.
function licenseKeysBoxHtml(keys) {
  return keys
    .map(
      (k) => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.box};border:1px solid ${COLORS.border};border-radius:8px;margin-top:10px;"><tr><td style="padding:14px 16px;">
        ${k.plan ? `<span style="display:inline-block;background:${COLORS.accent.bg};color:${COLORS.accent.fg};font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:5px;margin-right:10px;font-family:${FONT};">${escapeHtml(k.plan)}</span>` : ''}
        <code style="color:${COLORS.text};font-size:14px;letter-spacing:.02em;font-family:${MONO};">${escapeHtml(k.key)}</code>
      </td></tr></table>`
    )
    .join('');
}

// Default copies of every email we send, used as a fallback if a template
// row is ever missing. Placeholders are {{snake_case}}. Any placeholder
// ending in "_html" is inserted into the HTML body without escaping — it's
// pre-built, trusted markup (license keys, the support message with <br>
// line breaks), never raw user input.
export const DEFAULT_TEMPLATES = {
  welcome: {
    subject: 'Welcome to Bricks SEO - your account and license key',
    text: 'Hello,\n\nThanks for your purchase. Your Bricks SEO account is ready.\n\nLog in: {{login_url}}\nEmail: {{email}}\nTemporary password: {{temp_password}}\n\nYou will be asked to choose a new password the first time you log in.\n\nYour license key(s):\n{{license_keys}}\n\nPaste the key into Bricks SEO > License in your WordPress admin to activate it.',
    html: emailShell(
      'success',
      `${badge('success', 'Purchase confirmed')}
      <h1 style="margin:16px 0 0;color:${COLORS.text};font-size:26px;font-weight:700;font-family:${FONT};">Your account is ready.</h1>
      <p style="margin:12px 0 0;color:${COLORS.muted};font-size:15px;line-height:1.6;font-family:${FONT};">Hello, thanks for your purchase. Your Bricks SEO account is ready — log in with the temporary password below.</p>
      ${fieldBox([
        ['Email', '{{email}}'],
        ['Temporary password', '{{temp_password}}']
      ])}
      <p style="margin:16px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.6;font-family:${FONT};">You will be asked to choose a new password the first time you log in.</p>
      <p style="margin:24px 0 0;color:${COLORS.footer};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:${FONT};">Your license key(s)</p>
      {{license_keys_html}}
      <p style="margin:16px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.6;font-family:${FONT};">Paste the key into Bricks SEO &gt; License in your WordPress admin to activate it.</p>
      ${ctaButton('{{login_url}}', 'Log in to your dashboard →')}`,
      "You're receiving this because you purchased Bricks SEO."
    )
  },
  new_license: {
    subject: 'Your new Bricks SEO license',
    text: 'Hello,\n\nThanks for your purchase. Your new license key(s):\n{{license_keys}}\n\nLog in at {{login_url}} with your existing password to manage it.',
    html: emailShell(
      'accent',
      `${badge('accent', 'New license')}
      <h1 style="margin:16px 0 0;color:${COLORS.text};font-size:26px;font-weight:700;font-family:${FONT};">Your new license is ready.</h1>
      <p style="margin:12px 0 0;color:${COLORS.muted};font-size:15px;line-height:1.6;font-family:${FONT};">Thanks for your purchase. Log in with your existing password to find it in your dashboard.</p>
      <p style="margin:24px 0 0;color:${COLORS.footer};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-family:${FONT};">Your license key(s)</p>
      {{license_keys_html}}
      ${ctaButton('{{login_url}}', 'Log in to your dashboard →')}`,
      "You're receiving this because you purchased an additional Bricks SEO license."
    )
  },
  password_reset: {
    subject: 'Reset your Bricks SEO password',
    text: "Hello,\n\nWe received a request to reset your password. This link expires in 1 hour:\n{{reset_url}}\n\nIf you didn't request this, you can ignore this email.",
    html: emailShell(
      'accent',
      `${badge('accent', 'Password reset')}
      <h1 style="margin:16px 0 0;color:${COLORS.text};font-size:26px;font-weight:700;font-family:${FONT};">Reset your password.</h1>
      <p style="margin:12px 0 0;color:${COLORS.muted};font-size:15px;line-height:1.6;font-family:${FONT};">We received a request to reset your Bricks SEO password. This link expires in 1 hour.</p>
      ${ctaButton('{{reset_url}}', 'Reset password →')}
      <p style="margin:20px 0 0;color:${COLORS.footer};font-size:12px;line-height:1.6;font-family:${FONT};">If the button doesn't work, paste this link into your browser:<br /><a href="{{reset_url}}" style="color:${COLORS.accent.fg};word-break:break-all;">{{reset_url}}</a></p>`,
      "You're receiving this because a password reset was requested on your Bricks SEO account. If this wasn't you, you can ignore this email."
    )
  },
  test: {
    subject: 'Bricks SEO — test email',
    text: 'This is a test email from your Bricks SEO admin settings. If you received this, your email configuration works.',
    html: emailShell(
      'accent',
      `${badge('accent', 'Test email')}
      <h1 style="margin:16px 0 0;color:${COLORS.text};font-size:26px;font-weight:700;font-family:${FONT};">This is a test email.</h1>
      <p style="margin:12px 0 0;color:${COLORS.muted};font-size:15px;line-height:1.6;font-family:${FONT};">If you're reading this, your email delivery is working correctly.</p>`,
      'This is a test email from your Bricks SEO admin settings.'
    )
  },
  // Internal alert to your own support inbox, not a customer-facing email —
  // kept plain and functional rather than using the branded shell above.
  support_request: {
    subject: '[Support] {{subject}}',
    text: 'From: {{from_email}}\n\n{{message}}',
    html: '<p>From: {{from_email}}</p><p>{{message_html}}</p>'
  }
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);

export const TEMPLATE_INFO = {
  welcome: { label: 'Welcome & new license', description: 'Sent once, when a brand-new customer completes checkout. Creates their account and delivers the first license key(s).' },
  new_license: { label: 'New license (existing customer)', description: 'Sent when a customer who already has an account buys another license.' },
  password_reset: { label: 'Password reset', description: 'Sent when a customer requests a password reset link.' },
  test: { label: 'Test email', description: 'Sent from Settings → "Send test email" to confirm delivery is working.' },
  support_request: { label: 'Support request (internal)', description: 'Sent to your support inbox when a customer submits the Support form. Customers never see this one.' }
};

const VAR_LABELS = {
  logo_url: 'Bricks SEO logo image URL',
  support_email: 'Your configured support email address',
  login_url: 'Link to the login page',
  email: "Customer's email address",
  temp_password: 'Temporary password generated for their first login',
  license_keys: 'License key(s), plain text — one per line',
  license_keys_html: 'License key(s), pre-formatted HTML — use only in the HTML body',
  reset_url: 'Password reset link (expires in 1 hour)',
  subject: 'Subject line the customer typed in the Support form',
  message: 'Message the customer typed, plain text',
  message_html: 'Message the customer typed, with line breaks converted to <br> — use only in the HTML body',
  from_email: "Customer's email address"
};

// Sample "source" data, shaped exactly like the `data` object each caller
// (fulfillment.js, auth.routes.js, etc.) passes to sendEmail() for that
// template. Used to drive the admin preview and the "send test" button.
export const TEMPLATE_SAMPLE_DATA = {
  welcome: {
    email: 'jane@example.com',
    tempPassword: 'wxyz-ab12-cd34-ef56',
    licenseKeys: [{ key: 'BRKS-SAMP-LE12-3456-7890', plan: 'Studio' }]
  },
  new_license: {
    licenseKeys: [{ key: 'BRKS-SAMP-LE98-7654-3210', plan: 'Agency' }]
  },
  password_reset: { token: 'sample-token' },
  test: {},
  support_request: {
    subject: 'Cannot activate license',
    message: "Hi, I'm getting a site_limit_reached error on my main site.",
    fromEmail: 'jane@example.com'
  }
};

// Converts a caller's job `data` into the flat {{placeholder}}: value map
// each template is allowed to use. This is the single source of truth for
// which placeholders exist per template — the admin UI's variable legend and
// the unknown-placeholder validation both derive from its output.
export async function buildTemplateVars(key, data = {}) {
  const store = await getSettingSection('store', { supportEmail: 'support@bricksseo.com' });
  const common = {
    logo_url: `${env.APP_URL}/bricks-seo-sidebar-logo.png`,
    support_email: store.supportEmail || 'support@bricksseo.com',
    login_url: `${env.APP_URL}/login`
  };

  if (key === 'welcome' || key === 'new_license') {
    const keys = data.licenseKeys?.length ? data.licenseKeys : data.licenseKey ? [{ key: data.licenseKey }] : [];
    const license_keys = keys.map((k) => `${k.plan ? `${k.plan}: ` : ''}${k.key}`).join('\n');
    const license_keys_html = licenseKeysBoxHtml(keys);
    if (key === 'welcome') {
      return { ...common, email: data.email ?? '', temp_password: data.tempPassword ?? '', license_keys, license_keys_html };
    }
    return { ...common, license_keys, license_keys_html };
  }

  if (key === 'password_reset') {
    return { ...common, reset_url: `${env.APP_URL}/reset-password?token=${data.token ?? ''}` };
  }

  if (key === 'test') {
    return { ...common };
  }

  if (key === 'support_request') {
    const message = data.message ?? '';
    return {
      ...common,
      subject: data.subject ?? '',
      message,
      message_html: escapeHtml(message).replace(/\n/g, '<br>'),
      from_email: data.fromEmail ?? ''
    };
  }

  return { ...common };
}

export async function varsLegend(key) {
  const vars = await buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key]);
  return Object.keys(vars).map((varKey) => ({ key: varKey, label: VAR_LABELS[varKey] || varKey }));
}

// Finds {{...}} tokens in the combined subject/html/text that aren't in the
// allowed set for this template — catches a typo'd or made-up placeholder
// before it ships, instead of letting it render as blank in a real email.
export async function findUnknownPlaceholders(key, { subject, html, text }) {
  const vars = await buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key]);
  const allowed = new Set(Object.keys(vars));
  const found = new Set();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const str of [subject, html, text]) {
    let m;
    while ((m = re.exec(str || ''))) {
      if (!allowed.has(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

export function renderTemplate(str, vars, { html = false } = {}) {
  return String(str || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!(key in vars)) return '';
    const value = vars[key];
    if (value === null || value === undefined) return '';
    if (html && !key.endsWith('_html')) return escapeHtml(value);
    return String(value);
  });
}

export function renderAll(tpl, vars) {
  return {
    subject: renderTemplate(tpl.subject, vars, { html: false }),
    text: renderTemplate(tpl.text, vars, { html: false }),
    html: renderTemplate(tpl.html, vars, { html: true })
  };
}

// Reads the admin-edited template from the DB, falling back to the default
// copy for any field (or the whole row) that hasn't been customized yet.
export async function getEffectiveTemplate(key) {
  const fallback = DEFAULT_TEMPLATES[key] || DEFAULT_TEMPLATES.test;
  const row = await prisma.emailTemplate.findUnique({ where: { key } });
  if (!row) return { ...fallback, isCustom: false, updatedAt: null };
  return {
    subject: row.subject || fallback.subject,
    html: row.html || fallback.html,
    text: row.text || fallback.text,
    isCustom: true,
    updatedAt: row.updatedAt
  };
}
