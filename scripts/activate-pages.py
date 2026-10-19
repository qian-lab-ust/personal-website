#!/usr/bin/env python3
"""One-time blog activation. Run in a signed-in terminal, never in a web page."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE = ROOT.parent.parent
CONFIG = json.loads((ROOT / 'site.config.json').read_text())
SLUG = CONFIG['repository']
URL = CONFIG['origin'] + CONFIG['basePath']
GH = shutil.which('gh') or str(WORKSPACE / 'work/tools/gh')
ENV = dict(os.environ)
ENV['PATH'] = '/opt/homebrew/bin:/usr/local/bin:' + ENV.get('PATH', '')
ENV['GH_PAGER'] = 'cat'
if (WORKSPACE / 'work/github-auth/hosts.yml').exists():
    ENV['GH_CONFIG_DIR'] = str(WORKSPACE / 'work/github-auth')


def run(args, check=True):
    result = subprocess.run([str(a) for a in args], cwd=ROOT, env=ENV, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError('命令失败：' + ' '.join(map(str, args[:3])) + '\n' + result.stderr.strip())
    return result


def git(*args):
    return run(['git', *args]).stdout.strip()


def api(endpoint, *args):
    result = run([GH, 'api', endpoint, *args])
    return json.loads(result.stdout) if result.stdout.strip() else None


def set_pages(body):
    # JSON goes over stdin, preserving the existing domain and HTTPS settings.
    result = subprocess.run([GH, 'api', 'repos/' + SLUG + '/pages', '--method', 'PUT', '--input', '-'],
                            cwd=ROOT, env=ENV, input=json.dumps(body), capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('无法设置 GitHub Pages：' + result.stderr.strip())


def main():
    print('1/5 检查账号、源代码及仓库权限…', flush=True)
    auth = run([GH, 'api', 'user', '--jq', '.login'], check=False)
    if auth.returncode or auth.stdout.strip() != SLUG.split('/')[0]:
        raise RuntimeError('当前终端未登录正确的 GitHub 账号。请使用之前的 gh auth login 命令登录 qian-lab-ust，再运行本脚本。')
    if git('remote', 'get-url', 'origin') != 'https://github.com/' + SLUG + '.git':
        raise RuntimeError('origin 与指定仓库不同，已停止。')
    if git('branch', '--show-current') != CONFIG['branch'] or git('status', '--porcelain'):
        raise RuntimeError('必须在干净的 main 分支上运行。请让助手检查未提交改动。')
    details = api('repos/' + SLUG)
    if details['private']:
        raise RuntimeError('仓库已变为私有，需要先确认新的 Pages 方案；本脚本不会改变可见性。')
    collaborators = api('repos/' + SLUG + '/collaborators?per_page=100')
    other_writers = [u['login'] for u in collaborators if u['login'] != SLUG.split('/')[0] and any(u.get('permissions', {}).get(p) for p in ['push', 'maintain', 'admin'])]
    if other_writers:
        raise RuntimeError('仓库还有其他可写协作者，无法满足仅本人管理：' + ', '.join(other_writers) + '。请先检查权限。')
    git('fetch', 'origin', CONFIG['branch'])
    if run(['git', 'merge-base', '--is-ancestor', 'origin/' + CONFIG['branch'], 'HEAD'], check=False).returncode:
        raise RuntimeError('远程分支有尚未合并的改动，已停止；不会强制推送或覆盖。')
    for command in [['npm', 'ci', '--ignore-scripts', '--no-fund'], ['npm', 'test'], ['npm', 'run', 'build']]:
        result = run(command)
        print(result.stdout, flush=True)

    print('2/5 核对新增 Actions 工作流所需的授权…', flush=True)
    headers = run([GH, 'api', '-i', 'user']).stdout
    scopes = next((line.split(':', 1)[1].strip() for line in headers.splitlines() if line.lower().startswith('x-oauth-scopes:')), None)
    if scopes is not None and 'workflow' not in [s.strip() for s in scopes.split(',')]:
        print('本次需要增加 workflow 权限以提交自动部署配置，请按终端提示在 GitHub 确认。', flush=True)
        result = subprocess.run([GH, 'auth', 'refresh', '--hostname', 'github.com', '--scopes', 'workflow'], cwd=ROOT, env=ENV)
        if result.returncode:
            raise RuntimeError('workflow 授权未完成，尚未切换发布方式。')

    print('3/5 保留现有网站，切换自动构建并安全推送…', flush=True)
    old_pages = api('repos/' + SLUG + '/pages')
    changed = old_pages.get('build_type') != 'workflow'
    if changed:
        set_pages({'build_type': 'workflow'})
    helper = '!' + '"' + GH.replace('"', '\\"') + '" auth git-credential'
    try:
        run(['git', '-c', 'credential.helper=', '-c', 'credential.helper=' + helper, 'push', 'origin', CONFIG['branch']])
    except Exception:
        if changed:
            rollback = {'build_type': old_pages.get('build_type') or 'legacy'}
            if old_pages.get('source'):
                rollback['source'] = old_pages['source']
            try:
                set_pages(rollback)
                print('推送失败，已恢复原 Pages 发布方式。', flush=True)
            except Exception:
                print('推送失败，原网站仍在线，但 Pages 发布源恢复失败，请检查 Settings → Pages。', flush=True)
        raise
    commit = git('rev-parse', 'HEAD')
    if api('repos/' + SLUG + '/commits/' + CONFIG['branch'])['sha'] != commit:
        raise RuntimeError('远程提交与预期不同，已停止验证。')
    print('已推送：' + commit[:7], flush=True)

    print('4/5 等待 Actions 测试、构建与部署…', flush=True)
    run_url = None
    for attempt in range(60):
        result = run([GH, 'api', 'repos/' + SLUG + '/actions/workflows/pages.yml/runs?head_sha=' + commit], check=False)
        runs = json.loads(result.stdout).get('workflow_runs', []) if result.returncode == 0 else []
        if runs:
            latest = runs[0]
            run_url = latest.get('html_url')
            if latest['status'] == 'completed':
                if latest.get('conclusion') != 'success':
                    raise RuntimeError('自动部署未成功，请查看：' + str(run_url))
                break
            print('Actions：' + latest['status'], flush=True)
        elif attempt == 3:
            api('repos/' + SLUG + '/actions/workflows/pages.yml/dispatches', '--method', 'POST', '-f', 'ref=' + CONFIG['branch'])
        time.sleep(10)
    else:
        raise RuntimeError('等待 Actions 超时；可查看仓库 Actions，原网站不会因等待超时被删除。')

    print('5/5 从公开网址核验主页、Blog 与后台入口…', flush=True)
    paths = ['index.html', 'styles.css', 'blog.css', 'profile.js', 'site.js', 'blog/index.html', 'admin/index.html']
    for attempt in range(30):
        valid = True
        for name in paths:
            route = '' if name == 'index.html' else name.replace('index.html', '')
            req = urllib.request.Request(URL + route + '?verify=' + commit, headers={'User-Agent': 'MrQBlogActivation', 'Cache-Control': 'no-cache'})
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    data = response.read()
                if hashlib.sha256(data).digest() != hashlib.sha256((ROOT / '_site' / name).read_bytes()).digest():
                    valid = False
                    break
            except (urllib.error.URLError, TimeoutError):
                valid = False
                break
        if valid:
            break
        time.sleep(10)
    else:
        raise RuntimeError('Actions 已完成，但公开页面尚未全部匹配。请让助手检查网址，勿重复推送。')
    pages = api('repos/' + SLUG + '/pages')
    if not pages.get('public'):
        raise RuntimeError('未确认网站为公开，请检查 Pages 设置。')
    report = {'url': URL, 'blog': URL + 'blog/', 'admin': URL + 'admin/', 'commit': commit,
              'actions': run_url, 'public': True, 'verified_files': paths,
              'cms_login_and_crud': '需要在授权 Pages CMS 后做真实浏览器验收'}
    (ROOT.parent / 'blog-deployment.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('\n博客升级已部署并验证。\nBlog：' + URL + 'blog/\n后台：' + URL + 'admin/', flush=True)
    print('首次使用请在后台完成 Pages CMS 的 GitHub App 授权。此后文章保存会自动部署，不必再次运行本脚本。', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('\n未完成：' + str(error), file=sys.stderr, flush=True)
        sys.exit(1)
