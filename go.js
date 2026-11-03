// "Đường dẫn /go": manage hoangpham.is-a.dev/go/<name> → hosting address in the go repo's links.json.
// Saved straight to my own repo through the GitHub API, nothing sent to is-a.dev. The token stays in this browser only.
(() => {
  const REPO = "hoangpham2263/go";
  const FILE = "links.json";
  const BASE = "https://hoangpham.is-a.dev/go/";
  const KEY = "domain-token";
  const NO_ACCESS = "Token chưa có quyền ghi repo go: chọn Only select repositories → go, quyền Contents: Read and write.";
  const $ = (id) => document.getElementById(id);
  let links = {}, sha = null, saved = "";
  try { saved = localStorage.getItem(KEY) || ""; } catch {}

  const token = () => saved;
  function setToken(value) {
    saved = value;
    try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch {}
    drawActions();
    draw();
  }
  const say = (el, t, cls = "") => { el.className = `status small ${cls}`; el.textContent = t; el.hidden = !t; };
  const status = (t, cls) => say($("goStatus"), t, cls);
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const unb64 = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
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

  async function save(next, msg, note = "") {
    const inDialog = $("addDialog").open;
    const report = inDialog ? (t, cls) => say($("addStatus"), t, cls) : status;
    $("goSave").disabled = true;
    report("Đang lưu…");
    try {
      // Fresh sha so two tabs never overwrite each other
      try { sha = (await gh(`/contents/${FILE}`)).sha; } catch { sha = null; }
      const r = await gh(`/contents/${FILE}`, { method: "PUT", body: JSON.stringify({
        message: msg, content: b64(JSON.stringify(next, null, 2) + "\n"), ...(sha ? { sha } : {}) }) });
      sha = r.content.sha;
      links = next;
      draw();
      if (inDialog) $("addDialog").close();
      status(`✓ ${msg} · chạy sau khoảng 1 phút${note}`, "ok");
    } catch (err) { report(err.message, "err"); }
    finally { $("goSave").disabled = false; }
  }

  function openAdd(name = "", x = {}) {
    $("addTitle").textContent = name ? "Sửa đường dẫn" : "Thêm đường dẫn";
    $("goName").value = name;
    $("goName").readOnly = !!name;
    $("goUrl").value = x.url || "";
    $("goMode").value = x.mode || "redirect";
    say($("addStatus"), "");
    $("addDialog").showModal();
    (name ? $("goUrl") : $("goName")).focus();
  }

  $("addOpen").onclick = () => openAdd();
  $("addForm").onsubmit = (e) => {
    e.preventDefault();
    const fail = (t) => say($("addStatus"), t, "err");
    const name = $("goName").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    let url = $("goUrl").value.trim();
    if (!name) return fail("Nhập tên đường dẫn (vd: app).");
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(url)) url = `http://${url}`; // bare IP → http://IP
    if (!/^https?:\/\/\S+$/.test(url)) return fail("Địa chỉ phải bắt đầu bằng http:// hoặc https://");
    const mode = $("goMode").value;
    const note = mode === "embed" && url.startsWith("http://") ? " · Lưu ý: nhúng cần địa chỉ https, trang http sẽ bị trình duyệt chặn." : "";
    save({ ...links, [name]: { url, mode } }, `${links[name] ? "Sửa" : "Thêm"} /go/${name}`, note);
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

  // Cancel buttons and clicks on the dimmed backdrop close the popups
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.hasAttribute("data-close")) d.close(); });
  });

  // Visitors only see the list; the editing buttons appear once a token is set
  function drawActions() {
    $("addOpen").hidden = !token();
    $("tokenOpen").textContent = token() ? "Token GitHub" : "Kết nối GitHub";
  }

  function draw() {
    const names = Object.keys(links).sort();
    if (!names.length) {
      return $("goList").replaceChildren(Object.assign(document.createElement("p"), { className: "muted small", textContent: "Chưa có đường dẫn nào." }));
    }
    $("goList").replaceChildren(...names.map((name) => {
      const x = links[name];
      const row = document.createElement("div");
      row.className = "saved-row";
      const info = document.createElement("span");
      info.className = "saved-name";
      info.append(Object.assign(document.createElement("a"), { href: BASE + name, target: "_blank", rel: "noopener", textContent: `/go/${name}` }),
        Object.assign(document.createElement("small"), { textContent: `${x.mode === "embed" ? "Nhúng" : "Chuyển hướng"} → ${x.url}` }));
      row.append(info);
      if (!token()) return row;
      const edit = Object.assign(document.createElement("button"), { type: "button", textContent: "Sửa" });
      edit.onclick = () => openAdd(name, x);
      const del = Object.assign(document.createElement("button"), { type: "button", textContent: "Xóa" });
      del.onclick = () => {
        if (!confirm(`Xóa /go/${name}?`)) return;
        const next = { ...links };
        delete next[name];
        save(next, `Xóa /go/${name}`);
      };
      row.append(edit, del);
      return row;
    }));
  }

  drawActions();
  load();
})();
