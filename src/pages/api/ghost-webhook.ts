import type { APIRoute } from 'astro';
import { json, jsonBadRequest, jsonError } from '@/lib/http/json-response';
import { readEnv } from '@/lib/runtime/env';
import { secureCompareText } from '@/features/notify/server/security';

export const prerender = false;

const ALLOWED_GHOST_EVENTS = new Set([
  'post.published',
  'post.published.edited',
]);

interface GhostWebhookPayload {
  event?: unknown;
  post?: {
    current?: {
      id?: unknown;
      slug?: unknown;
      title?: unknown;
      url?: unknown;
    };
  };
}

interface GhostWebhookConfig {
  deployHookUrl: string;
  webhookToken: string;
}

function getGhostWebhookConfig(locals: App.Locals | undefined): GhostWebhookConfig {
  return {
    deployHookUrl: readEnv(locals, 'GHOST_DEPLOY_HOOK_URL'),
    webhookToken: readEnv(locals, 'GHOST_WEBHOOK_TOKEN'),
  };
}

export function readGhostWebhookToken(request: Request): string {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token')?.trim();
  if (queryToken) {
    return queryToken;
  }

  const bearer = request.headers.get('authorization')?.trim();
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }

  return request.headers.get('x-webhook-token')?.trim() ?? '';
}

export function readGhostWebhookEvent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const event = (payload as GhostWebhookPayload).event;
  return typeof event === 'string' ? event.trim() : '';
}

export function shouldTriggerGhostDeploy(payload: unknown): boolean {
  const event = readGhostWebhookEvent(payload);
  if (!event) {
    return true;
  }

  return ALLOWED_GHOST_EVENTS.has(event);
}

function createDeployHookPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return JSON.stringify({ source: 'ghost' });
  }

  const typedPayload = payload as GhostWebhookPayload;
  const currentPost = typedPayload.post?.current;

  return JSON.stringify({
    source: 'ghost',
    event: readGhostWebhookEvent(payload) || undefined,
    post: currentPost ? {
      id: currentPost.id ?? undefined,
      slug: currentPost.slug ?? undefined,
      title: currentPost.title ?? undefined,
      url: currentPost.url ?? undefined,
    } : undefined,
  });
}

async function readRequestPayload(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('invalid_json');
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const { deployHookUrl, webhookToken } = getGhostWebhookConfig(locals);
  if (!deployHookUrl || !webhookToken) {
    return jsonError(500, 'Ghost webhook is not configured');
  }

  const incomingToken = readGhostWebhookToken(request);
  if (!secureCompareText(incomingToken, webhookToken)) {
    return jsonError(401, 'Unauthorized');
  }

  let payload: unknown;

  try {
    payload = await readRequestPayload(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_json') {
      return jsonBadRequest('Invalid JSON body');
    }

    return jsonError(500, 'Failed to read webhook body');
  }

  const event = readGhostWebhookEvent(payload);
  if (!shouldTriggerGhostDeploy(payload)) {
    return json(202, {
      ok: true,
      triggered: false,
      ignored: true,
      event,
    });
  }

  let deployResponse: Response;

  try {
    deployResponse = await fetch(deployHookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: createDeployHookPayload(payload),
    });
  } catch {
    return jsonError(502, 'Failed to reach deploy hook');
  }

  if (!deployResponse.ok) {
    return jsonError(502, 'Deploy hook rejected the request', undefined, {
      status: deployResponse.status,
    });
  }

  return json(202, {
    ok: true,
    triggered: true,
    event,
  });
};
