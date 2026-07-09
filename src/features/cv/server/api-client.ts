import {
  redactCvDocument,
  type CvDocument,
  type CvLang,
  type CvPublicDocument,
} from '@bunizao/contracts';
import { CV_READ_PATH } from '@bunizao/contracts/routes';
import {
  createApiServiceRequest,
  getApiServiceBinding,
} from '@/lib/http/api-service-proxy';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import { SAMPLE_CV } from '../data/sample';
import {
  resolveFullCv,
  resolvePublicCv,
  type ResolvedCv,
} from './resolve';

export interface CvServerContext {
  request: Request;
  locals: RuntimeEnvLocals;
}

export interface CvQuery {
  lang: CvLang;
  /** Caller has already established access (cookie / Access session / token). */
  full?: boolean;
  /** Redeem token forwarded to site-api when present. */
  key?: string;
}

// Log the served source at most once per worker isolate — a noisy per-request
// log is useless and the source rarely changes within a boot.
let loggedSource = false;
function logSourceOnce(source: 'site-api' | 'fixture', full: boolean): void {
  if (loggedSource) return;
  loggedSource = true;
  console.info(`[cv] read served from ${source} (${full ? 'full' : 'public'})`);
}

function buildCvRequest(context: CvServerContext, query: CvQuery): Request {
  const url = new URL(context.request.url);
  url.pathname = CV_READ_PATH;
  const params = new URLSearchParams();
  params.set('lang', query.lang);
  if (query.full) params.set('full', '1');
  if (query.key) params.set('key', query.key);
  url.search = params.toString();

  return createApiServiceRequest(
    new Request(url, { method: 'GET', headers: context.request.headers }),
  );
}

function fixtureCv(full: boolean): ResolvedCv {
  logSourceOnce('fixture', full);
  return full ? resolveFullCv(SAMPLE_CV) : resolvePublicCv(redactCvDocument(SAMPLE_CV));
}

/**
 * Read the CV. In production / `bun dev:api` this fetches site-api across the
 * service binding; site-api is the sole holder of real PII and performs the
 * redaction before the public payload crosses the boundary. In plain `bun dev`
 * (no binding) it falls back to the fixture so the page has instant HMR preview.
 */
export async function getCv(context: CvServerContext, query: CvQuery): Promise<ResolvedCv> {
  const full = query.full === true;

  const api = await getApiServiceBinding(context.locals);
  if (!api) {
    return fixtureCv(full);
  }

  try {
    const response = await api.fetch(buildCvRequest(context, query));
    if (!response.ok) {
      // 401 on a full read means access was rejected upstream; fall back to the
      // real public projection rather than an error page.
      if (response.status === 401 && full) {
        const publicResponse = await api.fetch(buildCvRequest(context, { lang: query.lang }));
        if (!publicResponse.ok) {
          throw new Error(`cv public read failed: ${publicResponse.status} ${publicResponse.statusText}`);
        }
        logSourceOnce('site-api', false);
        return resolvePublicCv((await publicResponse.json()) as CvPublicDocument);
      }
      throw new Error(`cv read failed: ${response.status} ${response.statusText}`);
    }
    logSourceOnce('site-api', full);
    if (full) {
      return resolveFullCv((await response.json()) as CvDocument);
    }
    return resolvePublicCv((await response.json()) as CvPublicDocument);
  } catch (error) {
    console.warn('[cv] site-api read failed, using fixture', error);
    return fixtureCv(full ? false : full);
  }
}
