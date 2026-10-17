# 个人主页

纯黑背景、白色文字、亮绿色图形的极简个人主页，适配手机与桌面，无需安装依赖或构建。

全站使用苹果系统字体优先的字体栈：`-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`。苹果设备使用系统字体，其他系统使用各自的无衬线字体。无需下载或分发苹果字体文件。

## 修改内容

打开 `profile.js` 修改名字、介绍、兴趣、GitHub 用户名、邮箱和作品。保存并提交到 GitHub 后，Pages 会重新发布。当前介绍和作品是示例与占位内容；可在后续编辑时替换。联系方式留空时不会产生无效链接。

## 在 GitHub Pages 发布

1. 使用现有仓库 `https://github.com/qian-lab-ust/personal-website`，保留现有提交历史。
2. 把本文件夹内的文件上传至仓库根目录，确保 `index.html` 位于根目录。
3. 打开仓库 **Settings → Pages → Build and deployment**。
4. Source 选择 **Deploy from a branch**，Branch 选择 **main**，目录选择 **/ (root)**，点击 **Save**。
5. 等待 GitHub 部署成功，访问 `https://qian-lab-ust.github.io/personal-website/`。

这套纯静态页面直接使用根目录发布，不需要额外的 GitHub Actions 工作流。GitHub Free 支持公开仓库的 Pages 网站。公开仓库里的文件和主页内容均对外可见，请仅填写准备公开的信息。

官方说明：https://docs.github.com/en/pages/quickstart

## 本地预览

直接双击 `index.html`，或在本文件夹运行 `python3 -m http.server 8000` 后访问 `http://localhost:8000`。

## 文件

- `index.html`：页面结构
- `styles.css`：样式与响应式布局
- `profile.js`：个人资料与作品配置
- `site.js`：资料展示逻辑
- `.nojekyll`：使用静态文件发布

本版本不包含后台、登录或留言提交服务。
