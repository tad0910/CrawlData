const fs = require('fs');

let html = fs.readFileSync('dashboard.html', 'utf8');

// 1. Add CSS for tabs, split screen, credentials
const cssToAdd = `
    /* TABS */
    .tabs {
      display: flex;
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      gap: 16px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 3px solid transparent;
      padding: 12px 16px;
      font-size: 15px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
    }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    /* SCRAPER ADMIN PANEL */
    .admin-panel {
      padding: 24px;
    }
    .scraper-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .scraper-table th, .scraper-table td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .scraper-table th {
      background: var(--bg);
      font-weight: 600;
    }
    /* SPLIT SCREEN MODAL */
    .modal-split {
      width: 95vw !important;
      max-width: 1600px !important;
      height: 90vh !important;
      display: flex !important;
      flex-direction: column;
    }
    .split-container {
      display: flex;
      flex: 1;
      overflow: hidden;
      gap: 16px;
      margin-top: 16px;
    }
    .split-left, .split-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .split-header {
      background: var(--bg);
      padding: 10px 16px;
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
    }
    .split-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .split-right .split-body {
      background: #fdfdfd;
      color: var(--text);
    }
    .ai-chat-box {
      display: flex;
      padding: 10px;
      background: var(--bg);
      border-top: 1px solid var(--border);
      gap: 10px;
    }
    .ai-chat-box input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
    }
`;
html = html.replace('</style>', cssToAdd + '\n  </style>');

// 2. Add Tabs UI
const headerEnd = '</header>';
const tabsUI = `
  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('data-tab')">Job Data</button>
    <button class="tab-btn" onclick="switchTab('scrapers-tab')">Quản Lý Scraper (AI)</button>
    <button class="tab-btn" onclick="switchTab('credentials-tab')">Vault Đăng Nhập</button>
  </div>
  
  <div id="data-tab" class="tab-content active">
`;
html = html.replace(headerEnd, headerEnd + '\n' + tabsUI);

// Wrap existing content in data-tab, and append new tabs before discover-modal
const modalsStart = '<div class="modal-overlay" id="discover-modal" hidden>';
const newTabsContent = `
  </div> <!-- end data-tab -->

  <div id="scrapers-tab" class="tab-content">
    <div class="admin-panel">
      <h2>Danh Sách Scraper (Bot Cào Dữ Liệu)</h2>
      <button class="btn" onclick="loadScrapers()" style="margin-bottom: 16px;">🔄 Làm Mới Danh Sách</button>
      <table class="scraper-table">
        <thead>
          <tr>
            <th>ID (Nền tảng)</th>
            <th>Loại</th>
            <th>Trạng Thái</th>
            <th>Hành Động</th>
          </tr>
        </thead>
        <tbody id="scraper-list-body">
          <tr><td colspan="4" style="text-align: center;">Đang tải...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div id="credentials-tab" class="tab-content">
    <div class="admin-panel">
      <h2>Kho Tàng Trữ Mật Khẩu (Credential Vault)</h2>
      <p class="muted">Hệ thống AI Auto-Login sẽ sử dụng tài khoản ở đây để tự động vượt rào đăng nhập.</p>
      
      <div style="background: var(--card); padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); max-width: 600px; margin-bottom: 20px;">
        <h3>Thêm Tài Khoản Mới</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
          <input type="text" id="cred-domain" placeholder="Domain (vd: vieclam24h.vn)" style="padding: 8px;" />
          <input type="text" id="cred-user" placeholder="Tên đăng nhập (Email/Username)" style="padding: 8px;" />
          <input type="password" id="cred-pass" placeholder="Mật khẩu" style="padding: 8px;" />
          <button class="btn" onclick="addCredential()">Thêm Tài Khoản</button>
        </div>
      </div>

      <table class="scraper-table" style="max-width: 600px;">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Tên Đăng Nhập</th>
            <th>Hành Động</th>
          </tr>
        </thead>
        <tbody id="credential-list-body">
          <tr><td colspan="3" style="text-align: center;">Đang tải...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

`;
html = html.replace(modalsStart, newTabsContent + '\n  ' + modalsStart);

// 3. Update Modal for Split Screen AI Fix
// We will repurpose the discover-modal into a universal modal that expands to Split Screen when running a test
const oldModalActions = `<div class="modal-actions" id="discover-actions">`;
// Wait, I will just add the split screen containers inside discover-modal
const modalHTML = `
      <div id="split-screen-view" class="split-container" hidden>
        <div class="split-left">
          <div class="split-header">
            <span>💻 AI & Terminal</span>
            <span id="ai-status" style="color: var(--hot);">Đang chờ...</span>
          </div>
          <div class="split-body" id="split-log"></div>
          <div class="ai-chat-box">
            <input type="text" id="ai-prompt" placeholder="Data bị sai? Nhập lệnh cho AI tự sửa lỗi tại đây..." />
            <button class="btn" id="btn-ai-fix" style="background: var(--hot);">✨ AI Tự Sửa</button>
          </div>
        </div>
        <div class="split-right">
          <div class="split-header">
            <span>📊 Kết Quả Trích Xuất (JSON)</span>
          </div>
          <div class="split-body" id="split-result"></div>
        </div>
      </div>
`;
// Insert before modal-actions
html = html.replace(oldModalActions, modalHTML + '\n      ' + oldModalActions);

