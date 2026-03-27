# Markdown 同步服务

这是一个用于上传图片与同步 Markdown 到 Git 仓库的服务，包含两种运行方式：
- Cloudflare Pages Functions（`/workspace/project/functions`）
- Node 服务（`/workspace/project/server.js`）

重要说明：Cloudflare Pages 部署时不支持“同步到仓库”（Git push），其他功能正常可用。若需要把 Markdown 写回仓库，请使用 Node 服务版本。
Node 服务启动时会读取项目根目录的 `.env`，未配置的环境变量将导致相关接口返回错误。

Python 调用项目：
`https://github.com/mumuhaha487/09md_edit_python`

**环境变量**
- `REPO`: 仓库标识，格式为 `owner/name`
- `TOKEN`: Git HTTPS 基本认证 Token，同时用于 CNB API 上传
- `GIT_USERNAME`: Git 用户名（用于 Basic Auth）
- `GIT_BASE_URL`: Git 仓库基础地址，默认 `https://cnb.cool`，可设置为 `https://github.com` 或 `https://gitlab.com`
- `GIT_AUTHOR_NAME`: Git 提交作者名（可选）
- `GIT_AUTHOR_EMAIL`: Git 提交作者邮箱（可选）
- `API_BASE_URL`: CNB API 地址，默认 `https://api.cnb.cool`（Pages Functions 版本上传 Markdown 使用）
- `MARKDOWN_TARGET_DIR`: Markdown 存放目录（仓库内相对路径）
- `IMAGE_BED_UPLOAD_URL`: 图床上传接口
- `IMAGE_BED_PUBLIC_BASE_URL`: 图床公开访问前缀
- `IMAGE_BED_TOKEN`: 图床上传 Token

**使用方式**
- Pages Functions：部署到 Cloudflare Pages 后调用 `/api/upload`、`/api/upload-markdown`
- Node 服务：本地或服务器运行 `node server.js`，调用同样的 API

**示例 .env**
```dotenv
IMAGE_BED_UPLOAD_URL=https://image.YOU_URL/upload
IMAGE_BED_PUBLIC_BASE_URL=https://image.vmss.cn
IMAGE_BED_TOKEN=imgbed_xxx
REPO=123/321
GIT_USERNAME=YOUNAME
TOKEN=your_token
GIT_BASE_URL=https://cnb.cool
MARKDOWN_TARGET_DIR=docs
```
