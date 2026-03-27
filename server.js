const express = require('express');
const multer = require('multer');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const port = 3000;

loadEnvFile(path.join(__dirname, '.env'));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

app.get('/api/config', (req, res) => {
    try {
        const { imageBedPublicBaseUrl } = getImageBedConfig();
        return res.json({
            imagePublicBaseUrl: imageBedPublicBaseUrl
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

function loadEnvFile(filePath) {
    if (!fsSync.existsSync(filePath)) {
        return;
    }
    const content = fsSync.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const index = trimmed.indexOf('=');
        if (index <= 0) {
            continue;
        }
        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function requireEnv(value, keyName) {
    if (!value || !String(value).trim()) {
        throw new Error(`缺少环境变量 ${keyName}`);
    }
    return String(value).trim();
}

function normalizeRepoName(inputRepo) {
    const raw = String(inputRepo || '').trim();
    if (!raw) {
        return '';
    }
    return raw.endsWith('.git') ? raw.slice(0, -4) : raw;
}

function buildFileUrl({ baseUrl, repoName, branch, filePath }) {
    let host = '';
    try {
        host = new URL(baseUrl).hostname.toLowerCase();
    } catch (error) {
        host = '';
    }

    const blobSegment = host === 'github.com' ? 'blob' : '-/blob';
    return `${baseUrl}/${repoName}/${blobSegment}/${encodeURIComponent(branch)}/${filePath}`;
}

function getImageBedConfig() {
    const imageBedUploadUrl = requireEnv(process.env.IMAGE_BED_UPLOAD_URL, 'IMAGE_BED_UPLOAD_URL');
    const imageBedPublicBaseUrl = requireEnv(process.env.IMAGE_BED_PUBLIC_BASE_URL, 'IMAGE_BED_PUBLIC_BASE_URL').replace(/\/+$/, '');
    const imageBedToken = requireEnv(process.env.IMAGE_BED_TOKEN, 'IMAGE_BED_TOKEN');
    return {
        imageBedUploadUrl,
        imageBedPublicBaseUrl,
        imageBedToken
    };
}

function getGitConfig() {
    const repo = normalizeRepoName(requireEnv(process.env.REPO, 'REPO'));
    const gitUsername = requireEnv(process.env.GIT_USERNAME, 'GIT_USERNAME');
    const token = requireEnv(process.env.TOKEN, 'TOKEN');
    const gitBaseUrl = requireEnv(process.env.GIT_BASE_URL, 'GIT_BASE_URL').replace(/\/+$/, '');
    const gitAuthorName = process.env.GIT_AUTHOR_NAME || gitUsername;
    const gitAuthorEmail = process.env.GIT_AUTHOR_EMAIL || `${gitUsername}@users.noreply.cnb.cool`;
    const rawTargetDir = requireEnv(process.env.MARKDOWN_TARGET_DIR, 'MARKDOWN_TARGET_DIR');
    const normalizedTargetDir = normalizeTargetDir(rawTargetDir);
    if (!normalizedTargetDir) {
        throw new Error('MARKDOWN_TARGET_DIR 无效');
    }

    return {
        repo,
        gitUsername,
        token,
        gitBaseUrl,
        gitAuthorName,
        gitAuthorEmail,
        markdownTargetDir: normalizedTargetDir,
        remoteUrl: `${gitBaseUrl}/${repo}.git`
    };
}

function runGit(args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn('git', args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (error) => {
            reject(error);
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr, code });
                return;
            }
            const error = new Error(stderr || `git 失败，退出码 ${code}`);
            error.code = code;
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
        });
    });
}

function getGitAuthArgs(gitUsername, token) {
    const basicAuth = Buffer.from(`${gitUsername}:${token}`).toString('base64');
    return ['-c', `http.extraHeader=Authorization: Basic ${basicAuth}`];
}

function safeMarkdownFileName(inputName) {
    const onlyName = path.basename(inputName || '');
    const normalized = onlyName.replace(/[^\w.\-()\u4e00-\u9fa5]/g, '-');
    if (!normalized) {
        return 'untitled.md';
    }
    return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

function normalizeTargetDir(inputDir) {
    const normalized = String(inputDir || '')
        .replace(/\\/g, '/')
        .split('/')
        .map((segment) => segment.trim())
        .filter((segment) => segment && segment !== '.' && segment !== '..');
    if (normalized.length === 0) {
        return '';
    }
    return normalized.join('/');
}

async function ensureDirectoryTree(baseDir, relativeDir) {
    const segments = relativeDir.split('/').filter(Boolean);
    let currentPath = baseDir;
    for (const segment of segments) {
        currentPath = path.join(currentPath, segment);
        try {
            const stat = await fs.stat(currentPath);
            if (!stat.isDirectory()) {
                await fs.rm(currentPath, { recursive: true, force: true });
                await fs.mkdir(currentPath);
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(currentPath);
                continue;
            }
            throw error;
        }
    }
    return currentPath;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { imageBedUploadUrl, imageBedToken } = getImageBedConfig();

        // Use built-in FormData and Blob for Node 18+
        const formData = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        
        // Generate a timestamped filename like 1774524320065_image.png
        const timestamp = Date.now();
        const originalExt = path.extname(req.file.originalname) || '.png';
        const newFilename = `${timestamp}_image${originalExt}`;
        
        formData.append('file', blob, newFilename);

        const response = await fetch(imageBedUploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${imageBedToken}`
            },
            body: formData
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

app.post('/api/upload-markdown', async (req, res) => {
    let tempRoot = '';
    try {
        const { name, content } = req.body || {};

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: '文件名缺失' });
        }
        if (typeof content !== 'string') {
            return res.status(400).json({ error: 'Markdown 内容缺失' });
        }

        const {
            repo,
            gitUsername,
            token,
            gitBaseUrl,
            gitAuthorName,
            gitAuthorEmail,
            markdownTargetDir,
            remoteUrl
        } = getGitConfig();

        const fileName = safeMarkdownFileName(name);
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'md-sync-'));
        const repoDir = path.join(tempRoot, 'repo');
        const authArgs = getGitAuthArgs(gitUsername, token);
        await runGit([...authArgs, 'clone', '--depth', '1', remoteUrl, repoDir], process.cwd());

        let branch = 'main';
        try {
            const headRef = await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repoDir);
            const raw = headRef.stdout.trim();
            if (raw.startsWith('origin/')) {
                branch = raw.slice('origin/'.length);
            }
        } catch (error) {
            const localBranch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
            branch = localBranch.stdout.trim() || 'main';
        }

        const targetDir = await ensureDirectoryTree(repoDir, markdownTargetDir);
        const relativeFilePath = path.posix.join(markdownTargetDir, fileName);
        await fs.writeFile(path.join(targetDir, fileName), content, 'utf8');
        await runGit(['config', 'user.name', gitAuthorName], repoDir);
        await runGit(['config', 'user.email', gitAuthorEmail], repoDir);
        await runGit(['config', 'commit.gpgsign', 'false'], repoDir);
        await runGit(['add', '--', relativeFilePath], repoDir);

        let hasChanges = true;
        try {
            await runGit(['diff', '--cached', '--quiet', '--', relativeFilePath], repoDir);
            hasChanges = false;
        } catch (error) {
            hasChanges = true;
        }

        if (hasChanges) {
            await runGit(['-c', 'commit.gpgsign=false', 'commit', '-m', `sync markdown: ${relativeFilePath}`], repoDir);
            await runGit([...authArgs, 'push', 'origin', `HEAD:${branch}`], repoDir);
        }

        const fileUrl = buildFileUrl({
            baseUrl: gitBaseUrl,
            repoName: repo,
            branch,
            filePath: relativeFilePath
        });

        return res.json({
            url: fileUrl,
            branch,
            name: fileName,
            path: relativeFilePath
        });
    } catch (error) {
        return res.status(500).json({ error: 'Git 上传 Markdown 失败', details: error.message });
    } finally {
        if (tempRoot) {
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
