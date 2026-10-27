// Domain helper: build the is-a.dev registration file for a subdomain, open it on GitHub,
// check where the name points (DNS over HTTPS) and keep a list of the names made here.
(() => {
  const ROOT = "hoangpham.is-a.dev";
  const REPO = "https://github.com/is-a-dev/register";
  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem("domain-saved") || "[]"); } catch { return []; } },
    set: (v) => { try { localStorage.setItem("domain-saved", JSON.stringify(v)); } catch {} },
  };

  let toastTimer;
  function toast(text) {
    let el = document.querySelector(".toast");
    if (!el) { el = Object.assign(document.createElement("div"), { className: "toast", role: "status" }); document.body.append(el); }
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }

  const isIPv4 = (v) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v);
  const isIPv6 = (v) => /^[0-9a-f:]+$/i.test(v) && v.includes(":");
  const isHost = (v) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v);

  // ---------- DNS records table ----------
  const TYPES = {
    A: { hint: "IP hosting, vd 103.97.125.20", ok: isIPv4 },
    AAAA: { hint: "IPv6, vd 2001:db8::1", ok: isIPv6 },
    CNAME: { hint: "Tên host, vd host.example.com", ok: isHost, single: true },
    URL: { hint: "Chuyển hướng tới https://…", ok: (v) => /^https?:\/\/\S+$/.test(v), single: true },
    TXT: { hint: "Nội dung TXT (xác minh…)", ok: (v) => v.length > 0 },
    MX: { hint: "Máy chủ mail, vd mx.example.com", ok: isHost },
  };
  let recs = [{ type: "A", value: "" }];
  function drawRecs() {
    $("recs").replaceChildren(...recs.map((rec, i) => {
      const type = Object.assign(document.createElement("select"), { ariaLabel: "Loại" });
      type.append(...Object.keys(TYPES).map((t) => Object.assign(document.createElement("option"), { value: t, textContent: t })));
      type.value = rec.type;
      const value = Object.assign(document.createElement("input"), { value: rec.value, placeholder: TYPES[rec.type].hint, ariaLabel: "Giá trị" });
      const del = Object.assign(document.createElement("button"), { type: "button", className: "icon", textContent: "✕", title: "Xóa bản ghi", disabled: recs.length === 1 });
      type.onchange = () => { rec.type = type.value; drawRecs(); render(); };
      value.oninput = () => { rec.value = value.value; render(); };
      del.onclick = () => { recs.splice(i, 1); drawRecs(); render(); };
      const row = document.createElement("div");
      row.className = "rec";
      row.append(type, value, del);
      return row;
    }));
  }
  $("addRec").onclick = () => { recs.push({ type: "A", value: "" }); drawRecs(); $("recs").lastChild.querySelector("input").focus(); };

  // Current form → { name, file, json, error, rows, type, values }
  function read() {
    const sub = form.sub.value.trim().toLowerCase().replace(/\.hoangpham\.is-a\.dev$/, "").replace(/[^a-z0-9.-]/g, "");
    const rows = recs.map((r) => ({ type: r.type, value: r.value.trim().replace(/\.$/, "") })).filter((r) => r.value);
    let error = "";
    const bad = rows.find((r) => !TYPES[r.type].ok(r.value));
    const single = rows.find((r) => TYPES[r.type].single);
    if (!sub) error = "Nhập tên miền (vd: demo).";
    else if (!rows.length) error = "Thêm ít nhất một bản ghi.";
    else if (bad) error = `${bad.type} "${bad.value}" không hợp lệ (${TYPES[bad.type].hint}).`;
    else if (single && rows.length > 1) error = `${single.type} phải đứng một mình, không đi kèm bản ghi khác.`;
    const records = {};
    for (const r of rows) {
      if (TYPES[r.type].single) records[r.type] = r.value;
      else (records[r.type] ||= []).push(r.value);
    }
    const name = `${sub}.${ROOT}`;
    const data = { owner: { username: form.user.value.trim(), email: form.email.value.trim() }, records };
    const first = rows[0] || { type: "A" };
    return { sub, name, rows, type: first.type, values: rows.filter((r) => r.type === first.type).map((r) => r.value),
      file: `domains/${sub}.hoangpham.json`, json: JSON.stringify(data, null, 2) + "\n", error };
  }

  function render() {
    const r = read();
    $("err").hidden = !r.error || !form.sub.value;
    $("err").textContent = r.error;
    const ok = !r.error;
    $("openPR").classList.toggle("disabled", !ok);
    // GitHub's "new file" page with name and content filled in (it offers to fork for the PR)
    $("openPR").href = ok ? `${REPO}/new/main?filename=${encodeURIComponent(r.file)}&value=${encodeURIComponent(r.json)}` : "#";
  }

  // ---------- availability: is the name already registered on is-a.dev? ----------
  async function lookupName() {
    const r = read();
    if (!r.sub) return form.sub.focus();
    const box = $("avail");
    box.hidden = false;
    box.className = "avail";
    box.textContent = `Đang kiểm tra ${r.name}…`;
    try {
      const res = await fetch(`https://raw.githubusercontent.com/is-a-dev/register/main/${r.file}?t=${Date.now()}`);
      if (res.status === 404) {
        box.className = "avail free";
        box.innerHTML = `<strong>✓ ${r.name}</strong><span>Còn trống · thêm bản ghi bên dưới rồi gửi Pull Request</span>`;
        return;
      }
      const cur = await res.json();
      const mine = (cur.owner?.username || "").toLowerCase() === form.user.value.trim().toLowerCase();
      // Load its records into the table so they can be edited
      recs = Object.entries(cur.records || {}).flatMap(([t, v]) => [].concat(v).map((x) => ({ type: TYPES[t] ? t : "TXT", value: String(x) })));
      if (!recs.length) recs = [{ type: "A", value: "" }];
      drawRecs();
      render();
      box.className = `avail ${mine ? "mine" : "taken"}`;
      box.innerHTML = mine ? `<strong>${r.name}</strong><span>Đã đăng ký (của bạn) · sửa bản ghi rồi gửi Pull Request để cập nhật</span>`
        : `<strong>${r.name}</strong><span>Đã có người dùng (${cur.owner?.username || "?"})</span>`;
    } catch { box.className = "avail taken"; box.textContent = "Không kiểm tra được, thử lại sau."; }
  }
  $("lookup").onclick = lookupName;
  form.sub.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lookupName(); } });
  // A different name: the last check no longer applies
  form.sub.addEventListener("input", () => { $("avail").hidden = true; });

  form.addEventListener("input", render);

  $("openPR").addEventListener("click", (e) => {
    const r = read();
    if (r.error) { e.preventDefault(); return toast(r.error); }
    const saved = store.get().filter((x) => x.name !== r.name);
    store.set([{ name: r.name, type: r.type, values: r.values, rows: r.rows, at: Date.now() }, ...saved]);
    renderSaved();
  });

  // ---------- one-click pull request (GitHub API, token kept only in this browser) ----------
  const UP = "is-a-dev/register";
  form.token.value = localStorage.getItem("domain-token") || "";
  form.token.addEventListener("change", () => { try { localStorage.setItem("domain-token", form.token.value.trim()); } catch {} });
  const status = (html, cls = "") => { $("prStatus").className = `status small ${cls}`; $("prStatus").innerHTML = html; };
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // Fork → sync fork → branch → write (or delete) the file → open the PR on is-a-dev/register
  async function pullRequest(r, remove = false) {
    const token = form.token.value.trim();
    if (!token) { form.closest("section").querySelector("details").open = true; form.token.focus(); throw new Error("Dán GitHub token trước (mục Tài khoản GitHub)."); }
    const gh = async (path, opts = {}) => {
      const res = await fetch(`https://api.github.com${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
      if (res.status === 401) throw new Error("Token sai hoặc hết hạn.");
      const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.message || `GitHub lỗi ${res.status}`), { status: res.status });
      return data;
    };
    status("Đang kiểm tra tài khoản…");
    const me = (await gh("/user")).login;
    status("Đang fork is-a-dev/register…");
    await gh(`/repos/${UP}/forks`, { method: "POST", body: "{}" });
    const fork = `${me}/register`;
    for (let i = 0; i < 20; i++) { try { await gh(`/repos/${fork}`); break; } catch { await wait(1500); } }
    status("Đang đồng bộ bản fork…");
    await gh(`/repos/${fork}/merge-upstream`, { method: "POST", body: JSON.stringify({ branch: "main" }) }).catch(() => {});
    const base = (await gh(`/repos/${fork}/git/ref/heads/main`)).object.sha;
    const branch = `${r.sub}-${Date.now().toString(36)}`;
    await gh(`/repos/${fork}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base }) });
    // Existing file on the branch → update / delete needs its sha
    let sha = null;
    try { sha = (await gh(`/repos/${fork}/contents/${r.file}?ref=${branch}`)).sha; } catch {}
    if (remove && !sha) throw new Error(`${r.name} chưa có trên is-a.dev nên không cần gỡ.`);
    status("Đang tạo file…");
    const verb = remove ? "Remove" : sha ? "Update" : "Register";
    await gh(`/repos/${fork}/contents/${r.file}`, {
      method: remove ? "DELETE" : "PUT",
      body: JSON.stringify({ message: `${verb} ${r.name}`, branch, ...(sha ? { sha } : {}), ...(remove ? {} : { content: b64(r.json) }) }),
    });
    status("Đang mở Pull Request…");
    const pr = await gh(`/repos/${UP}/pulls`, { method: "POST", body: JSON.stringify({
      title: `${verb} ${r.name}`, head: `${me}:${branch}`, base: "main",
      body: remove ? `Remove ${r.name}.` : `${verb} ${r.name} → ${r.rows.map((x) => `${x.type} ${x.value}`).join(", ")}.\n\nPersonal developer use (hosting for my projects).`,
    }) });
    return pr.html_url;
  }
  async function send(r, remove = false) {
    $("sendPR").disabled = true;
    try {
      const url = await pullRequest(r, remove);
      status(`✓ Đã gửi Pull Request: <a href="${url}" target="_blank" rel="noopener">${url.replace("https://github.com/", "")}</a> · chờ is-a.dev duyệt`, "ok");
      const saved = store.get().filter((x) => x.name !== r.name);
      store.set(remove ? saved : [{ name: r.name, type: r.type, values: r.values, rows: r.rows, at: Date.now(), pr: url }, ...saved]);
      renderSaved();
    } catch (err) { status(err.message, "err"); }
    finally { $("sendPR").disabled = false; }
  }
  $("sendPR").onclick = () => {
    const r = read();
    if (r.error) return status(r.error, "err");
    send(r);
  };

  // ---------- DNS check (Cloudflare DNS over HTTPS) ----------
  async function lookup(name, type) {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    const d = await r.json();
    return (d.Answer || []).map((a) => ({ type: { 1: "A", 5: "CNAME", 28: "AAAA" }[a.type] || a.type, data: a.data.replace(/\.$/, "") }));
  }
  async function check(name = read().name, want = read()) {
    const box = $("dns");
    box.replaceChildren(Object.assign(document.createElement("p"), { className: "muted small", textContent: `Đang kiểm tra ${name}…` }));
    try {
      const ans = [...await lookup(name, "A"), ...(await lookup(name, "AAAA"))];
      const seen = new Map(ans.map((a) => [`${a.type} ${a.data}`, a]));
      const rows = [...seen.values()];
      const match = want.values?.length && want.values.every((v) => rows.some((a) => a.data.toLowerCase() === v.toLowerCase()));
      const head = Object.assign(document.createElement("p"), {
        className: `status small ${!rows.length ? "err" : match ? "ok" : ""}`,
        textContent: !rows.length ? `${name} chưa trỏ đi đâu (Pull Request chưa duyệt hoặc DNS chưa cập nhật).`
          : match ? `✓ ${name} đã trỏ đúng. Có thể bật SSL trên hosting.` : `${name} đang trỏ về:`,
      });
      const list = document.createElement("ul");
      list.className = "dns-list";
      for (const a of rows) list.append(Object.assign(document.createElement("li"), { textContent: `${a.type}  ${a.data}` }));
      box.replaceChildren(head, ...(rows.length ? [list] : []));
    } catch {
      box.replaceChildren(Object.assign(document.createElement("p"), { className: "status err small", textContent: "Không kiểm tra được, thử lại sau." }));
    }
  }
  $("check").onclick = () => { if (read().sub) check(); else toast("Nhập tên trước"); };

  // ---------- names made here ----------
  function renderSaved() {
    const list = store.get();
    $("savedCount").textContent = list.length ? `${list.length} tên` : "";
    if (!list.length) {
      return $("saved").replaceChildren(Object.assign(document.createElement("p"), { className: "muted small", textContent: "Chưa có. Tên miền sẽ hiện ở đây sau khi gửi Pull Request." }));
    }
    $("saved").replaceChildren(...list.map((x) => {
      const row = document.createElement("div");
      row.className = "saved-row";
      const link = Object.assign(document.createElement("a"), { href: `https://${x.name}`, target: "_blank", rel: "noopener", textContent: x.name });
      const info = Object.assign(document.createElement("small"), { textContent: (x.rows || x.values.map((value) => ({ type: x.type, value }))).map((y) => `${y.type} ${y.value}`).join(" · ") });
      if (x.pr) info.append(" · ", Object.assign(document.createElement("a"), { href: x.pr, target: "_blank", rel: "noopener", textContent: "PR" }));
      const use = Object.assign(document.createElement("button"), { type: "button", textContent: "Mở" });
      use.onclick = () => {
        form.sub.value = x.name.replace(`.${ROOT}`, "");
        recs = (x.rows || x.values.map((value) => ({ type: x.type, value }))).map((y) => ({ ...y }));
        drawRecs();
        render();
        check(x.name, x);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      // Gỡ: a pull request that deletes the record on is-a.dev
      const del = Object.assign(document.createElement("button"), { type: "button", textContent: "Gỡ", title: "Gửi PR gỡ tên miền này" });
      del.onclick = () => {
        if (!confirm(`Gửi Pull Request gỡ ${x.name} khỏi is-a.dev?`)) return;
        const sub = x.name.replace(`.${ROOT}`, "");
        send({ sub, name: x.name, type: x.type, values: x.values, file: `domains/${sub}.hoangpham.json`, json: "" }, true);
      };
      row.append(Object.assign(document.createElement("span"), { className: "saved-name" }), use, del);
      row.firstChild.append(link, info);
      return row;
    }));
  }

  drawRecs();
  render();
  renderSaved();
})();
