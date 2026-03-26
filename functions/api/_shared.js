const DEFAULT_IMAGE_PUBLIC_BASE_URL = 'https://image.0ha.top';
const DEFAULT_MARKDOWN_TARGET_DIR = '123';
const DEFAULT_CNB_API_BASE_URL = 'https://api.cnb.cool';

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

export function errorResponse(error, fallbackMessage = '服务器内部错误') {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const payload = {
    error: error?.message || fallbackMessage
  };

  if (error?.details !== undefined) {
    payload.details = error.details;
  }

  return json(payload, { status });
}

export function requireEnv(value, keyName) {
  if (!value || !String(value).trim()) {
    throw createHttpError(500, `缺少环境变量 ${keyName}`);
  }
  return String(value).trim();
}

export function normalizeBaseUrl(value, fallback) {
  const normalized = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  return normalized;
}

export function normalizeTargetDir(inputDir, fallback = DEFAULT_MARKDOWN_TARGET_DIR) {
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

function getCnbErrorMessage(payload, fallbackMessage) {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage;
  }

  const fromPayload = payload.message || payload.msg || payload.errmsg || payload.error;
  if (typeof fromPayload === 'string' && fromPayload.trim()) {
    return fromPayload.trim();
  }

  return fallbackMessage;
}

function hasCnbBusinessError(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'errcode')) {
    return false;
  }

  const errcode = Number(payload.errcode);
  return Number.isFinite(errcode) && errcode !== 0;
}

export function getPublicConfig(env) {
  return {
    imagePublicBaseUrl: normalizeBaseUrl(env.IMAGE_BED_PUBLIC_BASE_URL, DEFAULT_IMAGE_PUBLIC_BASE_URL)
  };
}

export function getImageUploadConfig(env) {
  return {
    ...getPublicConfig(env),
    imageBedUploadUrl: requireEnv(env.IMAGE_BED_UPLOAD_URL, 'IMAGE_BED_UPLOAD_URL'),
    imageBedToken: requireEnv(env.IMAGE_BED_TOKEN, 'IMAGE_BED_TOKEN')
  };
}

export function getMarkdownUploadConfig(env) {
  return {
    cnbApiBase: normalizeBaseUrl(env.CNB_API_BASE_URL, DEFAULT_CNB_API_BASE_URL),
    repo: requireEnv(env.CNB_REPO, 'CNB_REPO'),
    token: requireEnv(env.CNB_TOKEN, 'CNB_TOKEN'),
    targetDir: normalizeTargetDir(env.MARKDOWN_TARGET_DIR, DEFAULT_MARKDOWN_TARGET_DIR)
  };
}

export async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    throw createHttpError(400, '请求体不是合法的 JSON');
  }
}

export async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

export function getFileExtension(file) {
  const fileName = String(file?.name || '');
  const fileExt = fileName.includes('.') ? `.${fileName.split('.').pop().toLowerCase()}` : '';
  if (fileExt) {
    return fileExt;
  }

  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/avif': '.avif'
  };

  return mimeToExt[String(file?.type || '').toLowerCase()] || '.png';
}

export function buildImageUploadFileName(file) {
  return `${Date.now()}_image${getFileExtension(file)}`;
}

export function resolveAbsoluteUrl(value, baseUrl) {
  const candidate = String(value || '').trim();
  if (!candidate) {
    return '';
  }
  if (/^https?:\/\//i.test(candidate)) {
    return candidate;
  }
  if (candidate.startsWith('/')) {
    return `${baseUrl}${candidate}`;
  }
  return candidate;
}

export function extractImageUrl(payload, baseUrl) {
  if (!payload) {
    return '';
  }

  if (Array.isArray(payload)) {
    const firstItem = payload[0];
    if (typeof firstItem === 'string') {
      return resolveAbsoluteUrl(firstItem, baseUrl);
    }
    if (firstItem?.src) {
      return resolveAbsoluteUrl(firstItem.src, baseUrl);
    }
  }

  if (typeof payload === 'string') {
    return resolveAbsoluteUrl(payload, baseUrl);
  }

  return resolveAbsoluteUrl(
    payload.url || payload.src || payload?.data?.links?.url || payload?.data?.url || payload?.assets?.url,
    baseUrl
  );
}

export async function uploadImageToImageBed({
  file,
  imageBedUploadUrl,
  imageBedToken,
  imagePublicBaseUrl
}) {
  const uploadForm = new FormData();
  const uploadName = buildImageUploadFileName(file);
  uploadForm.append('file', file, uploadName);

  const response = await fetch(imageBedUploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${imageBedToken}`
    },
    body: uploadForm
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw createHttpError(response.status, '图片上传失败', payload);
  }

  return {
    fileName: uploadName,
    url: extractImageUrl(payload, imagePublicBaseUrl),
    raw: payload
  };
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
  const targetDir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const targetDirVariants = Array.from(
    new Set([targetDir, `/${targetDir}`.replace(/\/+/g, '/').replace(/^\/$/, ''), ''].map((item) => String(item || '')))
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  let initData = null;
  let uploadUrl = '';
  let usedTargetDir = targetDir;
  let lastInitError = null;

  for (const candidateTargetDir of targetDirVariants) {
    const initResp = await fetch(`${cnbApiBase}/${repo}/-/upload/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: uploadName,
        size: bodyBytes.byteLength,
        ext: {
          type: 'markdown',
          target_dir: candidateTargetDir
        }
      })
    });

    initData = await parseResponseBody(initResp);
    if (!initResp.ok) {
      lastInitError = createHttpError(initResp.status, '初始化 Markdown 上传失败', initData);
      continue;
    }

    if (hasCnbBusinessError(initData)) {
      const businessErrorMessage = getCnbErrorMessage(initData, '初始化 Markdown 上传失败');
      lastInitError = createHttpError(400, businessErrorMessage, initData);
      continue;
    }

    uploadUrl = initData?.upload_url || '';
    if (!uploadUrl) {
      lastInitError = createHttpError(500, '未获取到上传地址', initData);
      continue;
    }

    usedTargetDir = candidateTargetDir;
    lastInitError = null;
    break;
  }

  if (!uploadUrl) {
    throw lastInitError || createHttpError(500, '初始化 Markdown 上传失败');
  }

  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8'
    },
    body: bodyBytes
  });

  const putData = await parseResponseBody(putResp);
  if (!putResp.ok) {
    throw createHttpError(putResp.status, 'Markdown 文件写入失败', putData);
  }

  const fallbackPath = usedTargetDir ? `${usedTargetDir.replace(/^\/+/, '')}/${uploadName}` : uploadName;
  const path = initData?.assets?.path || initData?.path || fallbackPath;
  const url = resolveAbsoluteUrl(
    initData?.assets?.url || initData?.url || path,
    'https://cnb.cool'
  );

  return {
    url,
    path,
    raw: {
      init: initData,
      put: putData
    }
  };
}
