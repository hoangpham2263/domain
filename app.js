// Keeps the GitHub token (used by go.js to save links.json) only in this browser.
(() => {
  const token = document.querySelector('#form [name="token"]');
  token.value = localStorage.getItem("domain-token") || "";
  token.addEventListener("change", () => { try { localStorage.setItem("domain-token", token.value.trim()); } catch {} });
  document.getElementById("form").addEventListener("submit", (e) => e.preventDefault());
})();
