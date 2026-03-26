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

function toBase64Utf8(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function uploadMarkdownToGitHub({
  repo,
  token,
  branch,
  filePath,
  content,
  committerName,
  committerEmail
}) {
  const apiBase = 'https://api.github.com';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'markdown-sync-cloudflare'
  };

  const contentUrl = `${apiBase}/repos/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
  let sha = undefined;
  const currentResp = await fetch(`${contentUrl}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers
  });
  if (currentResp.ok) {
    const currentData = await currentResp.json();
    sha = currentData.sha;
  } else if (currentResp.status !== 404) {
    const t = await currentResp.text();
    throw new Error(`读取仓库文件失败: ${t}`);
  }

  const body = {
    message: `sync markdown: ${filePath}`,
    content: toBase64Utf8(content),
    branch,
    committer: {
      name: committerName,
      email: committerEmail
    }
  };
  if (sha) {
    body.sha = sha;
  }

  const putResp = await fetch(contentUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!putResp.ok) {
    const t = await putResp.text();
    throw new Error(`写入仓库失败: ${t}`);
  }

  return {
    url: `https://github.com/${repo}/blob/${branch}/${filePath}`,
    path: filePath,
    branch
  };
}
