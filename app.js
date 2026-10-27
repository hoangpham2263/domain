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

  // Current form → { name, file, json, error }
  function read() {
    const sub = form.sub.value.trim().toLowerCase().replace(/\.hoangpham\.is-a\.dev$/, "").replace(/[^a-z0-9.-]/g, "");
    const type = form.type.value;
    const values = form.value.value.split(/[\s,]+/).map((v) => v.trim().replace(/\.$/, "")).filter(Boolean);
    let error = "";
    if (!sub) error = "Nhập tên (vd: demo).";
    else if (!values.length) error = type === "CNAME" ? "Nhập tên host." : "Nhập IP.";
    else if (type === "A" && !values.every(isIPv4)) error = "IP không hợp lệ (vd: 103.97.125.20).";
    else if (type === "AAAA" && !values.every(isIPv6)) error = "IPv6 không hợp lệ.";
    else if (type === "CNAME" && (values.length > 1 || !isHost(values[0]))) error = "CNAME chỉ nhận một tên host (vd: host.example.com).";
    const name = `${sub}.${ROOT}`;
    const data = {
      owner: { username: form.user.value.trim(), email: form.email.value.trim() },
      records: { [type]: type === "CNAME" ? values[0] : values },
    };
    return { sub, type, values, name, file: `domains/${sub}.hoangpham.json`, json: JSON.stringify(data, null, 2) + "\n", error };
  }

  function render() {
    const r = read();
    $("valueLabel").textContent = { A: "IP hosting", CNAME: "Tên host", AAAA: "IPv6" }[r.type];
    form.value.placeholder = { A: "1.2.3.4", CNAME: "host.example.com", AAAA: "2001:db8::1" }[r.type];
    $("fileName").textContent = r.sub ? r.file : "";
    $("json").textContent = r.json;
    $("err").hidden = !r.error || !form.sub.value;
    $("err").textContent = r.error;
    const ok = !r.error;
    $("openPR").classList.toggle("disabled", !ok);
    // GitHub's "new file" page with name and content filled in (it offers to fork for the PR)
    $("openPR").href = ok ? `${REPO}/new/main?filename=${encodeURIComponent(r.file)}&value=${encodeURIComponent(r.json)}` : "#";
  }
  form.addEventListener("input", render);

  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(read().json); toast("✓ Đã sao chép"); } catch { toast("Không sao chép được"); }
  };
  $("openPR").addEventListener("click", (e) => {
    const r = read();
    if (r.error) { e.preventDefault(); return toast(r.error); }
    const saved = store.get().filter((x) => x.name !== r.name);
    store.set([{ name: r.name, type: r.type, values: r.values, at: Date.now() }, ...saved]);
    renderSaved();
  });

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
      return $("saved").replaceChildren(Object.assign(document.createElement("p"), { className: "muted small", textContent: "Chưa có. Tên miền sẽ hiện ở đây sau khi bấm \"Tạo file trên GitHub\"." }));
    }
    $("saved").replaceChildren(...list.map((x) => {
      const row = document.createElement("div");
      row.className = "saved-row";
      const link = Object.assign(document.createElement("a"), { href: `https://${x.name}`, target: "_blank", rel: "noopener", textContent: x.name });
      const info = Object.assign(document.createElement("small"), { textContent: `${x.type} ${x.values.join(", ")}` });
      const use = Object.assign(document.createElement("button"), { type: "button", textContent: "Mở" });
      use.onclick = () => {
        form.sub.value = x.name.replace(`.${ROOT}`, "");
        form.type.value = x.type;
        form.value.value = x.values.join(", ");
        render();
        check(x.name, x);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      const del = Object.assign(document.createElement("button"), { type: "button", className: "icon", textContent: "✕", title: "Bỏ khỏi danh sách" });
      del.onclick = () => { store.set(store.get().filter((y) => y.name !== x.name)); renderSaved(); };
      row.append(Object.assign(document.createElement("span"), { className: "saved-name" }), use, del);
      row.firstChild.append(link, info);
      return row;
    }));
  }

  render();
  renderSaved();
})();
