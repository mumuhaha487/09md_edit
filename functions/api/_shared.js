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
  const raw = String(value ?? '').trim();
  const sanitizedValue = raw && raw !== 'undefined' && raw !== 'null' ? raw : '';
  const normalized = String(sanitizedValue || fallback || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

export function normalizeTargetDir(inputDir, fallback = '') {
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

export function getPublicConfig(env) {
  const imagePublicBaseUrl = normalizeBaseUrl(
    requireEnv(env.IMAGE_BED_PUBLIC_BASE_URL, 'IMAGE_BED_PUBLIC_BASE_URL')
  );
  if (!imagePublicBaseUrl) {
    throw createHttpError(500, '环境变量 IMAGE_BED_PUBLIC_BASE_URL 必须是有效的 http/https 地址');
  }
  return {
    imagePublicBaseUrl
  };
}

export function getImageUploadConfig(env) {
  return {
    ...getPublicConfig(env),
    imageBedUploadUrl: requireEnv(env.IMAGE_BED_UPLOAD_URL, 'IMAGE_BED_UPLOAD_URL'),
    imageBedToken: requireEnv(env.IMAGE_BED_TOKEN, 'IMAGE_BED_TOKEN')
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
