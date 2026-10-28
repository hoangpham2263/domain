// "Đường dẫn /go": manage hoangpham.is-a.dev/go/<name> → hosting address in the go repo's links.json.
// Saved straight to my own repo through the GitHub API (same token as the pull requests), nothing sent to is-a.dev.
(() => {
  const REPO = "hoangpham2263/go";
  const FILE = "links.json";
  const BASE = "https://hoangpham.is-a.dev/go/";
  const $ = (id) => document.getElementById(id);
  let links = {}, sha = null;

  const token = () => (document.querySelector('#form [name="token"]')?.value || localStorage.getItem("domain-token") || "").trim();
  const status = (t, cls = "") => { $("goStatus").className = `status small ${cls}`; $("goStatus").innerHTML = t; };
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const unb64 = (t) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  async function gh(path, opts = {}) {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { ...opts, headers: {
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}), Accept: "application/vnd.github+json", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Token sai hoặc hết hạn.");
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

  async function save(next, msg) {
    if (!token()) {
      const d = document.querySelector("#form details.more");
      if (d) d.open = true;
      return status("Dán GitHub token trước (mục Tài khoản GitHub).", "err");
    }
    $("goSave").disabled = true;
    status("Đang lưu…");
    try {
      // Fresh sha so two tabs never overwrite each other
      try { sha = (await gh(`/contents/${FILE}`)).sha; } catch { sha = null; }
      const r = await gh(`/contents/${FILE}`, { method: "PUT", body: JSON.stringify({
        message: msg, content: b64(JSON.stringify(next, null, 2) + "\n"), ...(sha ? { sha } : {}) }) });
      sha = r.content.sha;
      links = next;
      draw();
      status(`✓ ${msg} · chạy sau khoảng 1 phút`, "ok");
    } catch (err) { status(err.message, "err"); }
    finally { $("goSave").disabled = false; }
  }

  $("goSave").onclick = () => {
    const name = $("goName").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    let url = $("goUrl").value.trim();
    if (!name) return status("Nhập tên đường dẫn (vd: app).", "err");
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(url)) url = `http://${url}`; // bare IP → http://IP
    if (!/^https?:\/\/\S+$/.test(url)) return status("Địa chỉ phải bắt đầu bằng http:// hoặc https://", "err");
    const mode = $("goMode").value;
    if (mode === "embed" && url.startsWith("http://")) status("Lưu ý: nhúng cần địa chỉ https, trang http sẽ bị trình duyệt chặn.", "err");
    save({ ...links, [name]: { url, mode } }, `${links[name] ? "Sửa" : "Thêm"} /go/${name}`);
  };

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
      const edit = Object.assign(document.createElement("button"), { type: "button", textContent: "Sửa" });
      edit.onclick = () => { $("goName").value = name; $("goUrl").value = x.url; $("goMode").value = x.mode || "redirect"; $("goUrl").focus(); };
      const del = Object.assign(document.createElement("button"), { type: "button", textContent: "Xóa" });
      del.onclick = () => {
        if (!confirm(`Xóa /go/${name}?`)) return;
        const next = { ...links };
        delete next[name];
        save(next, `Xóa /go/${name}`);
      };
      row.append(info, edit, del);
      return row;
    }));
  }

  load();
})();
