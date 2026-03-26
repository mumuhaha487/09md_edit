import { getPublicConfig, json } from './_shared.js';

export const onRequestGet = async ({ env }) => {
  const config = getPublicConfig(env);
  const markdownSyncApiUrl = String(env.MARKDOWN_SYNC_API_URL || '/api/upload-markdown').trim() || '/api/upload-markdown';
  return json({
    ...config,
    markdownSyncApiUrl,
    backend: 'pages-functions-refactor'
  });
};
