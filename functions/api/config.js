import { getPublicConfig, json } from './_shared.js';

function pickSyncApiUrl(env) {
  const candidates = [
    ['MARKDOWN_SYNC_API_URL', env.MARKDOWN_SYNC_API_URL],
    ['GIT_SYNC_API_URL', env.GIT_SYNC_API_URL],
    ['BACKEND_UPLOAD_MARKDOWN_URL', env.BACKEND_UPLOAD_MARKDOWN_URL]
  ];

  for (const [key, value] of candidates) {
    const normalized = String(value || '').trim();
    if (/^https?:\/\//i.test(normalized)) {
      return { url: normalized, source: key, hint: '' };
    }
  }

  const cnbRemoteUrl = String(env.CNB_REMOTE_URL || '').trim();
  if (cnbRemoteUrl) {
    return {
      url: '',
      source: 'CNB_REMOTE_URL',
      hint: 'CNB_REMOTE_URL 是 Git 仓库地址，不能作为同步接口地址，请改为 Node 服务的 /api/upload-markdown'
    };
  }

  return {
    url: '',
    source: '',
    hint: '请在 Pages 环境变量配置 MARKDOWN_SYNC_API_URL（值为可访问的 Node 服务 /api/upload-markdown）'
  };
}

export const onRequestGet = async ({ env }) => {
  let config = { imagePublicBaseUrl: '' };
  try {
    config = getPublicConfig(env);
  } catch (error) {
    config = { imagePublicBaseUrl: '' };
  }
  const syncApi = pickSyncApiUrl(env);
  return json({
    ...config,
    markdownSyncApiUrl: syncApi.url,
    markdownSyncApiSource: syncApi.source,
    markdownSyncApiHint: syncApi.hint,
    backend: 'pages-functions-refactor'
  });
};
