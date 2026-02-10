import type { APIRoute } from 'astro';
import { NotifyServiceError, requestMoodSubscription } from '@/lib/notify/service';

export const prerender = false;

interface SubscribeBody {
  email?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: SubscribeBody;
  try {
    payload = (await request.json()) as SubscribeBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const result = await requestMoodSubscription(
      {
        request,
        locals,
      },
      payload.email ?? ''
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (error instanceof NotifyServiceError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
        }),
        {
          status: error.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.error('Subscription request failed:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const ALL: APIRoute = async () => {
  return new Response('Method Not Allowed', { status: 405 });
};
