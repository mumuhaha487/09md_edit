import {
  json,
  requireEnv,
  normalizeTargetDir,
  safeMarkdownFileName,
  uploadMarkdownToGitHub
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

    const repo = requireEnv(env.CNB_REPO || env.GITHUB_REPO, 'CNB_REPO');
    const token = requireEnv(env.CNB_TOKEN || env.GITHUB_TOKEN, 'CNB_TOKEN');
    const branch = String(env.CNB_BRANCH || env.GITHUB_BRANCH || 'main');
    const committerName = String(env.CNB_GIT_USERNAME || env.GITHUB_COMMITTER_NAME || 'markdown-sync-bot');
    const committerEmail = String(env.GITHUB_COMMITTER_EMAIL || `${committerName}@users.noreply.github.com`);
    const targetDir = normalizeTargetDir(env.MARKDOWN_TARGET_DIR || '123', '123');
    const fileName = safeMarkdownFileName(name);
    const filePath = `${targetDir}/${fileName}`;

    const result = await uploadMarkdownToGitHub({
      repo,
      token,
      branch,
      filePath,
      content,
      committerName,
      committerEmail
    });

    return json({
      url: result.url,
      branch: result.branch,
      name: fileName,
      path: result.path
    });
  } catch (error) {
    return json({ error: 'Git 上传 Markdown 失败', details: error.message }, { status: 500 });
  }
};
