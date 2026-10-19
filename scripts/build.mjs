import { readFile, writeFile, mkdir, readdir, rm, rename, copyFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import YAML from 'yaml';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageTypes = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

export function parsePost(source, filename) {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`${filename}: 文章必须包含 YAML 元数据。`);
  const data = YAML.parse(match[1], { maxAliasCount: 20 });
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: 元数据格式错误。`);
  // Missing/unknown statuses fail closed: they can never accidentally publish.
  if (data.status !== 'published') return null;
  if (typeof data.id !== 'string' || !uuidPattern.test(data.id)) throw new Error(`${filename}: 缺少有效的文章 ID。`);
  if (filename !== `${data.id}.md`) throw new Error(`${filename}: 文件名和文章 ID 不一致。`);
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 300) throw new Error(`${filename}: 标题不能为空，且不能超过 300 字。`);
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0,10) !== data.date) throw new Error(`${filename}: 发布日期无效。`);
  if (!match[2].trim()) throw new Error(`${filename}: 已发布文章的正文不能为空。`);
  if (data.tags != null && (!Array.isArray(data.tags) || data.tags.some(t => typeof t !== 'string'))) throw new Error(`${filename}: 标签必须是文字列表。`);
  for (const key of ['excerpt', 'cover', 'coverAlt']) if (data[key] != null && typeof data[key] !== 'string') throw new Error(`${filename}: ${key} 必须是文字。`);
  return {...data, title:data.title.trim(), tags:[...new Set((data.tags || []).map(t=>t.trim()).filter(Boolean))], body:match[2]};
}

function checkConfig(config) {
  if (!/^\/[a-zA-Z0-9/_-]*\/$/.test(config.basePath) || config.basePath.includes('//')) throw new Error('basePath 必须是以 / 开头和结尾的项目路径。');
  if (!/^https:\/\/[^/]+$/.test(config.origin)) throw new Error('origin 必须是 HTTPS 网站域名。');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !/^[\w.-]+$/.test(config.branch)) throw new Error('仓库或分支配置错误。');
}

export function renderBody(body, config, images) {
  const imagePath = raw => {
    if (!raw) return '';
    let url;
    try { url = new URL(raw, config.origin + config.basePath); } catch { throw new Error('图片地址无效。'); }
    if (url.protocol !== 'https:') throw new Error('图片必须使用本站地址或 HTTPS。');
    if (url.origin !== config.origin) return url.href;
    const prefix = config.basePath + 'media/';
    if (!url.pathname.startsWith(prefix)) throw new Error('本站图片必须保存在 media 文件夹。');
    const relative = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!relative || relative.split('/').some(x => !x || x === '.' || x === '..' || x.startsWith('.')) || /[\\\0]/.test(relative) || !imageTypes.has(path.extname(relative).toLowerCase())) throw new Error('图片路径或格式不受支持。');
    images.add(relative);
    return prefix + relative.split('/').map(encodeURIComponent).join('/');
  };
  const html = sanitizeHtml(marked.parse(body, {gfm:true, breaks:false}), {
    allowedTags: ['p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','u','blockquote','ul','ol','li','pre','code','a','img','table','thead','tbody','tr','th','td','sup','sub'],
    allowedAttributes: {a:['href','title','rel'],img:['src','alt','title','loading','decoding'],code:['class'],ol:['start'],th:['colspan','rowspan'],td:['colspan','rowspan']},
    allowedClasses: {code:['language-*']},
    allowedSchemes: ['https','http','mailto'],
    allowedSchemesByTag: {img:['https']},
    allowProtocolRelative:false,
    transformTags: {
      a: (tag, attrs) => ({tagName:tag, attribs:{...attrs, rel:'noopener noreferrer'}}),
      img: (tag, attrs) => ({tagName:tag, attribs:{...attrs, src:imagePath(attrs.src), alt:attrs.alt || '', loading:'lazy', decoding:'async'}}),
    },
  });
  return {html, imagePath};
}

function shell(config, {title, description, route, content, noindex=false}) {
  const base=config.basePath;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#000000">
<title>${escape(title)} · ${escape(config.name)}</title><meta name="description" content="${escape(description)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : `<link rel="canonical" href="${escape(config.origin+base+route)}">`}
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="${route.startsWith('blog/') && route !== 'blog/' ? 'article' : 'website'}"><meta property="og:url" content="${escape(config.origin+base+route)}">
<link rel="stylesheet" href="${base}styles.css"><link rel="stylesheet" href="${base}blog.css"></head>
<body><a class="skip" href="#main">跳到正文</a><div class="shell"><header><a class="brand" href="${base}">${escape(config.name)}</a><nav aria-label="主导航"><a href="${base}#about">关于</a><a href="${base}#work">作品</a><a href="${base}blog/"${route.startsWith('blog/') ? ' aria-current="page"' : ''}>Blog</a><a href="${base}#contact">联系 ↗</a></nav></header>
<main id="main">${content}</main><footer><span>© ${new Date().getFullYear()} ${escape(config.name)}</span><div class="footer-links"><a href="${base}admin/">文章管理</a><a href="${base}">返回主页 ↗</a></div></footer></div></body></html>`;
}
const dateLabel = date => date.replace(/-/g,'.');
const tagList = tags => tags.length ? `<ul class="post-tags" aria-label="文章标签">${tags.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>` : '';

