import {
  createHttpError,
  errorResponse,
  parseResponseBody,
  parseJsonBody,
  json
} from './_shared.js';

export const onRequestPost = async ({ request, env }) => {
  try {
    const payload = await parseJsonBody(request);
    const name = payload?.name;
    const content = payload?.content;

    if (!name || typeof name !== 'string') {
      return json({ error: '文件名缺失' }, { status: 400 });
    }
    if (typeof content !== 'string') {
      return json({ error: 'Markdown 内容缺失' }, { status: 400 });
    }

    const syncApiUrl = String(
      env.MARKDOWN_SYNC_API_URL ||
      env.GIT_SYNC_API_URL ||
      env.BACKEND_UPLOAD_MARKDOWN_URL ||
      env.CNB_REMOTE_URL ||
      ''
    ).trim();
    if (!syncApiUrl || !/^https?:\/\//i.test(syncApiUrl)) {
      throw createHttpError(
        500,
        '未配置有效的同步地址',
        '请配置 MARKDOWN_SYNC_API_URL（或 GIT_SYNC_API_URL / BACKEND_UPLOAD_MARKDOWN_URL）指向可运行 server.js 的 /api/upload-markdown'
      );
    }

    if (/\.git(?:\?.*)?$/i.test(syncApiUrl)) {
      throw createHttpError(
        500,
        '同步地址配置错误',
        '当前配置看起来是 Git 仓库地址（.git），需要改为可访问的 Node 接口地址，例如 https://your-node-domain/api/upload-markdown'
      );
    }

    const upstreamResp = await fetch(syncApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        content
      })
    });

    const upstreamData = await parseResponseBody(upstreamResp);
    if (!upstreamResp.ok) {
      throw createHttpError(upstreamResp.status, 'Git 同步失败', upstreamData);
    }

    return json(upstreamData || {});
  } catch (error) {
    return errorResponse(error, 'Git 上传 Markdown 失败');
  }
};
