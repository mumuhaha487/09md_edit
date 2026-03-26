export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function requireEnv(value, keyName) {
  if (!value || !String(value).trim()) {
    throw new Error(`缺少环境变量 ${keyName}`);
  }
  return String(value).trim();
}

export function normalizeTargetDir(inputDir, fallback = '123') {
  const normalized = String(inputDir || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..');
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.join('/');
}

export function safeMarkdownFileName(inputName) {
  const onlyName = String(inputName || '').split('/').pop().split('\\').pop();
  const normalized = onlyName.replace(/[^\w.\-()\u4e00-\u9fa5]/g, '-');
  if (!normalized) {
    return 'untitled.md';
  }
  return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

export async function uploadMarkdownToCnb({
  cnbApiBase,
  repo,
  token,
  filePath,
  content
}) {
  const bodyBytes = new TextEncoder().encode(content);
  const uploadName = String(filePath || '').split('/').filter(Boolean).pop() || 'untitled.md';
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const initResp = await fetch(`${cnbApiBase.replace(/\/+$/, '')}/${repo}/-/upload/files`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: uploadName,
      size: bodyBytes.byteLength,
      ext: {
        type: 'markdown',
        target_dir: filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
      }
    })
  });

  if (!initResp.ok) {
    const t = await initResp.text();
    throw new Error(`初始化上传失败: ${t}`);
  }

  const initData = await initResp.json();
  const uploadUrl = initData?.upload_url;
  if (!uploadUrl) {
    throw new Error('未获取到上传地址');
  }

  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8'
    },
    body: bodyBytes
  });

  if (!putResp.ok) {
    const t = await putResp.text();
    throw new Error(`流式上传失败: ${t}`);
  }

  const path = initData?.assets?.path || '';
  const url = path ? (path.startsWith('http') ? path : `https://cnb.cool${path}`) : uploadUrl;
  return {
    url,
    path
  };
}
