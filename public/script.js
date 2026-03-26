document.addEventListener('DOMContentLoaded', () => {
    const markdownInput = document.getElementById('markdown-input');
    const markdownPreview = document.getElementById('markdown-preview');
    const clearBtn = document.getElementById('clear-btn');
    const toast = document.getElementById('toast');
    const appConfig = {
        imagePublicBaseUrl: 'https://image.0ha.top',
        markdownSyncApiUrl: '/api/upload-markdown'
    };

    // Init marked options (optional)
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    // Handle input to render markdown
    markdownInput.addEventListener('input', () => {
        const text = markdownInput.value;
        markdownPreview.innerHTML = marked.parse(text);
        localStorage.setItem('md-content', text); // Save to local storage
    });

    // Load from local storage
    const savedContent = localStorage.getItem('md-content');
    if (savedContent) {
        markdownInput.value = savedContent;
        markdownPreview.innerHTML = marked.parse(savedContent);
    }

    loadAppConfig();

    // Clear button
    clearBtn.addEventListener('click', () => {
        if(confirm('真的要清空内容吗喵？ (｡>﹏<｡)')) {
            markdownInput.value = '';
            markdownPreview.innerHTML = '';
            localStorage.removeItem('md-content');
            showToast('已清空~ ✨');
        }
    });

    // Set default date for published
    const fmPublished = document.getElementById('fm-published');
    if (!fmPublished.value) {
        fmPublished.value = new Date().toISOString().split('T')[0];
    }

    const exportBtn = document.getElementById('export-btn');
    const uploadBtn = document.getElementById('upload-btn');

    function createTimestampFileName() {
        const now = new Date();
        const year = String(now.getFullYear());
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const randomTwoDigits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        return `${year}${month}${day}${hour}${minute}${randomTwoDigits}.md`;
    }

    function buildMarkdownFile() {
        const title = document.getElementById('fm-title').value.trim() || '未命名文章';
        const published = document.getElementById('fm-published').value || new Date().toISOString().split('T')[0];
        const description = document.getElementById('fm-description').value.trim() || '';
        const image = document.getElementById('fm-image').value.trim() || '';
        
        // Handle tags: convert comma separated string to array format
        const tagsRaw = document.getElementById('fm-tags').value;
        const tagsArray = tagsRaw.split(/[,，]/).map(t => t.trim()).filter(t => t);
        const tagsStr = tagsArray.length > 0 ? `[${tagsArray.join(',')}]` : '[]';
        
        const category = document.getElementById('fm-category').value.trim() || '';

        // Generate Front Matter
        const frontMatter = `---
title: ${title}
published: ${published}
description: '${description}'
image: '${image}'
tags: ${tagsStr}
category: '${category}'
draft: false 
lang: 'zh-CN'
---

`;

        const finalContent = frontMatter + markdownInput.value;
        const fileName = createTimestampFileName();
        return {
            fileName,
            finalContent
        };
    }

    exportBtn.addEventListener('click', () => {
        const { fileName, finalContent } = buildMarkdownFile();
        const blob = new Blob([finalContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
        showToast('导出成功喵！🎉');
    });

    uploadBtn.addEventListener('click', async () => {
        const { fileName, finalContent } = buildMarkdownFile();
        try {
            showToast('正在上传到 Git 仓库... 🚀');
            const response = await fetch(appConfig.markdownSyncApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: fileName,
                    content: finalContent
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || '上传失败');
            }

            const data = await response.json();
            const uploadedUrl = data.url || '';

            if (!uploadedUrl) {
                throw new Error('上传成功但未返回 URL');
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(uploadedUrl).catch(() => {});
            }

            showToast('上传成功，链接已复制 🎉');
            window.open(uploadedUrl, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Markdown Upload Error:', error);
            showToast(`上传失败：${error.message}`);
        }
    });

    // Handle paste event
    markdownInput.addEventListener('paste', async (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    e.preventDefault(); // Prevent default paste behavior
                    await uploadImage(file);
                }
            }
        }
    });

    async function uploadImage(file) {
        showToast('正在努力上传图片中... 🚀');
        
        // Insert a placeholder first
        const placeholder = `![Uploading ${file.name}喵...]()\n`;
        insertTextAtCursor(placeholder);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('上传失败啦');
            }

            const data = await response.json();
            
            // Try to find the image URL from various possible response formats
            let imageUrl = '';
            
            // Check Cloudflare ImgBed standard response format first
            if (Array.isArray(data) && data.length > 0 && data[0].src) {
                // Return full URL
                imageUrl = appConfig.imagePublicBaseUrl + data[0].src;
            } else if (data.url) {
                imageUrl = data.url;
            } else if (data.data && data.data.links && data.data.links.url) {
                imageUrl = data.data.links.url;
            } else if (typeof data === 'string' && data.startsWith('http')) {
                imageUrl = data;
            } else if (typeof data === 'string' && data.startsWith('/')) {
                imageUrl = appConfig.imagePublicBaseUrl + data;
            } else if (data.src) {
                imageUrl = data.src.startsWith('http') ? data.src : appConfig.imagePublicBaseUrl + data.src;
            } else {
                console.log('Response data:', data); // Log for debugging
                // If the data itself is an array but we failed above, try again
                if (data[0] && typeof data[0] === 'string') {
                    imageUrl = data[0].startsWith('http') ? data[0] : appConfig.imagePublicBaseUrl + data[0];
                } else {
                    throw new Error('找不到图片链接喵');
                }
            }
            
            // Ensure the URL is complete
            if (imageUrl.startsWith('/')) {
                imageUrl = appConfig.imagePublicBaseUrl + imageUrl;
            }

            // Replace the placeholder with the real image URL
            const newContent = markdownInput.value.replace(placeholder, `![image](${imageUrl})\n`);
            markdownInput.value = newContent;
            
            // Trigger input event to re-render
            markdownInput.dispatchEvent(new Event('input'));
            
            showToast('图片上传成功啦！ 🎉');
        } catch (error) {
            console.error('Upload Error:', error);
            showToast('上传出错了呜呜... 😭');
            // Remove the placeholder if failed
            markdownInput.value = markdownInput.value.replace(placeholder, '');
        }
    }

    function insertTextAtCursor(text) {
        const startPos = markdownInput.selectionStart;
        const endPos = markdownInput.selectionEnd;
        const beforeText = markdownInput.value.substring(0, startPos);
        const afterText = markdownInput.value.substring(endPos, markdownInput.value.length);
        
        markdownInput.value = beforeText + text + afterText;
        markdownInput.selectionStart = markdownInput.selectionEnd = startPos + text.length;
        
        // Trigger render
        markdownInput.dispatchEvent(new Event('input'));
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    async function loadAppConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                return;
            }
            const data = await response.json();
            if (data && typeof data.imagePublicBaseUrl === 'string' && data.imagePublicBaseUrl.trim()) {
                appConfig.imagePublicBaseUrl = data.imagePublicBaseUrl.replace(/\/+$/, '');
            }
            if (data && typeof data.markdownSyncApiUrl === 'string' && data.markdownSyncApiUrl.trim()) {
                appConfig.markdownSyncApiUrl = data.markdownSyncApiUrl.trim();
            }
        } catch (error) {
        }
    }
});
