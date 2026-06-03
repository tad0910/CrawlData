
const fs = require('fs');
let html = `<!DOCTYPE html>
<html lang="vi">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unified Jobs Dashboard</title>
  <style>
    :root {
      --bg: #f7f8fa;
      --card: #fff;
      --text: #1a1f2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --hot: #f97316;
      --hot-soft: #fed7aa;
      --green: #16a34a;
      --green-soft: #dcfce7;
      --radius: 8px;
    }

    * {
      box-sizing: border-box;
    }

    [hidden] {
      display: none !important;
    }

    body {
      margin: 0;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .muted {
      color: var(--muted);
      font-size: 13px;
    }

    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 7px 14px;
      border-radius: var(--radius);
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }

    .btn:hover {
      filter: brightness(0.95);
    }

    .btn-ghost {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      padding: 20px 24px 8px;
    }

    .stat {
      background: var(--card);
      padding: 14px 16px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
    }

    .stat-label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      font-weight: 600;
    }

    .stat-value {
      font-size: 22px;
      font-weight: 600;
      margin-top: 4px;
    }

    .stat-sub {
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }

    .filters {
      padding: 12px 24px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .filters input,
    .filters select {
      padding: 7px 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
      font-size: 13px;
      font-family: inherit;
      color: inherit;
    }

    .filters input[type=search] {
      flex: 1;
      min-width: 220px;
    }

    main {
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 16px;
      padding: 0 24px 24px;
      align-items: start;
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
    }

    .panel+.panel {
      margin-top: 12px;
    }

    .panel h3 {
      margin: 0 0 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--muted);
      font-weight: 600;
    }

    .bar-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      margin: 0 -6px;
      cursor: pointer;
      font-size: 13px;
      border-radius: 4px;
    }

    .bar-row:hover {
      background: var(--bg);
    }

    .bar-row.active {
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }

    .bar-row .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bar-row .bar {
      flex: 0 0 80px;
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }

    .bar-row .bar>span {
      display: block;
      height: 100%;
      background: var(--accent);
    }

    .bar-row.active .bar>span {
      background: var(--accent);
    }

    .bar-row .count {
      flex: 0 0 auto;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      min-width: 24px;
      text-align: right;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .sort-bar {
      display: flex;
      gap: 4px;
    }

    .sort-bar button {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      color: inherit;
    }

    .sort-bar button.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .job-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .job-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px 16px;
      cursor: pointer;
      transition: border-color 0.1s, transform 0.1s;
    }

    .job-card:hover {
      border-color: var(--accent);
    }

    .job-title {
      font-weight: 600;
      font-size: 15px;
      margin: 0 0 4px;
      display: flex;
      justify-content: space-between;
    }

    .job-company {
      color: var(--accent);
      font-size: 13px;
      font-weight: 500;
    }

    .job-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      font-size: 13px;
      color: var(--muted);
      margin: 6px 0 8px;
      align-items: center;
    }

    .job-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }

    .tag {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      background: #f3f4f6;
      color: #4b5563;
    }

    .tag.skill {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .badge.provider {
      background: #e0e7ff;
      color: #4338ca;
    }

    .badge.salary {
      background: var(--green-soft);
      color: var(--green);
      text-transform: none;
      letter-spacing: 0;
    }

    .pagination {
      display: flex;
      justify-content: center;
      gap: 4px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .pagination button {
      background: var(--card);
      border: 1px solid var(--border);
      padding: 6px 11px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      color: inherit;
      min-width: 34px;
    }

    .pagination button:hover:not(:disabled) {
      border-color: var(--accent);
      color: var(--accent);
    }

    .pagination button.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .pagination button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .pagination span {
      padding: 6px 4px;
      color: var(--muted);
    }

    .loader {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
      font-size: 16px;
    }

    .empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .modal {
      background: var(--card);
      padding: 24px;
      border-radius: var(--radius);
      width: 400px;
      max-width: 90%;
    }

    .modal h2 {
      margin: 0 0 16px;
      font-size: 18px;
    }

    .modal input {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      margin-bottom: 16px;
      font-family: inherit;
      font-size: 14px;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .log-box {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      height: 150px;
      overflow-y: auto;
      margin-top: 16px;
      white-space: pre-wrap;
      word-break: break-all;
    }
  
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

  </style>
</head>

<body>
  <header>
    <h1>Unified Jobs Dashboard</h1>
    <span class="muted" id="source-info">Live from PostgreSQL Database</span>
    <div style="flex: 1"></div>
    <button class="btn" id="btn-discover">+ Auto-Discover API</button>
  </header>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('data-tab')">Job Data</button>
    <button class="tab-btn" onclick="switchTab('scrapers-tab')">Quản Lý Scraper (AI)</button>
    <button class="tab-btn" onclick="switchTab('credentials-tab')">Vault Đăng Nhập</button>
  </div>
  
  <div id="data-tab" class="tab-content active">


  <div class="loader" id="loader">Đang tải dữ liệu từ Database...</div>

  <section class="stats" id="stats" hidden></section>

  <section class="filters" id="filters" hidden>
    <input type="search" id="q" placeholder="Tìm title / company / skill…" />
    <select id="f-provider">
      <option value="">All providers</option>
    </select>
    <select id="f-location">
      <option value="">All locations</option>
    </select>
    <select id="f-quick">
      <option value="">Quick filter…</option>
      <option value="salary">Has specific salary</option>
    </select>
    <button class="btn btn-ghost" id="btn-clear">Clear all</button>
  </section>

  <main id="main" hidden>
    <aside>
      <div class="panel">
        <h3>Sources (Providers)</h3>
        <div id="chart-providers"></div>
      </div>
      <div class="panel">
        <h3>Top Skills</h3>
        <div id="chart-skills"></div>
      </div>
      <div class="panel">
        <h3>Top Locations</h3>
        <div id="chart-locations"></div>
      </div>
      <div class="panel">
        <h3>Top Companies</h3>
        <div id="chart-companies"></div>
      </div>
    </aside>
    <section>
      <div class="results-header">
        <div class="muted" id="count"></div>
        <div class="sort-bar">
          <button data-sort="posted" class="active">Recent</button>
          <button data-sort="salary">Salary ↓</button>
          <button data-sort="title">A–Z</button>
        </div>
      </div>
      <div class="job-list" id="job-list"></div>
      <div class="pagination" id="pagination"></div>
    </section>
  </main>

  
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


  <div class="modal-overlay" id="discover-modal" hidden>
    <div class="modal">
      <h2>Auto-API Discovery</h2>
      <p class="muted" style="margin-top:0; margin-bottom: 16px;">Nhập URL của trang web tuyển dụng. Hệ thống sẽ tự động
        dùng Playwright + AI để phân tích và sinh ra Scraper.</p>
      <input type="url" id="discover-url" placeholder="https://example.com/it-jobs" />
      <div style="margin-top: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="require-login-chk" style="width: 18px; height: 18px; cursor: pointer;">
        <label for="require-login-chk"
          style="cursor: pointer; user-select: none; font-size: 14px; font-weight: 500;">Bắt buộc Đăng nhập trước khi AI
          quét</label>
      </div>
      <div style="margin-bottom: 20px;">
        <label for="ai-provider-select"
          style="font-size: 14px; font-weight: 500; display: block; margin-bottom: 6px;">Chọn Mô Hình AI
          (Brain):</label>
        <select id="ai-provider-select"
          style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font-family: inherit;">
          <option value="gemini">Google (gemini-2.5-flash) - Xử lý HTML siêu dài</option>
        </select>
      </div>
      
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

      <div class="modal-actions" id="discover-actions">
        <button class="btn btn-ghost" id="btn-cancel-discover">Đóng</button>
        <button class="btn" id="btn-run-discover">Bắt đầu Quét AI</button>
        <button class="btn" id="btn-run-test" style="background: var(--green); display: none;">▶️ Chạy Test Ngay</button>
        <button class="btn" id="btn-stop-test" style="background: var(--hot); display: none;">🛑 Dừng Test</button>
      </div>
      <div id="discover-log-container" hidden>
        <div class="log-box" id="discover-log">Đang khởi tạo Playwright, lắng nghe network...\nQuá trình này có thể mất
          30-60 giây. Xin vui lòng chờ...</div>
      </div>
    </div>
  </div>

  <script>
    const PAGE_SIZE = 50;
    const state = {
      jobs: [],
      filter: { q: '', provider: '', location: '', quick: '', skill: '', company: '' },
      sort: 'posted',
      page: 1,
      _visibleList: [],
    };

    function parseStandardJob(j) {
      // Handle postgres jsonb which might be parsed automatically or still string
      const src = typeof j.source_metadata === 'string' ? JSON.parse(j.source_metadata) : (j.source_metadata || {});
      const comp = typeof j.company_info === 'string' ? JSON.parse(j.company_info) : (j.company_info || {});
      const basic = typeof j.basic_info === 'string' ? JSON.parse(j.basic_info) : (j.basic_info || {});
      const cond = typeof j.working_conditions === 'string' ? JSON.parse(j.working_conditions) : (j.working_conditions || {});
      const time = typeof j.timestamps === 'string' ? JSON.parse(j.timestamps) : (j.timestamps || {});
      const skills = typeof j.extracted_skills === 'string' ? JSON.parse(j.extracted_skills) : (j.extracted_skills || []);

      let minVnd = cond.salary_min || 0;
      let maxVnd = cond.salary_max || 0;
      if (cond.salary_currency === 'USD') {
        minVnd *= 25500;
        maxVnd *= 25500;
      }

      return {
        id: j.internal_job_id,
        provider: src.provider || 'UNKNOWN',
        url: src.original_url || '#',
        title: basic.raw_title || basic.normalized_title || 'No Title',
        company: comp.name || 'Unknown',
        locations: basic.locations || [],
        modes: basic.working_modes || [],
        tags: basic.tags || [],
        skills: skills || [],
        salaryText: cond.salary_raw_text || (cond.is_negotiable ? 'Thỏa thuận' : ''),
        minVnd,
        maxVnd,
        posted: time.posted_at || '',
        crawled: time.crawled_at ? new Date(time.crawled_at) : new Date(),
      };
    }

    async function loadData() {
      try {
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error('Network response was not ok');
        const rawJobs = await res.json();
        state.jobs = rawJobs.map(parseStandardJob);

        document.getElementById('loader').hidden = true;
        document.getElementById('stats').hidden = false;
        document.getElementById('filters').hidden = false;
        document.getElementById('main').hidden = false;

        renderFilterOptions();
        renderAll();
      } catch (error) {
        console.error('Error fetching jobs:', error);
        document.getElementById('loader').innerHTML = \`Lỗi tải dữ liệu từ API: \${error.message}\`;
      }
    }

    function fmtMoney(num) {
      if (!num) return '';
      if (num >= 1000000) return (num / 1000000).toFixed(0) + ' Tr';
      return num.toLocaleString();
    }

    function topN(items, getter, n) {
      const counts = new Map();
      for (const item of items) {
        const vals = getter(item);
        const arr = Array.isArray(vals) ? vals : [vals];
        for (const v of arr) {
          if (!v) continue;
          counts.set(v, (counts.get(v) || 0) + 1);
        }
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    }

    function filtered() {
      const { q, provider, location, quick, skill, company } = state.filter;
      const qLower = q.toLowerCase();
      return state.jobs.filter(j => {
        if (qLower) {
          const hay = \`\${j.title} \${j.company} \${(j.skills || []).join(' ')} \${(j.tags || []).join(' ')}\`.toLowerCase();
          if (!hay.includes(qLower)) return false;
        }
        if (provider && j.provider !== provider) return false;
        if (location && !j.locations.includes(location)) return false;
        if (quick === 'salary' && j.maxVnd === 0) return false;
        if (skill && !(j.skills.includes(skill) || j.tags.includes(skill))) return false;
        if (company && j.company !== company) return false;
        return true;
      });
    }

    function sorted(list) {
      const c = [...list];
      if (state.sort === 'posted') {
        c.sort((a, b) => b.crawled.getTime() - a.crawled.getTime());
      } else if (state.sort === 'salary') {
        c.sort((a, b) => b.maxVnd - a.maxVnd);
      } else if (state.sort === 'title') {
        c.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      }
      return c;
    }

    function renderFilterOptions() {
      const locs = [...new Set(state.jobs.flatMap(j => j.locations).filter(Boolean))].sort();
      document.getElementById('f-location').innerHTML = '<option value="">All locations</option>' + locs.map(l => \`<option value="\${l}">\${l}</option>\`).join('');

      const provs = [...new Set(state.jobs.map(j => j.provider).filter(Boolean))].sort();
      document.getElementById('f-provider').innerHTML = '<option value="">All providers</option>' + provs.map(p => \`<option value="\${p}">\${p}</option>\`).join('');
    }

    function renderStats() {
      const jobs = state.jobs;
      const companies = new Set(jobs.map(j => j.company).filter(Boolean));
      const withSal = jobs.filter(j => j.maxVnd > 0);

      const avgMaxVnd = withSal.length ? withSal.reduce((a, b) => a + b.maxVnd, 0) / withSal.length : 0;

      const cards = [
        { label: 'Total jobs', value: jobs.length.toLocaleString() },
        { label: 'Companies', value: companies.size.toLocaleString() },
        { label: 'With salary info', value: withSal.length.toLocaleString(), sub: jobs.length ? \`\${Math.round(withSal.length / jobs.length * 100)}%\` : '' },
        { label: 'Avg max salary', value: avgMaxVnd ? fmtMoney(avgMaxVnd) : '—' },
      ];
      document.getElementById('stats').innerHTML = cards.map(c =>
        \`<div class="stat"><div class="stat-label">\${c.label}</div><div class="stat-value">\${c.value}</div>\${c.sub ? \`<div class="stat-sub">\${c.sub}</div>\` : ''}</div>\`
      ).join('');
    }

    function renderCharts() {
      const list = filtered();
      const providers = topN(list, j => j.provider, 10);
      const skills = topN(list, j => [...j.skills, ...j.tags], 15);
      const locations = topN(list, j => j.locations, 10);
      const companies = topN(list, j => j.company, 10);

      const bar = (items, key, current) => {
        if (!items.length) return '<div class="muted" style="font-size:13px">Không có data</div>';
        const max = items[0][1];
        return items.map(([name, count]) => \`
          <div class="bar-row \${current === name ? 'active' : ''}" data-filter="\${key}" data-value="\${name}" title="\${name}">
            <span class="name">\${name}</span>
            <span class="bar"><span style="width:\${(count / max * 100).toFixed(1)}%"></span></span>
            <span class="count">\${count}</span>
          </div>
        \`).join('');
      };

      document.getElementById('chart-providers').innerHTML = bar(providers, 'provider', state.filter.provider);
      document.getElementById('chart-skills').innerHTML = bar(skills, 'skill', state.filter.skill);
      document.getElementById('chart-locations').innerHTML = bar(locations, 'location', state.filter.location);
      document.getElementById('chart-companies').innerHTML = bar(companies, 'company', state.filter.company);
    }

    function renderList() {
      const list = sorted(filtered());
      state._visibleList = list;
      document.getElementById('count').textContent = \`\${list.length.toLocaleString()} job\${list.length !== 1 ? 's' : ''}\`;

      const start = (state.page - 1) * PAGE_SIZE;
      const pageJobs = list.slice(start, start + PAGE_SIZE);

      const html = pageJobs.map((j) => {
        let displaySalary = j.salaryText;
        if (!displaySalary && j.maxVnd > 0) {
          displaySalary = \`\${fmtMoney(j.minVnd)} - \${fmtMoney(j.maxVnd)}\`;
        }

        return \`
          <div class="job-card" onclick="window.open('\${j.url}', '_blank')">
            <div class="job-title">
                <span>\${j.title}</span>
                <span class="badge provider">\${j.provider}</span>
            </div>
            <div class="job-company">\${j.company}</div>
            <div class="job-meta">
              <span>\${j.locations.join(', ') || '—'}</span>
              <span>·</span>
              <span>\${j.modes.join(', ') || '—'}</span>
              <span>·</span>
              <span>\${j.posted || j.crawled.toISOString().slice(0, 10)}</span>
              \${displaySalary ? \`<span class="badge salary">\${displaySalary}</span>\` : ''}
            </div>
            <div class="job-tags">
              \${(j.skills.length ? j.skills : j.tags).slice(0, 10).map(s => \`<span class="tag skill">\${s}</span>\`).join('')}
            </div>
          </div>
        \`;
      }).join('') || '<div class="empty">Không có kết quả. Thử bỏ bớt filter.</div>';
      document.getElementById('job-list').innerHTML = html;

      renderPagination(list.length);
    }

    function renderPagination(total) {
      const pages = Math.ceil(total / PAGE_SIZE);
      const cur = state.page;
      if (pages <= 1) { document.getElementById('pagination').innerHTML = ''; return; }
      const btn = (p, label = p, extra = '') => \`<button data-page="\${p}" \${extra}>\${label}</button>\`;
      let html = btn(Math.max(1, cur - 1), '‹', cur === 1 ? 'disabled' : '');
      const win = 2;
      const from = Math.max(1, cur - win);
      const to = Math.min(pages, cur + win);
      if (from > 1) { html += btn(1, '1'); if (from > 2) html += '<span>…</span>'; }
      for (let p = from; p <= to; p++) html += \`<button data-page="\${p}" class="\${p === cur ? 'active' : ''}">\${p}</button>\`;
      if (to < pages) { if (to < pages - 1) html += '<span>…</span>'; html += btn(pages, pages); }
      html += btn(Math.min(pages, cur + 1), '›', cur === pages ? 'disabled' : '');
      document.getElementById('pagination').innerHTML = html;
    }

    function renderAll() {
      renderStats();
      renderCharts();
      renderList();
    }

    // Events
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-page]');
      if (btn && !btn.hasAttribute('disabled')) {
        state.page = parseInt(btn.dataset.page);
        renderList();
        window.scrollTo(0, 0);
      }

      const sortBtn = e.target.closest('[data-sort]');
      if (sortBtn) {
        document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
        sortBtn.classList.add('active');
        state.sort = sortBtn.dataset.sort;
        state.page = 1;
        renderList();
      }

      const barRow = e.target.closest('.bar-row');
      if (barRow) {
        const key = barRow.dataset.filter;
        const val = barRow.dataset.value;
        if (state.filter[key] === val) {
          state.filter[key] = '';
        } else {
          state.filter[key] = val;
        }
        state.page = 1;
        renderAll();
      }
    });

    ['q', 'f-provider', 'f-location', 'f-quick'].forEach(id => {
      document.getElementById(id).addEventListener('input', e => {
        const key = id.replace('f-', '');
        state.filter[key] = e.target.value;
        state.page = 1;
        renderAll();
      });
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      state.filter = { q: '', provider: '', location: '', quick: '', skill: '', company: '' };
      ['q', 'f-provider', 'f-location', 'f-quick'].forEach(id => document.getElementById(id).value = '');
      state.page = 1;
      renderAll();
    });

    // Discover Modal
    const modal = document.getElementById('discover-modal');
    const inputUrl = document.getElementById('discover-url');
    const logBox = document.getElementById('discover-log');
    const logContainer = document.getElementById('discover-log-container');
    const btnRun = document.getElementById('btn-run-discover');
    const btnRunTest = document.getElementById('btn-run-test');
    const btnStopTest = document.getElementById('btn-stop-test');
    
    let generatedScraperId = null;
    let pollInterval = null;

    document.getElementById('btn-discover').addEventListener('click', () => {
      modal.hidden = false;
      inputUrl.value = '';
      logContainer.hidden = true;
      btnRun.disabled = false;
      btnRun.style.display = 'inline-block';
      btnRunTest.style.display = 'none';
      btnStopTest.style.display = 'none';
      generatedScraperId = null;
      if (pollInterval) clearInterval(pollInterval);
    });

    document.getElementById('btn-cancel-discover').addEventListener('click', () => {
      modal.hidden = true;
      if (pollInterval) clearInterval(pollInterval);
    });

    btnRun.addEventListener('click', async () => {
      const url = inputUrl.value.trim();
      if (!url) return alert('Vui lòng nhập URL');

      btnRun.disabled = true;
      logContainer.hidden = false;
      logBox.innerText = \`Đang gửi request phân tích URL: \${url}\n\n1. Playwright đang quét Network Traffic...\n2. Chờ timeout 15s để bắt API...\n3. Gửi dữ liệu cho AI sinh code...\n\nVui lòng không đóng cửa sổ này.\`;

      try {
        const requireLogin = document.getElementById('require-login-chk').checked;
        const aiProvider = document.getElementById('ai-provider-select').value;
        const res = await fetch('/api/discover-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, requireLogin, aiProvider })
        });
        const data = await res.json();

        if (data.success) {
          generatedScraperId = data.config.id;
          logBox.innerText += \`\n\n🎉 THÀNH CÔNG!\nLoại Scraper: \${data.config.type}\nID: \${data.config.id}\nFile code tự sinh: \${data.config.file}\n\n🤖 Đã có thể chạy thử nghiệm trực tiếp!\`;
          btnRun.style.display = 'none';
          btnRunTest.style.display = 'inline-block';
        } else {
          logBox.innerText += \`\n\n❌ THẤT BẠI:\n\${data.error}\n\${data.details}\`;
          btnRun.disabled = false;
        }
      } catch (err) {
        logBox.innerText += \`\n\n❌ LỖI MẠNG: \${err.message}\`;
        btnRun.disabled = false;
      }
    });

    btnRunTest.addEventListener('click', async () => {
      if (!generatedScraperId) return;
      
      btnRunTest.style.display = 'none';
      btnStopTest.style.display = 'inline-block';
      logBox.innerText = 'Đang khởi chạy tiến trình chạy thử...';

      try {
        const res = await fetch('/api/run-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: generatedScraperId })
        });
        const data = await res.json();
        if (data.success) {
          // Bắt đầu polling logs
          pollInterval = setInterval(async () => {
            try {
              const logRes = await fetch(\`/api/scraper-logs/\${generatedScraperId}\`);
              const logData = await logRes.json();
              
              if (logData.status === 'not_found') {
                clearInterval(pollInterval);
                return;
              }
              
              const isScrolledToBottom = logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 1;
              logBox.innerText = logData.logs;
              
              if (isScrolledToBottom) {
                logBox.scrollTop = logBox.scrollHeight;
              }

              if (logData.status === 'completed' || logData.status === 'error') {
                clearInterval(pollInterval);
                btnStopTest.style.display = 'none';
                btnRunTest.style.display = 'inline-block';
                btnRunTest.innerText = '▶️ Chạy Lại Test';
                
                // Reload dashboard data automatically
                loadData();
              }
            } catch (e) {
              console.error('Polling error', e);
            }
          }, 1000);
        } else {
          logBox.innerText += \`\n❌ Không thể khởi chạy: \${data.error}\`;
          btnStopTest.style.display = 'none';
          btnRunTest.style.display = 'inline-block';
        }
      } catch (err) {
        logBox.innerText += \`\n❌ LỖI MẠNG: \${err.message}\`;
        btnStopTest.style.display = 'none';
        btnRunTest.style.display = 'inline-block';
      }
    });

    btnStopTest.addEventListener('click', async () => {
      if (!generatedScraperId) return;
      try {
        await fetch('/api/stop-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: generatedScraperId })
        });
      } catch (e) {
        console.error(e);
      }
    });

    loadData();
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

    function openScraperFixModal(id) {
      generatedScraperId = id;
      document.getElementById('discover-modal').hidden = false;
      document.querySelector('.modal').classList.add('modal-split');
      
      // Hide URL input, show split screen
      document.getElementById('discover-url').parentElement.hidden = true;
      document.getElementById('discover-url').hidden = true;
      document.getElementById('require-login-chk').parentElement.hidden = true;
      
      document.getElementById('split-screen-view').hidden = false;
      document.getElementById('btn-run-discover').style.display = 'none';
      document.getElementById('btn-run-test').style.display = 'inline-block';
      document.getElementById('btn-run-test').textContent = '▶️ Chạy Test Lại';
      
      document.getElementById('split-log').innerHTML = 'Bấm "Chạy Test Lại" để xem kết quả...';
      document.getElementById('split-result').innerHTML = '';
      document.getElementById('ai-status').textContent = '🟢 Rảnh rỗi';
    }

    // Móc sự kiện vào nút AI
    document.getElementById('btn-ai-fix').addEventListener('click', async () => {
      const prompt = document.getElementById('ai-prompt').value.trim();
      if (!prompt || !generatedScraperId) return;
      
      document.getElementById('ai-status').textContent = '🤖 AI đang viết lại code...';
      document.getElementById('btn-ai-fix').disabled = true;
      
      try {
        const res = await fetch('/api/ai-fix-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: generatedScraperId, prompt })
        });
        const data = await res.json();
        
        if (data.success) {
           document.getElementById('ai-status').textContent = '✅ Đã sửa code xong! Tự động chạy lại...';
           document.getElementById('ai-prompt').value = '';
           // Auto run test again
           document.getElementById('btn-run-test').click();
        } else {
           alert('Lỗi: ' + data.error);
           document.getElementById('ai-status').textContent = '❌ Lỗi AI';
        }
      } catch (err) {
        alert('Lỗi mạng');
      }
      document.getElementById('btn-ai-fix').disabled = false;
    });

    // Hàm update JSON khi test
    function fetchJSONForSplitRight(id) {
        fetch('/api/jobs?limit=50')
          .then(res => res.json())
          .then(data => {
            const filtered = data.filter(d => d.source.includes(id));
            if (filtered.length > 0) {
               document.getElementById('split-result').textContent = JSON.stringify(filtered, null, 2);
            }
          });
    }

    // Ghi đè vào hàm pollTestLogs hiện tại để update json
    const originalPollTestLogs = window.pollTestLogs; // It's inline but we can hook into btn-run-test
    
    document.getElementById('btn-run-test').addEventListener('click', () => {
        // Cứ mỗi 3s fetch JSON 1 lần
        const jsonInterval = setInterval(() => {
            if (generatedScraperId) fetchJSONForSplitRight(generatedScraperId);
        }, 3000);
        
        // Khi bấm Dừng Test hoặc Đóng, clear interval
        document.getElementById('btn-stop-test').addEventListener('click', () => clearInterval(jsonInterval), {once: true});
        document.getElementById('btn-cancel-discover').addEventListener('click', () => clearInterval(jsonInterval), {once: true});
    });

  </script>
</body>

</html>`;
fs.writeFileSync('dashboard.html', html);
