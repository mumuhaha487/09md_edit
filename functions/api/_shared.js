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

function tryParseJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeRepoPath(repo) {
  return String(repo || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeFilePath(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function dedupeAuthHeaders(headersList) {
  const seen = new Set();
  const result = [];
  for (const headers of headersList) {
    const key = JSON.stringify(Object.entries(headers).sort(([a], [b]) => (a > b ? 1 : -1)));
    if (!seen.has(key)) {
      seen.add(key);
      result.push(headers);
    }
  }
  return result;
}

function buildAuthHeaders(token, gitUsername) {
  const normalizedToken = String(token || '').trim();
  const normalizedUsername = String(gitUsername || '').trim();
  const headersList = [
    { Authorization: `Bearer ${normalizedToken}` },
    { Authorization: `token ${normalizedToken}` },
    { 'PRIVATE-TOKEN': normalizedToken }
  ];
  if (normalizedUsername) {
    headersList.push({
      Authorization: `Basic ${btoa(`${normalizedUsername}:${normalizedToken}`)}`
    });
  }
  return dedupeAuthHeaders(headersList);
}

async function parseResponseText(response) {
  const text = await response.text();
  return {
    text,
    json: tryParseJson(text)
  };
}

function buildBlobUrl(repo, branch, filePath) {
  const safeBranch = encodeURIComponent(String(branch || 'main'));
  const normalizedPath = String(filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
  return `https://cnb.cool/${repo}/-/blob/${safeBranch}/${normalizedPath}`;
}

async function uploadByCnbUploadApi({
  cnbApiBase,
  repo,
  filePath,
  bodyBytes,
  authHeadersList
}) {
  const uploadName = String(filePath || '').split('/').filter(Boolean).pop() || 'untitled.md';
  const targetDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const initUrl = `${normalizeUrl(cnbApiBase)}/${repo}/-/upload/files`;
  const errors = [];

  for (const authHeaders of authHeadersList) {
    const initResp = await fetch(initUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: uploadName,
        size: bodyBytes.byteLength,
        ext: {
          type: 'markdown',
          target_dir: targetDir
        }
      })
    });

    const initParsed = await parseResponseText(initResp);
    if (!initResp.ok) {
      errors.push(`初始化上传失败(${initResp.status}): ${initParsed.text}`);
      continue;
    }

    const initData = initParsed.json || {};
    const uploadUrl = initData.upload_url || initData.uploadUrl || initData.url || '';
    if (!uploadUrl) {
      errors.push('初始化上传失败: 未获取到上传地址');
      continue;
    }

    const uploadMethod = String(initData.upload_method || initData.uploadMethod || initData.method || 'PUT').toUpperCase();
    const dynamicHeaders = initData.upload_headers || initData.uploadHeaders || {};
    const uploadResp = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        ...(dynamicHeaders && typeof dynamicHeaders === 'object' ? dynamicHeaders : {})
      },
      body: bodyBytes
    });

    const uploadParsed = await parseResponseText(uploadResp);
    if (!uploadResp.ok) {
      errors.push(`流式上传失败(${uploadResp.status}): ${uploadParsed.text}`);
      continue;
    }

    const completeUrl = initData.complete_url || initData.completeUrl || '';
    if (completeUrl) {
      const completeResp = await fetch(completeUrl, {
        method: String(initData.complete_method || initData.completeMethod || 'POST').toUpperCase(),
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: initData?.assets?.path || initData?.path || filePath
        })
      });
      const completeParsed = await parseResponseText(completeResp);
      if (!completeResp.ok) {
        errors.push(`完成提交失败(${completeResp.status}): ${completeParsed.text}`);
        continue;
      }
    }

    const uploadedPath = initData?.assets?.path || initData?.path || filePath;
    const uploadedUrl = initData?.assets?.url
      || initData?.url
      || (uploadedPath ? (String(uploadedPath).startsWith('http') ? uploadedPath : `https://cnb.cool${uploadedPath}`) : '');

    return {
      url: uploadedUrl || buildBlobUrl(repo, 'main', filePath),
      path: uploadedPath
    };
  }

  throw new Error(errors.filter(Boolean).join(' | ') || '上传接口调用失败');
}

async function uploadByRepoContentsApi({
  cnbApiBase,
  repo,
  filePath,
  content,
  authHeadersList,
  preferredBranch
}) {
  const base = normalizeUrl(cnbApiBase);
  const repoPath = normalizeRepoPath(repo);
  const encodedFilePath = normalizeFilePath(filePath);
  const endpointCandidates = [
    `${base}/api/v1/repos/${repoPath}/contents/${encodedFilePath}`,
    `${base}/repos/${repoPath}/contents/${encodedFilePath}`
  ];
  const branchCandidates = [];
  for (const candidate of [preferredBranch, 'main', 'master']) {
    const normalized = String(candidate || '').trim();
    if (normalized && !branchCandidates.includes(normalized)) {
      branchCandidates.push(normalized);
    }
  }
  const base64Content = toBase64Utf8(content);
  const errors = [];

  for (const endpoint of endpointCandidates) {
    for (const authHeaders of authHeadersList) {
      for (const branch of branchCandidates) {
        let sha = '';
        const query = new URLSearchParams({ ref: branch }).toString();
        const getResp = await fetch(`${endpoint}?${query}`, {
          method: 'GET',
          headers: authHeaders
        });
        if (getResp.ok) {
          const getParsed = await parseResponseText(getResp);
          sha = getParsed.json?.sha || '';
        } else if (getResp.status !== 404) {
          const getParsed = await parseResponseText(getResp);
          errors.push(`读取远端文件失败(${getResp.status}): ${getParsed.text}`);
          continue;
        }

        const commitResp = await fetch(endpoint, {
          method: 'PUT',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: base64Content,
            message: `sync markdown: ${filePath}`,
            branch,
            ...(sha ? { sha } : {})
          })
        });
        const commitParsed = await parseResponseText(commitResp);
        if (!commitResp.ok) {
          errors.push(`提交文件失败(${commitResp.status}): ${commitParsed.text}`);
          continue;
        }

        const apiUrl = commitParsed.json?.content?.html_url || commitParsed.json?.commit?.html_url || '';
        return {
          url: apiUrl || buildBlobUrl(repo, branch, filePath),
          path: filePath,
          branch
        };
      }
    }
  }

  throw new Error(errors.filter(Boolean).join(' | ') || '仓库内容 API 调用失败');
}

export async function uploadMarkdownToCnb({
  cnbApiBase,
  repo,
  token,
  filePath,
  content,
  cnbGitUsername,
  branch
}) {
  const authHeadersList = buildAuthHeaders(token, cnbGitUsername);
  const bodyBytes = new TextEncoder().encode(content);
  const cnbUploadApiError = [];

  try {
    return await uploadByCnbUploadApi({
      cnbApiBase,
      repo,
      filePath,
      bodyBytes,
      authHeadersList
    });
  } catch (error) {
    cnbUploadApiError.push(error?.message || String(error));
  }

  try {
    return await uploadByRepoContentsApi({
      cnbApiBase,
      repo,
      filePath,
      content,
      authHeadersList,
      preferredBranch: branch
    });
  } catch (error) {
    cnbUploadApiError.push(error?.message || String(error));
  }

  throw new Error(cnbUploadApiError.filter(Boolean).join(' || ') || 'CNB 上传 Markdown 失败');
}
