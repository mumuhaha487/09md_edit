import { getPublicConfig, json, requireEnv } from './_shared.js';

export const onRequestGet = async ({ env }) => {
  const config = getPublicConfig(env);
  const markdownSyncApiUrl = requireEnv(
    env.MARKDOWN_SYNC_API_URL || env.GIT_SYNC_API_URL || env.BACKEND_UPLOAD_MARKDOWN_URL || env.CNB_REMOTE_URL,
    'MARKDOWN_SYNC_API_URL'
  );
  return json({
    ...config,
    markdownSyncApiUrl,
    backend: 'pages-functions-refactor'
  });
};
