import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';

// Default copies of every email we send, used as the seed content and as a
// fallback if a template row is ever missing. Placeholders are {{snake_case}}.
// Any placeholder ending in "_html" is inserted into the HTML body without
// escaping — it's pre-built, trusted markup (e.g. the license-key list),
// never raw user input.
export const DEFAULT_TEMPLATES = {
  welcome: {
    subject: 'Welcome to Bricks SEO - Your account and license key',
    text: 'Hello,\n\nThanks for your purchase. Your Bricks SEO account is ready.\n\nLog in: {{login_url}}\nEmail: {{email}}\nTemporary password: {{temp_password}}\n\nYou will be asked to choose a new password the first time you log in.\n\nYour license key(s):\n{{license_keys}}\n\nPaste the key into Bricks SEO > License in your WordPress admin to activate it.',
    html: '<p>Hello,</p><p>Thanks for your purchase. Your Bricks SEO account is ready.</p><p><a href="{{login_url}}">Log in to your dashboard</a></p><p>Email: <strong>{{email}}</strong><br>Temporary password: <code><strong>{{temp_password}}</strong></code></p><p>You will be asked to choose a new password the first time you log in.</p><p>Your license key(s):</p>{{license_keys_html}}<p>Paste the key into Bricks SEO &gt; License in your WordPress admin to activate it.</p>'
  },
  new_license: {
    subject: 'Your new Bricks SEO license',
    text: 'Hello,\n\nThanks for your purchase. Your new license key(s):\n{{license_keys}}\n\nLog in at {{login_url}} with your existing password to manage it.',
    html: '<p>Hello,</p><p>Thanks for your purchase. Your new license key(s):</p>{{license_keys_html}}<p><a href="{{login_url}}">Log in to your dashboard</a> with your existing password to manage it.</p>'
  },
  password_reset: {
    subject: 'Reset your Bricks SEO password',
    text: "Hello,\n\nWe received a request to reset your password. This link expires in 1 hour:\n{{reset_url}}\n\nIf you didn't request this, you can ignore this email.",
    html: '<p>Hello,</p><p>We received a request to reset your password. This link expires in 1 hour:</p><p><a href="{{reset_url}}">{{reset_url}}</a></p><p>If you didn\'t request this, you can ignore this email.</p>'
  },
  test: {
    subject: 'Bricks SEO — test email',
    text: 'This is a test email from your Bricks SEO admin settings. If you received this, your email configuration works.',
    html: '<p>This is a test email from your Bricks SEO admin settings.</p><p>If you received this, your email configuration works.</p>'
  },
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
  email: "Customer's email address",
  temp_password: 'Temporary password generated for their first login',
  login_url: 'Link to the login page',
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Converts a caller's job `data` into the flat {{placeholder}}: value map
// each template is allowed to use. This is the single source of truth for
// which placeholders exist per template — the admin UI's variable legend and
// the unknown-placeholder validation both derive from its output.
export function buildTemplateVars(key, data = {}) {
  if (key === 'welcome' || key === 'new_license') {
    const keys = data.licenseKeys?.length ? data.licenseKeys : data.licenseKey ? [{ key: data.licenseKey }] : [];
    const license_keys = keys.map((k) => `${k.plan ? `${k.plan}: ` : ''}${k.key}`).join('\n');
    const license_keys_html = keys
      .map((k) => `<p style="margin:4px 0">${k.plan ? `${k.plan}: ` : ''}<code style="font-size:15px"><strong>${k.key}</strong></code></p>`)
      .join('');
    if (key === 'welcome') {
      return {
        email: data.email ?? '',
        temp_password: data.tempPassword ?? '',
        login_url: `${env.APP_URL}/login`,
        license_keys,
        license_keys_html
      };
    }
    return { license_keys, license_keys_html, login_url: `${env.APP_URL}/login` };
  }

  if (key === 'password_reset') {
    return { reset_url: `${env.APP_URL}/reset-password?token=${data.token ?? ''}` };
  }

  if (key === 'support_request') {
    const message = data.message ?? '';
    return {
      subject: data.subject ?? '',
      message,
      message_html: escapeHtml(message).replace(/\n/g, '<br>'),
      from_email: data.fromEmail ?? ''
    };
  }

  return {};
}

export function varsLegend(key) {
  return Object.keys(buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key])).map((varKey) => ({
    key: varKey,
    label: VAR_LABELS[varKey] || varKey
  }));
}

// Finds {{...}} tokens in the combined subject/html/text that aren't in the
// allowed set for this template — catches a typo'd or made-up placeholder
// before it ships, instead of letting it render as blank in a real email.
export function findUnknownPlaceholders(key, { subject, html, text }) {
  const allowed = new Set(Object.keys(buildTemplateVars(key, TEMPLATE_SAMPLE_DATA[key])));
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
