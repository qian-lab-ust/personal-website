(() => {
  const p = window.PROFILE || {};
  const name = p.name || "你的名字";
  document.querySelectorAll("[data-name]").forEach(el => { el.textContent = name; });
  document.title = `${name} · 个人主页`;
  if (p.tagline) {
    document.querySelector("#tagline").textContent = p.tagline;
    document.querySelector('meta[name="description"]').content = p.tagline.replace(/\n/g, " ");
  }
  if (p.about) document.querySelector("#about-text").textContent = p.about;
  if (Array.isArray(p.interests)) document.querySelector("#interests").replaceChildren(...p.interests.map(text => {
    const el = document.createElement("span"); el.textContent = text; return el;
  }));
  document.querySelector("#demo-note").hidden = p.showDraftNote === false;
  document.querySelector("#year").textContent = new Date().getFullYear();
  const links = document.querySelector("#contact-links");
  function addLink(label, url) {
    if (links.querySelector(".contact-pending")) links.replaceChildren();
    const el = document.createElement("a"); el.textContent = label + " ↗"; el.href = url; links.append(el);
  }
  if (p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) addLink("给我写信", "mailto:" + p.email);
  if (p.githubUsername && /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(p.githubUsername)) addLink("GitHub", "https://github.com/" + p.githubUsername);
  if (Array.isArray(p.projects) && p.projects.length) {
    const container = document.querySelector("#projects");
    const templates = Array.from(container.children);
    container.replaceChildren(...p.projects.map((project, i) => {
      const card = templates[i % templates.length].cloneNode(true);
      card.querySelector(".sample-label").remove();
      card.querySelector("h3").textContent = project.title || "未命名作品";
      card.querySelector("p").textContent = project.description || "";
      card.querySelector(".project-meta").replaceChildren();
      card.querySelector(".project-meta").textContent = String(i + 1).padStart(2, "0");
      try {
        const url = new URL(project.url);
        if (["https:", "http:"].includes(url.protocol)) {
          const link = document.createElement("a"); link.className = "project-link"; link.href = url.href;
          link.textContent = "查看作品 ↗"; link.setAttribute("aria-label", `查看作品：${project.title || "未命名作品"}`); card.append(link);
        }
      } catch { /* 未设置链接时仅展示作品介绍。 */ }
      return card;
    }));
  }
})();