// 4. Add JS functions
const jsToAdd = `
    // TABS LOGIC
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'scrapers-tab') loadScrapers();
      if (tabId === 'credentials-tab') loadCredentials();
    }

    // CREDENTIALS LOGIC
    let credentials = [];
    async function loadCredentials() {
      const res = await fetch('/api/credentials');
      credentials = await res.json();
      renderCredentials();
    }
    function renderCredentials() {
      const tbody = document.getElementById('credential-list-body');
      if (credentials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Chưa có tài khoản nào</td></tr>';
        return;
      }
      tbody.innerHTML = credentials.map((c, idx) => \`
        <tr>
          <td>\${c.domain}</td>
          <td>\${c.username}</td>
          <td><button class="btn btn-ghost" onclick="deleteCredential(\${idx})" style="color: red; border-color: red;">Xóa</button></td>
        </tr>
      \`).join('');
    }
    async function addCredential() {
      const domain = document.getElementById('cred-domain').value.trim();
      const username = document.getElementById('cred-user').value.trim();
      const password = document.getElementById('cred-pass').value.trim();
      if (!domain || !username || !password) return alert('Vui lòng nhập đủ thông tin!');
      
      credentials.push({ domain, username, password });
      await fetch('/api/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials })
      });
      document.getElementById('cred-domain').value = '';
      document.getElementById('cred-user').value = '';
      document.getElementById('cred-pass').value = '';
      renderCredentials();
    }
    async function deleteCredential(idx) {
      credentials.splice(idx, 1);
      await fetch('/api/credentials', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials })
      });
      renderCredentials();
    }

    // SCRAPERS LOGIC
    async function loadScrapers() {
      const res = await fetch('/api/scrapers');
      const scrapers = await res.json();
      const tbody = document.getElementById('scraper-list-body');
      if (scrapers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Chưa có Scraper nào</td></tr>';
        return;
      }
      tbody.innerHTML = scrapers.map(s => \`
        <tr>
          <td><strong>\${s.id}</strong></td>
          <td><span style="background: var(--accent-soft); color: var(--accent); padding: 2px 8px; border-radius: 12px; font-size: 12px;">\${s.type}</span></td>
          <td>\${s.status === 'idle' ? '🟢 Sẵn sàng' : '⏳ Đang chạy'}</td>
          <td>
            <button class="btn" onclick="openScraperFixModal('\${s.id}')">▶️ Test / Sửa Bằng AI</button>
          </td>
        </tr>
      \`).join('');
    }

    let currentScraperId = null;

    function openScraperFixModal(id) {
      currentScraperId = id;
      document.getElementById('discover-modal').hidden = false;
      document.querySelector('.modal').classList.add('modal-split');
      
      // Hide URL input, show split screen
      document.getElementById('discover-url').parentElement.hidden = true; // Wait, actually I will just hide the input specifically
      document.getElementById('discover-url').hidden = true;
      document.getElementById('require-login-chk').parentElement.hidden = true;
      
      document.getElementById('split-screen-view').hidden = false;
      document.getElementById('btn-run-discover').textContent = '▶️ Chạy Lại Test';
      
      document.getElementById('split-log').innerHTML = 'Bấm "Chạy Lại Test" để xem kết quả...';
      document.getElementById('split-result').innerHTML = '';
      document.getElementById('ai-status').textContent = '🟢 Rảnh rỗi';
    }

    // AI FIX LOGIC
    document.getElementById('btn-ai-fix').addEventListener('click', async () => {
      const prompt = document.getElementById('ai-prompt').value.trim();
      if (!prompt || !currentScraperId) return;
      
      document.getElementById('ai-status').textContent = '🤖 AI đang viết lại code...';
      document.getElementById('btn-ai-fix').disabled = true;
      
      try {
        const res = await fetch('/api/ai-fix-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentScraperId, prompt })
        });
        const data = await res.json();
        
        if (data.success) {
           document.getElementById('ai-status').textContent = '✅ Đã sửa code xong! Tự động chạy lại...';
           document.getElementById('ai-prompt').value = '';
           // Auto run test again
           document.getElementById('btn-run-discover').click();
        } else {
           alert('Lỗi: ' + data.error);
           document.getElementById('ai-status').textContent = '❌ Lỗi AI';
        }
      } catch (err) {
        alert('Lỗi mạng');
      }
      document.getElementById('btn-ai-fix').disabled = false;
    });

`;
html = html.replace('// --- RUN SCRAPER LOGIC ---', jsToAdd + '\n    // --- RUN SCRAPER LOGIC ---');

// We need to modify btn-run-discover to handle currentScraperId
const runBtnLogic = `
    document.getElementById('btn-run-discover').addEventListener('click', async () => {
      let runId = currentScraperId;
      
      // If we are in discover mode (not fix mode)
      if (!runId) {
          runId = currentScraperId_TEMP_VAR; // Wait, discover flow generates the ID.
      }
`;
// Let's do a regex replace for the button click logic in the scratch script next if needed, but it's easier to just write the script out.
fs.writeFileSync('modify_dashboard.js', `
const fs = require('fs');
let html = \`${html.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
fs.writeFileSync('dashboard.html', html);
`);
