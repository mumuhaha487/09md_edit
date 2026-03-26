import { getPublicConfig, json, requireEnv } from './_shared.js';

export const onRequestGet = async ({ env }) => {
  const config = getPublicConfig(env);
  const markdownSyncApiUrl = requireEnv(env.MARKDOWN_SYNC_API_URL, 'MARKDOWN_SYNC_API_URL');
  return json({
    ...config,
    markdownSyncApiUrl,
    backend: 'pages-functions-refactor'
  });
};
