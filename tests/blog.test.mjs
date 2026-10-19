import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,copyFile,access,symlink,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import {build,parsePost,renderBody} from '../scripts/build.mjs';
const project=path.resolve(import.meta.dirname,'..');
const id='11111111-1111-4111-8111-111111111111';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const config=JSON.parse(await readFile(path.join(project,'site.config.json'),'utf8'));
const exists=p=>access(p).then(()=>true,()=>false);
const post=(status='draft',body='正文',extra={})=>'---\n'+YAML.stringify({id,title:'一篇文章',status,date:'2026-10-19',tags:['生活','思考'],...extra})+'---\n'+body+'\n';
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'mr-q-blog-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['content/posts','media'])await mkdir(path.join(root,dir),{recursive:true});
  for(const file of ['index.html','styles.css','profile.js','site.js','blog.css','site.config.json'])await copyFile(path.join(project,file),path.join(root,file));
  return root;
}

test('create → save draft → publish with image → edit → unpublish → republish → delete persists correctly',async t=>{
  const root=await fixture(t),file=path.join(root,'content/posts',id+'.md'),article=path.join(root,'_site/blog',id,'index.html');
  const text=post('draft','草稿正文');await writeFile(file,text);await build({root});
  assert.equal(await readFile(file,'utf8'),text);assert.equal(await exists(article),false);
  assert.doesNotMatch(await readFile(path.join(root,'_site/blog/index.html'),'utf8'),/草稿正文|一篇文章/);
  await writeFile(path.join(root,'media/photo.png'),png);
  await writeFile(file,post('published','# 内容标题\n\n**第一版**\n\n![测试图片](/personal-website/media/photo.png)',{cover:'/personal-website/media/photo.png',coverAlt:'封面说明'}));
  await build({root});let html=await readFile(article,'utf8');
  assert.match(html,/<strong>第一版<\/strong>/);assert.match(html,/2026\.10\.19/);assert.match(html,/生活/);assert.match(html,/alt="测试图片"/);
  assert.deepEqual(await readFile(path.join(root,'_site/media/photo.png')),png);
  assert.match(await readFile(path.join(root,'_site/blog/index.html'),'utf8'),new RegExp(id));
  await writeFile(file,post('published','第二版：修改保存。',{title:'改了标题仍是同一网址'}));await build({root});
  html=await readFile(article,'utf8');assert.match(html,/第二版/);assert.doesNotMatch(html,/第一版/);assert.match(html,/改了标题仍是同一网址/);
  assert.equal(await exists(path.join(root,'_site/media/photo.png')),false);
  await writeFile(file,post('draft','已撤下'));await build({root});assert.equal(await exists(article),false);
  await writeFile(file,post('published','再次发布'));await build({root});assert.equal(await exists(article),true);
  await rm(file);await build({root});assert.equal(await exists(article),false);
  assert.doesNotMatch(await readFile(path.join(root,'_site/sitemap.xml'),'utf8'),new RegExp(id));
  assert.equal(await exists(path.join(root,'media/photo.png')),true,'删除文章不销毁原始图片');
});

test('draft-only images, content sources, configuration, environment and scripts never enter published artifact',async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'content/posts',id+'.md'),post('draft','![图](/personal-website/media/draft.png)'));
  await writeFile(path.join(root,'media/draft.png'),png);await writeFile(path.join(root,'.env'),'secret=fixture');
  await build({root});
  for(const name of ['content','media','.env','.pages.yml','site.config.json','package.json','scripts','tests','.git'])assert.equal(await exists(path.join(root,'_site',name)),false,name);
});

test('invalid publication fails without replacing previous successful website',async t=>{
  const root=await fixture(t);const file=path.join(root,'content/posts',id+'.md');
  await writeFile(file,post('published','上次成功的内容'));await build({root});
  const article=path.join(root,'_site/blog',id,'index.html'),before=await readFile(article,'utf8');
  await writeFile(file,post('published','',{date:'2026-02-31'}));await assert.rejects(build({root}),/日期/);
  assert.equal(await readFile(article,'utf8'),before);
  await writeFile(file,post('published',''));await assert.rejects(build({root}),/正文/);
});

