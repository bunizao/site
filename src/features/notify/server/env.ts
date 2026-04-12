import { readEnv } from '@/lib/runtime/env';

export interface NotifyConfig {
  resendApiKey: string;
  notifyFromName: string;
  notifyFrom: string;
  notifyReplyTo: string;
  siteUrl: string;
  tokenSecret: string;
  dispatchSecret: string;
  cronSecret: string;
  cloudflareAccountId: string;
  cloudflareApiToken: string;
  cloudflareNotifyD1DatabaseId: string;
}

interface RuntimeContext {
  locals?: any;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function getNotifyConfig(context: RuntimeContext = {}): NotifyConfig {
  const locals = context.locals;
  const siteUrl =
    readEnv(locals, 'PUBLIC_SITE_URL') ||
    readEnv(locals, 'SITE_URL') ||
    readEnv(locals, 'PUBLIC_BASE_URL') ||
    '';

  const d1DatabaseId = readEnv(locals, 'CLOUDFLARE_NOTIFY_D1_DATABASE_ID');

  return {
    resendApiKey: readEnv(locals, 'RESEND_API_KEY'),
    notifyFromName: readEnv(locals, 'NOTIFY_FROM_NAME'),
    notifyFrom: readEnv(locals, 'NOTIFY_FROM_EMAIL'),
    notifyReplyTo: readEnv(locals, 'NOTIFY_REPLY_TO_EMAIL'),
    siteUrl: trimTrailingSlash(siteUrl),
    tokenSecret: readEnv(locals, 'EMAIL_NOTIFY_SECRET'),
    dispatchSecret: readEnv(locals, 'NOTIFY_DISPATCH_SECRET'),
    cronSecret: readEnv(locals, 'CRON_SECRET'),
    cloudflareAccountId: readEnv(locals, 'CLOUDFLARE_ACCOUNT_ID'),
    cloudflareApiToken: readEnv(locals, 'CLOUDFLARE_API_TOKEN'),
    cloudflareNotifyD1DatabaseId: d1DatabaseId,
  };
}

export function requireConfigValue(value: string, name: string): void {
  if (!value) {
    throw new Error(`Missing required configuration: ${name}`);
  }
}

function sanitizeFromName(value: string): string {
  return value.replace(/[\r\n<>]/g, '').trim();
}

export function getNotifyFromAddress(config: NotifyConfig): string {
  const email = config.notifyFrom.trim();
  const name = sanitizeFromName(config.notifyFromName);

  if (!name) {
    return email;
  }

  return `${name} <${email}>`;
}
