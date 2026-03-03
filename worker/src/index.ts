import { handlePreflight, resolveCorsOrigin, withCors } from './lib/cors';
import { debugLog, requestDebugId } from './lib/debug';
import { error } from './lib/validators';
import type { Env } from './types';
import { handleAuthCallback, handleAuthLogout, handleAuthSession, handleAuthStart } from './routes/auth';
import { handleGetMedia, handleGetMediaFile } from './routes/media';
import { handlePostsRequest } from './routes/posts';
import { handleTagsRequest } from './routes/tags';
import { handleUpload } from './routes/upload';

function routePath(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
const MAX_WRITE_BYTES = 12 * 1024 * 1024;

function isPublicCacheablePath(pathname: string): boolean {
  return pathname.startsWith('/api/posts') || pathname.startsWith('/api/tags') || pathname.startsWith('/api/media');
}

function hasPrivateContext(request: Request): boolean {
  return Boolean(request.headers.get('Authorization') || request.headers.get('Cookie'));
}

function canStoreInEdgeCache(response: Response): boolean {
  const cacheControl = String(response.headers.get('Cache-Control') || '').toLowerCase();
  const isPublic = cacheControl.includes('public');
  const isNoStore = cacheControl.includes('no-store');
  const hasSetCookie = response.headers.has('Set-Cookie');
  return response.ok && isPublic && !isNoStore && !hasSetCookie;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Robots-Tag', 'noindex, nofollow');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = routePath(url.pathname);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return handlePreflight(request, env);
  }

  if (WRITE_METHODS.has(method)) {
    const origin = request.headers.get('Origin') || '';
    if (origin && !resolveCorsOrigin(request, env)) {
      return error(403, 'Origin not allowed');
    }

    const contentLength = Number.parseInt(request.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_WRITE_BYTES) {
      return error(413, 'Payload too large');
    }
  }

  if (segments[0] !== 'api') {
    return error(404, 'Not found');
  }

  const route = segments[1] || '';

  if (route === 'auth' && request.method.toUpperCase() === 'GET') {
    return handleAuthStart(request, env);
  }

  if (route === 'callback' && request.method.toUpperCase() === 'GET') {
    return handleAuthCallback(request, env);
  }

  if (route === 'session' && request.method.toUpperCase() === 'GET') {
    return handleAuthSession(request, env);
  }

  if (route === 'logout' && request.method.toUpperCase() === 'POST') {
    return handleAuthLogout(request, env);
  }

  if (route === 'posts') {
    return handlePostsRequest(request, env, segments.slice(2));
  }

  if (route === 'tags') {
    return handleTagsRequest(request, env, segments.slice(2));
  }

  if (route === 'upload' && request.method.toUpperCase() === 'POST') {
    return handleUpload(request, env);
  }

  if (route === 'media') {
    const mediaId = segments[2];
    const tail = segments[3] || '';

    if (!mediaId) return error(400, 'Missing media id');

    if (!tail && request.method.toUpperCase() === 'GET') {
      return handleGetMedia(request, env, mediaId);
    }

    if (tail === 'file' && request.method.toUpperCase() === 'GET') {
      return handleGetMediaFile(request, env, mediaId);
    }
  }

  return error(404, 'Not found');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const reqId = requestDebugId(request);
    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const cacheableRead = method === 'GET' && isPublicCacheablePath(url.pathname) && !hasPrivateContext(request);
      const cacheKey = new Request(url.toString(), { method: 'GET' });
      const apiCache = cacheableRead ? await caches.open('ub-api-cache') : null;

      if (cacheableRead && apiCache) {
        const cached = await apiCache.match(cacheKey);
        if (cached) {
          const cachedHeaders = new Headers(cached.headers);
          cachedHeaders.set('X-UB-Worker-Cache', 'HIT');
          const cachedResponse = new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: cachedHeaders
          });
          debugLog(env, 'api.cache.hit', {
            reqId,
            method,
            path: url.pathname
          });
          return withSecurityHeaders(withCors(request, env, cachedResponse));
        }
      }

      const response = await handleApi(request, env);
      const finalHeaders = new Headers(response.headers);
      if (cacheableRead) {
        finalHeaders.set('X-UB-Worker-Cache', 'MISS');
      } else if (method === 'GET' && isPublicCacheablePath(url.pathname)) {
        finalHeaders.set('X-UB-Worker-Cache', 'BYPASS');
      }
      const cacheAwareResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: finalHeaders
      });

      if (cacheableRead && apiCache && canStoreInEdgeCache(cacheAwareResponse)) {
        ctx.waitUntil(apiCache.put(cacheKey, cacheAwareResponse.clone()));
      }

      debugLog(env, 'api.response', {
        reqId,
        method: request.method,
        path: url.pathname,
        status: cacheAwareResponse.status
      });
      return withSecurityHeaders(withCors(request, env, cacheAwareResponse));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      debugLog(env, 'api.error', {
        reqId,
        method: request.method,
        path: new URL(request.url).pathname,
        message
      });
      return withSecurityHeaders(
        withCors(
          request,
          env,
          new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          })
        )
      );
    }
  }
};