async function checkedRead(root, relative) {
  const filename=path.join(root,relative);
  const actual=await realpath(filename);
  if (!actual.startsWith(await realpath(root)+path.sep) || (await lstat(filename)).isSymbolicLink()) throw new Error('拒绝读取仓库外的文件：'+relative);
  return readFile(filename);
}
function verifyImage(data, filename) {
  const ext=path.extname(filename).toLowerCase();
  const valid = (ext==='.png' && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (['.jpg','.jpeg'].includes(ext) && data[0]===255 && data[1]===216 && data[2]===255) ||
    (ext==='.gif' && /^GIF8[79]a/.test(data.subarray(0,6).toString())) ||
    (ext==='.webp' && data.subarray(0,4).toString()==='RIFF' && data.subarray(8,12).toString()==='WEBP') ||
    (ext==='.avif' && data.subarray(4,8).toString()==='ftyp' && /avif|avis/.test(data.subarray(8,32).toString()));
  if (!valid || data.length>10*1024*1024) throw new Error(`图片格式无效或超过 10 MB：${filename}`);
}

export async function build({root=process.cwd()}={}) {
  root=path.resolve(root);
  const config=JSON.parse(await readFile(path.join(root,'site.config.json'),'utf8'));
  checkConfig(config);
  const out=path.join(root,'_site');
  const stage=path.join(root,'_site.build');
  await rm(stage,{recursive:true,force:true}); await mkdir(stage,{recursive:true});
  const write=async (file,text)=>{await mkdir(path.dirname(path.join(stage,file)),{recursive:true});await writeFile(path.join(stage,file),text);};
  try {
    const images=new Set(); const posts=[];
    for (const filename of (await readdir(path.join(root,'content/posts'))).sort()) {
      if (!filename.endsWith('.md')) continue;
      const source=await checkedRead(root,'content/posts/'+filename);
      const post=parsePost(source.toString(),filename);
      if (!post) continue;
      const {html,imagePath}=renderBody(post.body,config,images);
      posts.push({...post,html,cover:post.cover ? imagePath(post.cover) : '',url:config.basePath+'blog/'+post.id+'/'});
    }
    posts.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
    const ids=new Set();
    for (const post of posts) { if(ids.has(post.id))throw new Error('文章 ID 重复。');ids.add(post.id); }
    for (const name of ['index.html','styles.css','profile.js','site.js','blog.css']) await write(name,await checkedRead(root,name));
    await write('.nojekyll','');
    const cards=posts.map(p=>`<article class="blog-row"><div class="post-meta"><time datetime="${p.date}">${dateLabel(p.date)}</time></div><div class="blog-row-copy"><h2><a href="${p.url}">${escape(p.title)}</a></h2>${p.excerpt ? `<p>${escape(p.excerpt)}</p>` : ''}${tagList(p.tags)}</div><span class="row-arrow" aria-hidden="true">↗</span></article>`).join('');
    await write('blog/index.html',shell(config,{title:'Blog',description:'Mr.Q 的文章、想法与记录。',route:'blog/',content:`<section class="blog-intro"><p class="eyebrow">NOTES & IDEAS</p><h1>Blog<span class="green-dot">.</span></h1><p class="intro">一些想法，一些记录。</p></section><section class="blog-list" aria-label="文章列表">${cards || '<div class="empty-state"><h2>下一篇故事，还在酝酿。</h2><p>文章发布后，会出现在这里。</p><a class="button" href="'+config.basePath+'">先逛逛主页 <span aria-hidden="true">↗</span></a></div>'}</section>`}));
    for (const p of posts) {
      const cover=p.cover ? `<figure class="post-cover"><img src="${escape(p.cover)}" alt="${escape(p.coverAlt || '')}" decoding="async"></figure>` : '';
      await write(`blog/${p.id}/index.html`,shell(config,{title:p.title,description:p.excerpt || config.description,route:`blog/${p.id}/`,content:`<article class="post"><a class="back-link" href="${config.basePath}blog/">← 所有文章</a><header class="post-header"><div class="post-meta"><time datetime="${p.date}">${dateLabel(p.date)}</time></div><h1>${escape(p.title)}</h1>${tagList(p.tags)}</header>${cover}<div class="prose">${p.html}</div><div class="post-end"><a class="button" href="${config.basePath}blog/">返回 Blog <span aria-hidden="true">↗</span></a></div></article>`}));
    }
    // Only images referenced by published posts enter the Pages artifact.
    for (const relative of images) {
      const data=await checkedRead(root,'media/'+relative);verifyImage(data,relative);
      await write('media/'+relative,data);
    }
    const cms=`https://app.pagescms.org/${config.repository}/${encodeURIComponent(config.branch)}/collection/posts`;
    await write('admin/index.html',shell(config,{title:'文章管理',description:'Mr.Q 的博客管理入口。',route:'admin/',noindex:true,content:`<section class="admin-intro"><p class="eyebrow">WRITING SPACE</p><h1>写下新的想法<span class="green-dot">。</span></h1><p class="intro">管理文章、保存草稿、上传图片。<br>发布后，网站会自动更新。</p><a class="login-button" href="${cms}" rel="noreferrer">使用 GitHub 登录管理后台 <span aria-hidden="true">↗</span></a><p class="login-note">使用 qian-lab-ust 账号，经 Pages CMS 安全登录。</p></section><section class="admin-help"><h2>从这里开始</h2><ol><li>进入「文章」，点击 New entry 新建文章。</li><li>填写标题和正文，可直接上传图片。</li><li>状态选「草稿」或「已发布」，点击 Save 保存。</li><li>发布、修改与删除通常几分钟后同步到 Blog。</li></ol><details><summary>第一次使用</summary><p>在 Pages CMS 中登录 GitHub，安装其 GitHub App 时选择 Only select repositories，仅勾选 personal-website。之后打开文章列表即可。请勿添加其他协作者，以保持仅本人管理。</p></details><details><summary>关于草稿</summary><p>草稿不会进入公开 Blog，但当前 GitHub 仓库公开，草稿源文件和上传图片仍可在仓库查看，请勿用于保存私密内容。</p></details><a class="text-link" href="${config.basePath}blog/">查看公开 Blog ↗</a></section>`}));
    await write('404.html',shell(config,{title:'页面未找到',description:'这个链接没有对应的页面。',route:'404.html',noindex:true,content:`<section class="blog-intro"><p class="eyebrow">404</p><h1>这页还没有故事。</h1><p class="intro">文章可能已删除，或链接有误。</p><a class="button" href="${config.basePath}blog/">返回 Blog ↗</a></section>`}));
    const urls=['', 'blog/', ...posts.map(p=>'blog/'+p.id+'/')];
    await write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>${escape(config.origin+config.basePath+u)}</loc></url>`).join('')+'</urlset>');
    await write('robots.txt',`User-agent: *\nDisallow: ${config.basePath}admin/\nSitemap: ${config.origin}${config.basePath}sitemap.xml\n`);
    // All validation finishes before replacing a prior successful local build.
    await rm(out,{recursive:true,force:true}); await rename(stage,out);
    return {posts:posts.length,images:images.size,out};
  } catch(error) {await rm(stage,{recursive:true,force:true});throw error;}
}

if (process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  build().then(r=>console.log(`Built ${r.posts} published posts and ${r.images} images → ${r.out}`)).catch(e=>{console.error(e.message);process.exitCode=1;});
}
