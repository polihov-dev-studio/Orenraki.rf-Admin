const API_BASE = window.location.hostname.includes('github.io') || window.location.hostname.includes('.рф')
  ? 'https://YOUR-WORKER.your-subdomain.workers.dev'
  : 'http://127.0.0.1:8787';

const STATE = {
  token: localStorage.getItem('kraken-admin-token') || '',
  sitePath: 'data/site.json',
  productsPath: 'data/products.json',
  siteRepo: 'Orenraki.rf',
  adminRepo: 'Orenraki.rf-Admin'
};

bindTabs();
bindActions();
bootstrap();

async function bootstrap() {
  await Promise.all([loadEditableFiles(), loadStats(), loadOrders(), loadTelegramSettings()]);
}

function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach(x => x.classList.remove('is-active'));
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    btn.classList.add('is-active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  }));
}

function bindActions() {
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('saveSiteJson').addEventListener('click', () => saveFile(STATE.siteRepo, STATE.sitePath, document.getElementById('siteJson').value, 'update site.json'));
  document.getElementById('saveProductsJson').addEventListener('click', () => saveFile(STATE.siteRepo, STATE.productsPath, document.getElementById('productsJson').value, 'update products.json'));
  document.getElementById('saveTelegramBtn').addEventListener('click', saveTelegram);
  document.getElementById('manualSaveBtn').addEventListener('click', () => saveFile(
    document.getElementById('manualRepo').value.trim(),
    document.getElementById('manualPath').value.trim(),
    document.getElementById('manualContent').value,
    document.getElementById('manualMessage').value.trim() || 'update via admin'
  ));
  document.getElementById('orderFilter').addEventListener('input', loadOrders);
}

async function login() {
  const password = document.getElementById('adminPassword').value.trim();
  const res = await fetch(`${API_BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Ошибка входа');
  STATE.token = data.token;
  localStorage.setItem('kraken-admin-token', data.token);
  alert('Вход выполнен');
}

async function loadEditableFiles() {
  const [site, products] = await Promise.all([
    fetch('../main-site/data/site.json').catch(() => fetch('https://raw.githubusercontent.com/mantrova-studio/Orenraki.rf/main/data/site.json')),
    fetch('../main-site/data/products.json').catch(() => fetch('https://raw.githubusercontent.com/mantrova-studio/Orenraki.rf/main/data/products.json')),
  ]);
  document.getElementById('siteJson').value = JSON.stringify(await site.json(), null, 2);
  document.getElementById('productsJson').value = JSON.stringify(await products.json(), null, 2);
}

async function loadStats() {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/stats`);
    const data = await res.json();
    document.getElementById('statsGrid').innerHTML = [
      ['Всего заказов', data.totalOrders || 0],
      ['Выручка', `${data.totalRevenue || 0} ₽`],
      ['Сегодня', data.todayOrders || 0],
      ['Средний чек', `${data.avgOrder || 0} ₽`],
    ].map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
  } catch {
    document.getElementById('statsGrid').innerHTML = '<div class="note">Для статистики сначала войдите в панель.</div>';
  }
}

async function loadOrders() {
  const tableWrap = document.getElementById('ordersTable');
  const filter = document.getElementById('orderFilter').value.toLowerCase().trim();
  try {
    const res = await authFetch(`${API_BASE}/api/admin/orders`);
    const rows = await res.json();
    const orders = rows.filter(order => JSON.stringify(order).toLowerCase().includes(filter));
    tableWrap.innerHTML = `
      <table class="table">
        <thead><tr><th>Дата</th><th>Клиент</th><th>Состав</th><th>Итого</th><th>Источник</th></tr></thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td>${new Date(order.createdAt).toLocaleString('ru-RU')}</td>
              <td><strong>${order.customer?.name || '-'}</strong><br>${order.customer?.phone || ''}<br>${order.customer?.address || ''}</td>
              <td>${order.items.map(item => `<span class="tag">${item.name} × ${item.qty}</span>`).join(' ')}</td>
              <td>${order.total} ₽</td>
              <td>${order.source || '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch {
    tableWrap.innerHTML = '<div class="note">Нет доступа. Нужен вход в панель.</div>';
  }
}

async function loadTelegramSettings() {
  try {
    const res = await authFetch(`${API_BASE}/api/admin/telegram-settings`);
    const data = await res.json();
    document.getElementById('telegramChatId').value = data.chatId || '';
    document.getElementById('telegramPrefix').value = data.prefix || 'KRAKEN';
  } catch {}
}

async function saveTelegram() {
  const payload = {
    chatId: document.getElementById('telegramChatId').value.trim(),
    prefix: document.getElementById('telegramPrefix').value.trim()
  };
  const res = await authFetch(`${API_BASE}/api/admin/telegram-settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Ошибка сохранения');
  alert('Telegram-настройки сохранены');
}

async function saveFile(repo, path, content, message) {
  if (!repo || !path) return alert('Укажите repo и path');
  try { JSON.parse(content); } catch { return alert('JSON невалидный'); }
  const res = await authFetch(`${API_BASE}/api/admin/github/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo, path, content, message })
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Ошибка сохранения');
  alert(`Файл сохранён: ${data.commitSha.slice(0,7)}`);
}

function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (STATE.token) headers.set('Authorization', `Bearer ${STATE.token}`);
  return fetch(url, { ...options, headers });
}
