import type {
  ChartInterpretationAnalysisResponse,
  HoldemCompleteResponse,
  HoldemOnlineSessionResponse,
  HoldemOnlineTablesResponse,
  HoldemPlayResponse,
  HoldemStatsResponse,
  MenuSettings,
  PageSaveResult,
  PageSettings,
  SiteLang,
  SiteMenu,
  PostDetailResponse,
  PostListResponse,
  SessionResponse,
  TrendAnalysisResponse,
  UploadResponse
} from '../types';

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedPath;
}

async function parseJson(response: Response): Promise<{ data: unknown; nonJsonText?: string }> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const text = await response.text().catch(() => '');
    return { data: { __nonJson: true }, nonJsonText: text };
  }
  const parsed = await response.json().catch(() => ({ __parseError: true }));
  return { data: parsed };
}

async function performRequest(url: string, init?: RequestInit): Promise<{ response: Response; data: unknown; nonJsonText?: string }> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init
  });

  const parsed = await parseJson(response);
  return { response, data: parsed.data, nonJsonText: parsed.nonJsonText };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = buildApiUrl(path);
  const { response, data, nonJsonText } = await performRequest(url, init);

  if (typeof data === 'object' && data !== null && '__nonJson' in data) {
    throw new Error(
      `API returned non-JSON response for ${path} via ${url} (status ${response.status}, content-type: ${
        response.headers.get('content-type') || 'unknown'
      }). ${String(nonJsonText || '').slice(0, 120)}`
    );
  }

  if (typeof data === 'object' && data !== null && '__parseError' in data) {
    throw new Error(`API JSON parse failed for ${path} via ${url}.`);
  }

  if (!response.ok || (typeof data === 'object' && data !== null && 'ok' in data && (data as { ok?: boolean }).ok === false)) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: string }).error || 'Request failed')
        : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export interface ListPostsParams {
  status?: 'published' | 'draft' | 'all';
  menu?: number;
  feed?: boolean;
  q?: string;
  page?: number;
  limit?: number;
  lang?: 'en' | 'ko';
  section?: 'blog' | 'tools' | 'games' | 'pages';
}

export async function listPosts(params: ListPostsParams): Promise<PostListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.menu) query.set('menu', String(params.menu));
  if (params.feed) query.set('feed', '1');
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.lang) query.set('lang', params.lang);
  if (params.section) query.set('section', params.section);

  const data = await apiFetch<Partial<PostListResponse>>(`/api/posts?${query.toString()}`);

  if (!Array.isArray(data.items)) {
    throw new Error('Invalid posts response: items is not an array');
  }

  return {
    ok: true,
    items: data.items,
    page: Number(data.page || 1),
    limit: Number(data.limit || params.limit || 12),
    total: Number(data.total || data.items.length)
  };
}

export async function listMenus(lang: SiteLang, admin: boolean): Promise<SiteMenu[]> {
  const query = new URLSearchParams({ lang, admin: admin ? '1' : '0' });
  return (await apiFetch<{ ok: true; menus: SiteMenu[] }>(`/api/menus?${query}`, { cache: 'no-store' })).menus;
}

export async function saveMenu(id: number | null, settings: MenuSettings): Promise<{ ok: true; id: number }> {
  return apiFetch(`/api/menus${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
}

export async function deleteMenu(id: number): Promise<{ ok: true }> {
  return apiFetch(`/api/menus/${id}`, { method: 'DELETE' });
}

export async function getPostBySlug(slug: string, lang: 'en' | 'ko', section: string): Promise<PostDetailResponse> {
  const query = new URLSearchParams({ lang, section });
  const data = await apiFetch<Partial<PostDetailResponse>>(`/api/posts/${encodeURIComponent(slug)}?${query.toString()}`);

  if (!data.post || typeof data.post !== 'object') {
    throw new Error('Invalid post response: post is missing');
  }

  return {
    ok: true,
    post: data.post as PostDetailResponse['post'],
    cover: (data.cover as PostDetailResponse['cover']) || null,
    media: Array.isArray(data.media) ? data.media : []
  };
}

export async function createPost(body: PageSettings & { lang: SiteLang }): Promise<PageSaveResult> {
  return apiFetch<PageSaveResult>(`/api/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });
}

export async function updatePost(
  id: number,
  body: PageSettings
): Promise<PageSaveResult> {
  return apiFetch<PageSaveResult>(
    `/api/posts/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(body)
    }
  );
}

export async function deletePost(id: number): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/api/posts/${id}`, {
    method: 'DELETE'
  });
}

export async function getSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/session', {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });
}

export async function logout(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/logout', {
    method: 'POST'
  });
}

export async function login(username: string, password: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ username, password })
  });
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>('/api/admin/password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function uploadMedia(file: File, alt?: string): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  if (alt !== undefined) {
    form.append('alt', alt);
  }

  return apiFetch<UploadResponse>('/api/upload', {
    method: 'POST',
    body: form
  });
}

export async function analyzeTrendCsv(file: File): Promise<TrendAnalysisResponse> {
  const form = new FormData();
  form.append('file', file);

  return apiFetch<TrendAnalysisResponse>('/api/tools/trend-analyzer/analyze', {
    method: 'POST',
    body: form
  });
}

export async function analyzeTrendTicker(ticker: string): Promise<TrendAnalysisResponse> {
  return apiFetch<TrendAnalysisResponse>('/api/tools/trend-analyzer/analyze-ticker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ ticker })
  });
}

export async function analyzeChartInterpretationTicker(ticker: string): Promise<ChartInterpretationAnalysisResponse> {
  return apiFetch<ChartInterpretationAnalysisResponse>('/api/tools/chart-interpretation/analyze-ticker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ ticker })
  });
}

export async function analyzeChartInterpretationCsv(
  file: File,
  title?: string
): Promise<ChartInterpretationAnalysisResponse> {
  const form = new FormData();
  form.append('file', file);
  if (title) {
    form.append('title', title);
  }

  return apiFetch<ChartInterpretationAnalysisResponse>('/api/tools/chart-interpretation/analyze-csv', {
    method: 'POST',
    body: form
  });
}

export async function getHoldemStats(playerName?: string): Promise<HoldemStatsResponse> {
  const query = new URLSearchParams();
  if (playerName) {
    query.set('playerName', playerName);
  }

  return apiFetch<HoldemStatsResponse>(
    `/api/games/texas-holdem-tournament/stats${query.toString() ? `?${query.toString()}` : ''}`,
    {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    }
  );
}

export async function recordHoldemPlayStart(playerName: string): Promise<HoldemPlayResponse> {
  return apiFetch<HoldemPlayResponse>('/api/games/texas-holdem-tournament/play', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ playerName })
  });
}

export async function recordHoldemCompletion(body: {
  playerName: string;
  runToken: string;
  finalPlace: number;
  levelReached: number;
  handNumber: number;
  playerWon: boolean;
}): Promise<HoldemCompleteResponse> {
  return apiFetch<HoldemCompleteResponse>('/api/games/texas-holdem-tournament/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(body)
  });
}

export async function createHoldemOnlineSession(body: {
  displayName: string;
  sessionToken?: string;
}): Promise<HoldemOnlineSessionResponse> {
  return apiFetch<HoldemOnlineSessionResponse>('/api/holdem-online/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
}

export async function getHoldemOnlineTables(): Promise<HoldemOnlineTablesResponse> {
  return apiFetch<HoldemOnlineTablesResponse>('/api/holdem-online/tables', {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
}
