import {
  json,
  requireEnv,
  normalizeTargetDir,
  safeMarkdownFileName,
  uploadMarkdownToCnb
} from './_shared.js';

export const onRequestPost = async ({ request, env }) => {
  try {
    const payload = await request.json();
    const name = payload?.name;
    const content = payload?.content;

    if (!name || typeof name !== 'string') {
      return json({ error: '文件名缺失' }, { status: 400 });
    }
    if (typeof content !== 'string') {
      return json({ error: 'Markdown 内容缺失' }, { status: 400 });
    }

    const cnbApiBase = String(env.CNB_API_BASE_URL || 'https://api.cnb.cool');
    const repo = requireEnv(env.CNB_REPO, 'CNB_REPO');
    const token = requireEnv(env.CNB_TOKEN, 'CNB_TOKEN');
    const targetDir = normalizeTargetDir(env.MARKDOWN_TARGET_DIR || '123', '123');
    const fileName = safeMarkdownFileName(name);
    const filePath = `${targetDir}/${fileName}`;

    const result = await uploadMarkdownToCnb({
      cnbApiBase,
      repo,
      token,
      filePath,
      content
    });

    return json({
      url: result.url,
      name: fileName,
      path: result.path
    });
  } catch (error) {
    return json({ error: 'Git 上传 Markdown 失败', details: error.message }, { status: 500 });
  }
};
