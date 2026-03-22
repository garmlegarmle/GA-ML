import path from 'node:path';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getConfig() {
  const uploadRoot = process.env.UPLOAD_ROOT || '/data/uploads';
  return {
    port: Number(process.env.PORT || 8200),
    databaseUrl: required('DATABASE_URL'),
    adminToken: String(process.env.ADMIN_TOKEN || '').trim(),
    adminSessionSecret: required('ADMIN_SESSION_SECRET'),
    adminLoginUser: String(process.env.ADMIN_LOGIN_USER || '').trim().toLowerCase(),
    adminLoginPassword: String(process.env.ADMIN_LOGIN_PASSWORD || '').trim(),
    cookieDomain: String(process.env.COOKIE_DOMAIN || '').trim(),
    uploadRoot,
    mediaRoot: path.join(uploadRoot, 'media'),
    mediaPublicBaseUrl: String(process.env.MEDIA_PUBLIC_BASE_URL || '').trim(),
    nodeEnv: String(process.env.NODE_ENV || 'development').trim(),
    siteOrigin: String(process.env.SITE_ORIGIN || '').trim(),
    trendAnalyzerPythonBin: String(process.env.TREND_ANALYZER_PYTHON_BIN || 'python3').trim(),
    trendAnalyzerScript: String(process.env.TREND_ANALYZER_SCRIPT || path.join(process.cwd(), 'scripts', 'trend_analyze_csv.py')).trim(),
    trendAnalyzerBestParamsCsv: String(
      process.env.TREND_ANALYZER_BEST_PARAMS_CSV ||
        path.join(process.cwd(), 'web_backend_bundle', 'best_params', 'optimizer_best_params_by_head.csv')
    ).trim(),
    trendAnalyzerTimeoutMs: Number(process.env.TREND_ANALYZER_TIMEOUT_MS || 20000)
  };
}
