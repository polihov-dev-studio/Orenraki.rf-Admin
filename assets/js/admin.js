
const ADMIN_WORKER_URL = "https://YOUR-WORKER.workers.dev";
const ADMIN_TOKEN_KEY = "kraken_admin_token_v1";

const statusLabels = {
  new: "Новый",
  accepted: "Принят",
  cooking: "Готовится",
  delivering: "Доставляется",
  done: "Выполнен",
  cancelled: "Отменен"
};

function getToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ""; }
function setToken(token) { localStorage.setItem(ADMIN_TOKEN_KEY, token); }
function logout() { localStorage.removeItem(ADMIN_TOKEN_KEY); location.href = "../login.html"; }

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (getToken()) headers.set("Authorization", `Bearer ${getToken()}`);
  const res = await fetch(`${ADMIN_WORKER_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка API");
  return data;
}

async function initAdmin() {
  if (location.pathname.endsWith("/login.html")) return initLogin();
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.querySelectorAll("[data-close-admin-modal]").forEach(el => el.addEventListener("click", closeAdminModal));
  const page = document.body.dataset.page;
  if (!getToken()) return location.href = "../login.html";
  if (page === "dashboard") return loadDashboard();
  if (page === "orders") return loadOrders();
  if (page === "products") return loadEditors();
}

function initLogin() {
  const form = document.getElementById("loginForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("loginNote");
    note.textContent = "Вход...";
    const password = new FormData(form).get("password");
    try {
      const data = await api("/api/admin/login", { method:"POST", body: JSON.stringify({ password }) });
      setToken(data.token);
      location.href = "./pages/dashboard.html";
    } catch (err) {
      note.textContent = err.message;
    }
  });
}

async function loadDashboard() {
  const data = await api("/api/admin/stats");
  document.getElementById("statsCards").innerHTML = `
    ${statCard("Всего заказов", data.totalOrders)}
    ${statCard("Выполнено", data.doneOrders)}
    ${statCard("Отменено", data.cancelledOrders)}
    ${statCard("Выручка", `${Number(data.revenue).toLocaleString("ru-RU")} ₽`)}
  `;
  document.getElementById("recentOrders").innerHTML = renderOrdersTable(data.recentOrders, false);
}

function statCard(title, value) {
  return `<article class="admin-card stat-card"><h3>${title}</h3><strong>${value}</strong></article>`;
}

async function loadOrders() {
  await renderOrders();
  document.getElementById("applyFilters").addEventListener("click", renderOrders);
}

async function renderOrders() {
  const section = document.getElementById("filterSection").value;
  const status = document.getElementById("filterStatus").value;
  const params = new URLSearchParams();
  if (section) params.set("section", section);
  if (status) params.set("status", status);
  const data = await api(`/api/admin/orders?${params.toString()}`);
  document.getElementById("ordersTable").innerHTML = renderOrdersTable(data.orders, true);
  document.querySelectorAll("[data-open-order]").forEach(btn => btn.addEventListener("click", () => openOrder(btn.dataset.id)));
}

function renderOrdersTable(orders, interactive) {
  const head = `
    <div class="order-row order-head">
      <div>№</div><div>Дата</div><div>Раздел</div><div>Клиент</div><div>Сумма</div><div>Статус</div>${interactive ? "<div></div>" : "<div>Телефон</div>"}
    </div>`;
  const rows = orders.map(order => `
    <div class="order-row">
      <div>${order.id}</div>
      <div>${new Date(order.createdAt).toLocaleString("ru-RU")}</div>
      <div>${order.sectionLabel}</div>
      <div>${order.customer.name}</div>
      <div>${Number(order.total).toLocaleString("ru-RU")} ₽</div>
      <div><span class="status-pill status-${order.status}">${statusLabels[order.status] || order.status}</span></div>
      ${interactive ? `<div><button class="btn btn-dark" data-open-order="${order.id}" data-id="${order.id}">Открыть</button></div>` : `<div>${order.customer.phone}</div>`}
    </div>
  `).join("");
  return head + rows;
}

async function openOrder(id) {
  const data = await api(`/api/admin/orders/${id}`);
  const order = data.order;
  const items = order.items.map(i => `<li>${i.name} × ${i.qty} — ${Number(i.price * i.qty).toLocaleString("ru-RU")} ₽</li>`).join("");
  const history = (order.history || []).map(h => `<li>${new Date(h.at).toLocaleString("ru-RU")} — ${h.text}</li>`).join("");
  document.getElementById("adminModalContent").innerHTML = `
    <h2>Заказ ${order.id}</h2>
    <p><strong>Раздел:</strong> ${order.sectionLabel}</p>
    <p><strong>Клиент:</strong> ${order.customer.name}, ${order.customer.phone}</p>
    <p><strong>Адрес:</strong> ${order.customer.address}</p>
    <p><strong>Комментарий:</strong> ${order.customer.comment || "—"}</p>
    <p><strong>Сумма:</strong> ${Number(order.total).toLocaleString("ru-RU")} ₽</p>
    <h3>Состав</h3>
    <ul>${items}</ul>
    <h3>Изменить статус</h3>
    <div class="toolbar">
      <select id="statusSelect">
        ${Object.entries(statusLabels).map(([key,label]) => `<option value="${key}" ${key===order.status?'selected':''}>${label}</option>`).join("")}
      </select>
      <input id="cancelReasonInput" placeholder="Комментарий отмены" value="${order.cancelReason || ""}">
      <button class="btn btn-primary" id="saveStatusBtn">Сохранить</button>
    </div>
    <h3>История</h3>
    <ul>${history || "<li>Нет записей</li>"}</ul>
  `;
  document.getElementById("saveStatusBtn").addEventListener("click", async () => {
    const status = document.getElementById("statusSelect").value;
    const cancelReason = document.getElementById("cancelReasonInput").value.trim();
    await api(`/api/admin/orders/${id}/status`, {
      method:"POST",
      body: JSON.stringify({ status, cancelReason })
    });
    closeAdminModal();
    renderOrders();
  });
  document.getElementById("adminModal").classList.add("is-open");
}
function closeAdminModal() { document.getElementById("adminModal").classList.remove("is-open"); }

async function loadEditors() {
  const data = await api("/api/admin/config");
  document.getElementById("siteJsonEditor").value = JSON.stringify(data.site, null, 2);
  document.getElementById("productsJsonEditor").value = JSON.stringify(data.products, null, 2);
  document.getElementById("saveSiteJson").addEventListener("click", () => saveJson("site.json", document.getElementById("siteJsonEditor").value));
  document.getElementById("saveProductsJson").addEventListener("click", () => saveJson("products.json", document.getElementById("productsJsonEditor").value));
}

async function saveJson(path, content) {
  const note = document.getElementById("saveJsonNote");
  note.textContent = "Сохранение...";
  try {
    JSON.parse(content);
    await api("/api/admin/save-json", { method:"POST", body: JSON.stringify({ path, content }) });
    note.textContent = `${path} сохранён`;
  } catch (err) {
    note.textContent = err.message;
  }
}

window.addEventListener("DOMContentLoaded", initAdmin);
