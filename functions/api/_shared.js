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

export async function uploadMarkdownToCnbRepo({
  cnbGitApiBase,
  repo,
  token,
  branch,
  filePath,
  content
}) {
  const projectId = encodeURIComponent(repo);
  const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '%2F');
  const apiBase = cnbGitApiBase.replace(/\/+$/, '');
  const fileApiUrl = `${apiBase}/projects/${projectId}/repository/files/${encodedFilePath}`;
  const repoFileUrl = `https://cnb.cool/${repo}/-/blob/${encodeURIComponent(branch)}/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json'
  };

  const checkResp = await fetch(`${fileApiUrl}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers
  });

  const commitMessage = `sync markdown: ${filePath}`;
  const commitBody = {
    branch,
    content,
    commit_message: commitMessage
  };

  if (checkResp.status === 404) {
    const createResp = await fetch(fileApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(commitBody)
    });
    if (!createResp.ok) {
      const t = await createResp.text();
      throw new Error(`创建仓库文件失败: ${t}`);
    }
  } else if (checkResp.ok) {
    const updateResp = await fetch(fileApiUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commitBody)
    });
    if (!updateResp.ok) {
      const t = await updateResp.text();
      throw new Error(`更新仓库文件失败: ${t}`);
    }
  } else {
    const t = await checkResp.text();
    throw new Error(`检查仓库文件失败: ${t}`);
  }

  return {
    url: repoFileUrl,
    path: filePath,
    branch
  };
}