test('status defaults fail closed, while published articles require stable IDs and valid metadata',()=>{
  assert.equal(parsePost(post(undefined,'draft',{status:undefined}),id+'.md'),null);
  assert.equal(parsePost(post('unknown'),id+'.md'),null);
  assert.throws(()=>parsePost(post('published','body',{id:'../../escape'}),id+'.md'),/ID/);
  assert.throws(()=>parsePost(post('published'),'different.md'),/文件名/);
  assert.throws(()=>parsePost(post('published','body',{tags:'tag'}),id+'.md'),/标签/);
});

test('script, handlers, javascript links and unsafe HTML are not rendered',()=>{
  const {html}=renderBody('<script>alert(1)</script>\n\n<a href="javascript:alert(2)" onclick="alert(3)">测试</a>\n\n<iframe src="https://example.com"></iframe>\n\n**安全文字**',config,new Set());
  assert.doesNotMatch(html,/<script|onclick|javascript:|<iframe/);assert.match(html,/<strong>安全文字<\/strong>/);
  assert.throws(()=>renderBody('![图](data:image/png;base64,abc)',config,new Set()),/HTTPS/);
});

test('image traversal, missing files, symlinks and fake image files are rejected',async t=>{
  const root=await fixture(t),file=path.join(root,'content/posts',id+'.md');
  assert.throws(()=>renderBody('![图](/personal-website/media/%2e%2e%2Fsecret.png)',config,new Set()),/路径/);
  await writeFile(file,post('published','![图](/personal-website/media/missing.png)'));await assert.rejects(build({root}));
  await writeFile(path.join(root,'media/fake.png'),'<script>no</script>');await writeFile(file,post('published','![图](/personal-website/media/fake.png)'));await assert.rejects(build({root}),/图片格式/);
  await symlink(path.join(root,'index.html'),path.join(root,'media/link.png'));
  await writeFile(file,post('published','![图](/personal-website/media/link.png)'));await assert.rejects(build({root}),/拒绝/);
});

test('HTML in titles and tags is escaped and all URLs retain the GitHub Pages project prefix',async t=>{
  const root=await fixture(t);await writeFile(path.join(root,'content/posts',id+'.md'),post('published','正常正文',{title:'<img src=x onerror=alert(1)>',tags:['<script>bad</script>']}));await build({root});
  const html=await readFile(path.join(root,'_site/blog',id,'index.html'),'utf8');
  assert.doesNotMatch(html,/<img src=x|<script>/);assert.match(html,/&lt;img/);
  for(const name of ['styles.css','blog.css'])assert.ok(html.includes('href="/personal-website/'+name+'"'));
  assert.ok(html.includes('https://qian-lab-ust.github.io/personal-website/blog/'+id+'/'));
});

test('home layout, Q stroke and original profile behavior are retained; admin delegates authentication',async t=>{
  const root=await fixture(t);await build({root});
  assert.equal(await readFile(path.join(root,'_site/index.html'),'utf8'),await readFile(path.join(project,'index.html'),'utf8'));
  assert.match(await readFile(path.join(root,'_site/index.html'),'utf8'),/stroke-width="16"/);
  assert.deepEqual(await readFile(path.join(root,'_site/site.js')),await readFile(path.join(project,'site.js')));
  const admin=await readFile(path.join(root,'_site/admin/index.html'),'utf8');
  assert.match(admin,/https:\/\/app.pagescms.org\/qian-lab-ust\/personal-website\/main\/collection\/posts/);
  assert.match(admin,/noindex,nofollow/);assert.doesNotMatch(admin,/localStorage|oauth_token|github_pat_/);
});

test('CMS defaults and permissions enable real CRUD, safe draft defaults, media and stable URLs',async()=>{
  const cms=YAML.parse(await readFile(path.join(project,'.pages.yml'),'utf8'));
  const c=cms.content[0];assert.equal(c.path,'content/posts');assert.equal(c.filename.template,'{fields.id}.md');assert.equal(c.operations.delete,true);assert.equal(c.operations.create,true);assert.equal(c.operations.rename,false);
  const field=n=>c.fields.find(f=>f.name===n);
  assert.equal(field('status').default,'draft');assert.equal(field('body').type,'rich-text');assert.equal(field('body').options.format,'markdown');assert.equal(field('id').type,'uuid');assert.equal(field('id').hidden,true);
  assert.equal(cms.media[0].input,'media');assert.equal(cms.media[0].output,'/personal-website/media');assert.ok(!cms.media[0].extensions.includes('svg'));
});
