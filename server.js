const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const port = 3000;
const cnbGitUsername = process.env.CNB_GIT_USERNAME || 'mumuemhaha';
const cnbRepo = process.env.CNB_REPO || 'mumuemhaha/test';
const cnbToken = process.env.CNB_TOKEN || 'cOB6LW54nY56U168bLhFDmw27pC';
const cnbRemoteUrl = process.env.CNB_REMOTE_URL || `https://cnb.cool/${cnbRepo}.git`;
const cnbGitAuthorName = process.env.CNB_GIT_AUTHOR_NAME || cnbGitUsername;
const cnbGitAuthorEmail = process.env.CNB_GIT_AUTHOR_EMAIL || `${cnbGitUsername}@users.noreply.cnb.cool`;
const markdownTargetDir = process.env.MARKDOWN_TARGET_DIR || '123';
const imageBedUploadUrl = process.env.IMAGE_BED_UPLOAD_URL || 'https://image.0ha.top/upload';
const imageBedPublicBaseUrl = (process.env.IMAGE_BED_PUBLIC_BASE_URL || 'https://image.0ha.top').replace(/\/+$/, '');
const imageBedToken = process.env.IMAGE_BED_TOKEN || 'imgbed_kLM2BsoFaqgCYfdd0GYwngAGulAVUBQY';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json({ limit: '5mb' }));

app.get('/api/config', (req, res) => {
    return res.json({
        imagePublicBaseUrl: imageBedPublicBaseUrl
    });
});

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

function getGitAuthArgs() {
    const basicAuth = Buffer.from(`${cnbGitUsername}:${cnbToken}`).toString('base64');
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
        return '123';
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

        const fileName = safeMarkdownFileName(name);
        tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'md-sync-'));
        const repoDir = path.join(tempRoot, 'repo');
        const authArgs = getGitAuthArgs();
        await runGit([...authArgs, 'clone', '--depth', '1', cnbRemoteUrl, repoDir], process.cwd());

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

        const normalizedTargetDir = normalizeTargetDir(markdownTargetDir);
        const targetDir = await ensureDirectoryTree(repoDir, normalizedTargetDir);
        const relativeFilePath = path.posix.join(normalizedTargetDir, fileName);
        await fs.writeFile(path.join(targetDir, fileName), content, 'utf8');
        await runGit(['config', 'user.name', cnbGitAuthorName], repoDir);
        await runGit(['config', 'user.email', cnbGitAuthorEmail], repoDir);
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

        const fileUrl = `https://cnb.cool/${cnbRepo}/-/blob/${encodeURIComponent(branch)}/${relativeFilePath}`;

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
