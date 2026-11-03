// "Đường dẫn /go": manage hoangpham.is-a.dev/go/<name> → hosting address in the go repo's links.json.
// Saved straight to my own repo through the GitHub API, nothing sent to is-a.dev. The token stays in this browser only.
(() => {
  const REPO = "hoangpham2263/go";
  const FILE = "links.json";
  const BASE = "https://hoangpham.is-a.dev/go/";
  const KEY = "domain-token";
  const NO_ACCESS = "Token chưa có quyền ghi repo go: chọn Only select repositories → go, quyền Contents: Read and write.";
  const MODES = { redirect: "Chuyển hướng", embed: "Nhúng (giữ địa chỉ)" };
  const $ = (id) => document.getElementById(id);
  // Rows being typed: new lines at the bottom, edited links in place
  let links = {}, sha = null, saved = "", drafts = [], busy = false;
  try { saved = localStorage.getItem(KEY) || ""; } catch {}

  const token = () => saved;
  function setToken(value) {
    saved = value;
    try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch {}
    if (!value) drafts = [];
    drawActions();
    draw();
  }
  const say = (el, t, cls = "") => { el.className = `status small ${cls}`; el.textContent = t; el.hidden = !t; };
  const status = (t, cls) => say($("goStatus"), t, cls);
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const unb64 = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  async function gh(path, opts = {}, auth = token()) {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opts, headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}), Accept: "application/vnd.github+json", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Token sai hoặc hết hạn.");
    if (res.status === 403 && opts.method) throw new Error(NO_ACCESS);
    if (!res.ok) throw new Error(data.message || `GitHub lỗi ${res.status}`);
    return data;
  }

  async function load() {
    try {
      const f = await gh(`/contents/${FILE}?t=${Date.now()}`);
      sha = f.sha;
      links = JSON.parse(unb64(f.content) || "{}");
    } catch {
      // Without a token (or before the repo exists) fall back to the public copy
      try { links = await (await fetch(`${BASE}links.json?t=${Date.now()}`)).json(); } catch { links = {}; }
    }
    draw();
  }

  // Throws on failure so each caller shows the error where the user is looking
  async function save(next, msg) {
    busy = true;
    draw();
    try {
      // Fresh sha so two tabs never overwrite each other
      try { sha = (await gh(`/contents/${FILE}`)).sha; } catch { sha = null; }
      const r = await gh(`/contents/${FILE}`, { method: "PUT", body: JSON.stringify({
        message: msg, content: b64(JSON.stringify(next, null, 2) + "\n"), ...(sha ? { sha } : {}) }) });
      sha = r.content.sha;
      links = next;
    } finally { busy = false; }
  }

  async function commit(d) {
    if (busy) return;
    const fail = (t) => { d.error = t; draw(); d.focusEl?.focus(); };
    const name = d.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    let url = d.url.trim();
    if (!name) return fail("Nhập tên đường dẫn (vd: app).");
    if (d.isNew && links[name]) return fail(`Đã có /go/${name}, bấm Sửa ở hàng đó để đổi.`);
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(url)) url = `http://${url}`; // bare IP → http://IP
    if (!/^https?:\/\/\S+$/.test(url)) return fail("Địa chỉ phải bắt đầu bằng http:// hoặc https://");
    const note = d.mode === "embed" && url.startsWith("http://") ? " · Lưu ý: nhúng cần địa chỉ https, trang http sẽ bị trình duyệt chặn." : "";
    const msg = `${d.isNew ? "Thêm" : "Sửa"} /go/${name}`;
    d.error = "";
    status("Đang lưu…");
    try {
      await save({ ...links, [name]: { url, mode: d.mode } }, msg);
      drafts = drafts.filter((x) => x !== d);
      status(`✓ ${msg} · chạy sau khoảng 1 phút${note}`, "ok");
      draw();
    } catch (err) { status(""); fail(err.message); }
  }

  async function remove(name) {
    if (busy || !confirm(`Xóa /go/${name}?`)) return;
    const next = { ...links };
    delete next[name];
    const msg = `Xóa /go/${name}`;
    status("Đang lưu…");
    try {
      await save(next, msg);
      status(`✓ ${msg} · chạy sau khoảng 1 phút`, "ok");
    } catch (err) { status(err.message, "err"); }
    draw();
  }

  $("addOpen").onclick = () => {
    const d = { name: "", url: "", mode: "redirect", isNew: true, error: "" };
    drafts.push(d);
    draw();
    d.focusEl.focus();
  };

  $("tokenOpen").onclick = () => {
    $("tokenInput").value = "";
    $("tokenInput").placeholder = token() ? "Đã lưu · dán token mới để thay" : "github_pat_…";
    $("tokenRemove").hidden = !token();
    say($("tokenStatus"), "");
    $("tokenDialog").showModal();
    $("tokenInput").focus();
  };
  $("tokenForm").onsubmit = async (e) => {
    e.preventDefault();
    const value = $("tokenInput").value.trim();
    if (!value) return say($("tokenStatus"), "Dán token vào ô trên.", "err");
    $("tokenSave").disabled = true;
    say($("tokenStatus"), "Đang kiểm tra…");
    try {
      const repo = await gh("", {}, value);
      if (repo.permissions && repo.permissions.push === false) throw new Error(NO_ACCESS);
      setToken(value);
      $("tokenDialog").close();
      status("✓ Đã kết nối GitHub", "ok");
      load();
    } catch (err) { say($("tokenStatus"), err.message, "err"); }
    finally { $("tokenSave").disabled = false; }
  };
  $("tokenRemove").onclick = () => {
    setToken("");
    $("tokenDialog").close();
    status("Đã ngắt kết nối, token đã xoá khỏi trình duyệt này.");
  };

  // Cancel button and clicks on the dimmed backdrop close the popup
  const dialog = $("tokenDialog");
  dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.hasAttribute("data-close")) dialog.close(); });

  // Visitors only see the list; the editing buttons appear once a token is set
  function drawActions() {
    $("addOpen").hidden = !token();
    $("tokenOpen").textContent = token() ? "Token GitHub" : "Kết nối GitHub";
  }

  function draftRows(d) {
    const name = el("input", { value: d.name, placeholder: "app", readOnly: !d.isNew, ariaLabel: "Tên đường dẫn", oninput: () => { d.name = name.value; } });
    const url = el("input", { value: d.url, placeholder: "https://… hoặc http://IP", inputMode: "url", ariaLabel: "Địa chỉ hosting", oninput: () => { d.url = url.value; } });
    const mode = el("select", { ariaLabel: "Kiểu", onchange: () => { d.mode = mode.value; } },
      ...Object.entries(MODES).map(([value, textContent]) => el("option", { value, textContent })));
    mode.value = d.mode;
    d.focusEl = d.isNew ? name : url;
    const cancel = () => { drafts = drafts.filter((x) => x !== d); draw(); };
    const row = el("tr", { className: "draft", onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(d); }
      if (e.key === "Escape") cancel();
    } },
      el("td", {}, el("div", { className: "search-box" }, el("span", { className: "suffix", textContent: "/go/" }), name)),
      el("td", {}, url),
      el("td", {}, mode),
      el("td", {}, el("div", { className: "actions" },
        el("button", { type: "button", className: "primary", textContent: "Lưu", disabled: busy, onclick: () => commit(d) }),
        el("button", { type: "button", textContent: "Huỷ", disabled: busy, onclick: cancel }))));
    if (!d.error) return [row];
    return [row, el("tr", { className: "row-error" }, el("td", { colSpan: 4 }, el("p", { className: "status small err", textContent: d.error })))];
  }

  function linkRow(name) {
    const x = links[name];
    const row = el("tr", {},
      el("td", {}, el("a", { href: BASE + name, target: "_blank", rel: "noopener", textContent: `/go/${name}` })),
      el("td", { className: "addr", textContent: x.url }),
      el("td", { className: "muted", textContent: x.mode === "embed" ? "Nhúng" : "Chuyển hướng" }));
    if (token()) {
      row.append(el("td", {}, el("div", { className: "actions" },
        el("button", { type: "button", textContent: "Sửa", disabled: busy, onclick: () => {
          const d = { name, url: x.url, mode: x.mode || "redirect", isNew: false, error: "" };
          drafts.push(d);
          draw();
          d.focusEl.focus();
        } }),
        el("button", { type: "button", textContent: "Xóa", disabled: busy, onclick: () => remove(name) }))));
    }
    return row;
  }

  function draw() {
    $("actHead").hidden = !token();
    const names = Object.keys(links).sort();
    const rows = names.flatMap((name) => {
      const d = drafts.find((x) => !x.isNew && x.name === name);
      return d ? draftRows(d) : [linkRow(name)];
    });
    rows.push(...drafts.filter((d) => d.isNew).flatMap(draftRows));
    if (!rows.length) rows.push(el("tr", { className: "empty" }, el("td", { colSpan: 4, className: "muted small", textContent: "Chưa có đường dẫn nào." })));
    $("goList").replaceChildren(...rows);
  }

  drawActions();
  load();
})();
