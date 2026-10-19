# Mr.Q · 个人主页与博客

现有黑底、白字、亮绿色 Q 图标和苹果系统字体保持不变。首页新增 Blog 与文章管理入口。

## 地址

- 主页：https://qian-lab-ust.github.io/personal-website/
- Blog：https://qian-lab-ust.github.io/personal-website/blog/
- 后台入口：https://qian-lab-ust.github.io/personal-website/admin/
- CMS：https://app.pagescms.org/qian-lab-ust/personal-website/main/collection/posts

新增地址在本次升级成功部署后生效。GitHub Pages 使用项目子路径，所以后台是 `/personal-website/admin/`。

## 使用方式

首次在 Pages CMS 用 `qian-lab-ust` 登录，安装其 GitHub App 时选择 **Only select repositories → personal-website**。不添加其他仓库协作者或 CMS 邮箱协作者，以维持本人管理。

日常只需浏览器：后台 → 文章 → New entry → 标题、正文、图片 → 状态选「草稿」或「已发布」→ Save。之后 GitHub Actions 自动生成网站，一般几分钟后可见。编辑后保存会更新同一个网址；删除需要确认，随后自动从网站移除。

详见 [写作指南](BLOG-GUIDE.md)。这是由 Pages CMS 提供的真实编辑器，本站 `/admin/` 是登录入口，编辑会在其官方托管域名完成。后台不是本地存储或模拟保存。

## 数据与安全

- 文章：`content/posts/<UUID>.md`，包含 YAML 元数据与 Markdown 正文。自动生成的 ID 保持链接稳定，改标题不改链接。
- 图片：`media/`，持久化到 GitHub；当前支持 JPG、PNG、WebP、GIF、AVIF，发布检查限制单张不超过 10 MB。
- `.pages.yml`：CMS 字段、图片目录、草稿默认值。无密码或写入令牌。
- GitHub OAuth 与写入凭据由 Pages CMS 服务端处理；访问控制依赖 GitHub 仓库权限和 CMS 协作者权限。
- **当前 GitHub 仓库公开。草稿不进入 Blog，但草稿源文件、图片和历史仍可通过 GitHub 查看。草稿不适合存放私密内容。** 若需要保密，必须另行设计私有内容仓库或数据库，不能只隐藏链接。
- 构建只输出明确允许的页面与已发布文章引用的图片。不输出内容源文件、密钥、配置、测试或依赖。已发布正文中的脚本和危险 HTML 会被过滤。
- 删除文章不会自动删除图片，避免破坏其他文章引用；删除已公开内容也不能保证互联网缓存或 Git 历史消失。

## 部署与维护

继续使用 GitHub Pages，不迁移托管平台。Pages 发布源需设置成 **GitHub Actions**。

工作流：`.github/workflows/pages.yml`。每次 `main` 收到 CMS 或代码提交，自动执行 `npm ci`、测试、构建，再通过 GitHub 官方 Pages Actions 部署 `_site/`。构建失败时不会部署，旧网站继续可用。

首次升级需要在有 GitHub 登录权限的 Mac 终端运行一次提供的 `enable-blog.command`。这只用于安装本次升级，之后每篇文章不需要终端、Git 命令或手动部署。

本地开发（Node.js 22 或以上；CI 使用 Node.js 24）：

```sh
npm ci --ignore-scripts
npm test
npm run build
npm run preview
```

预览：http://127.0.0.1:8765/personal-website/ 。改完代码后重新运行构建并刷新。首页原始文件仍可直接打开，但 Blog 需要使用构建结果预览。

## 目录

- `index.html`, `styles.css`, `profile.js`, `site.js`：原有主页
- `site.config.json`：公开网址、项目路径、GitHub 仓库
- `blog.css`：Blog、文章页与管理入口样式
- `content/posts/`, `media/`：CMS 持久数据
- `scripts/build.mjs`：静态页面生成、安全过滤与图片校验
- `scripts/preview.mjs`：本地预览
- `scripts/activate-pages.py`：一次性部署安装与验证
- `tests/blog.test.mjs`：内容生命周期、安全与部署产物测试
- `_site/`：生成的网站（不提交）

## 当前验收边界

本地内容创建、草稿保存、发布、编辑、撤下、删除与图片构建已自动化验证；这不等同于通过 Pages CMS 完成真实账户的 CRUD 验收。首次上线、GitHub App 授权及真实浏览器写作必须另外核验。请以任务中的最终验证结果为准。

官方资料：[Pages CMS](https://pagescms.org/docs/)、[GitHub Pages 自动部署](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
