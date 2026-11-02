let allScripts = [];
let keywordPresets = {};
let currentSelectedLead = null;
let crawlPollTimer = null;

const SPORT_LABELS = {
  gym: { name: 'Thể hình & Fitness', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: '🏋️' },
  yoga: { name: 'HLV Yoga', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30', icon: '🧘' },
  dance: { name: 'Dân vũ & Vũ đạo', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30', icon: '💃' },
  martial_arts: { name: 'Võ cổ truyền', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: '🥋' }
};

const PLATFORM_LABELS = {
  facebook: { name: 'Facebook', cls: 'bg-blue-600/20 text-blue-300 border-blue-500/40', icon: '📘' },
  zalo: { name: 'Zalo / Nhóm Zalo', cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', icon: '💬' },
  threads: { name: 'Threads', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40', icon: '🧵' },
  tiktok: { name: 'TikTok', cls: 'bg-pink-500/20 text-pink-300 border-pink-500/40', icon: '🎵' },
  instagram: { name: 'Instagram', cls: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40', icon: '📸' },
  telegram: { name: 'Telegram', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40', icon: '✈️' },
  x: { name: 'X (Twitter)', cls: 'bg-slate-700 text-slate-200 border-slate-600', icon: '🐦' },
  youtube: { name: 'YouTube', cls: 'bg-red-500/20 text-red-300 border-red-500/40', icon: '▶️' },
  linkedin: { name: 'LinkedIn', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', icon: '💼' },
  google_maps: { name: 'Google Maps', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '📍' },
  web: { name: 'Website', cls: 'bg-slate-800 text-slate-300 border-slate-700', icon: '🌐' }
};

const EVIDENCE_TYPE_LABELS = {
  post_asking_cert: { text: '🔥 Bài viết hỏi chỗ học / thi Chứng chỉ', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  post_job_seeking: { text: '💼 Bài đăng tìm việc PT / Ứng tuyển HLV', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  post_teaching: { text: '🎬 Bài viết / Video mở lớp dạy kèm học viên', cls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  zalo_community: { text: '💬 Bằng chứng Nhóm Zalo cộng đồng', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  profile_bio: { text: '👤 Tiểu sử trang cá nhân (Bio)', cls: 'bg-slate-800 text-slate-300 border-slate-700' }
};

const STATUS_LABELS = {
  new: { text: 'Chưa tiếp cận', cls: 'bg-slate-800 text-slate-300 border-slate-700' },
  contacted: { text: 'Đã nhắn Zalo / DM', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  interested: { text: 'Quan tâm khóa học', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  follow_up: { text: 'Hẹn liên hệ lại', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  closed_won: { text: 'Đã chốt học viên', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  closed_lost: { text: 'Đã có bằng / Từ chối', cls: 'bg-slate-900 text-slate-500 border-slate-800' }
};

const OUTCOME_LABELS = {
  sent_zalo: '💬 Đã gửi tin nhắn (Zalo / DM MXH)',
  answered_interested: '🔥 Khách quan tâm - Đang hỏi lịch thi',
  callback_later: '⏰ Hẹn đợt sau / Đang gom nhóm',
  no_answer: '📵 Chưa xem tin nhắn / Chưa nghe máy',
  already_certified: 'ℹ️ Đã có đủ chứng chỉ Cục TDTT',
  enrolled: '🎓 ĐÃ CHỐT ĐĂNG KÝ HỌC VIÊN!'
};

function showToast(msg, isError = false) {
  const el = document.getElementById('toastBox');
  el.textContent = msg;
  el.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-white text-xs font-bold shadow-xl ${
    isError ? 'bg-rose-600' : 'bg-emerald-600'
  }`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3200);
}

function formatMoney(v) {
  return Number(v || 0).toLocaleString('vi-VN') + 'đ';
}

function switchTab(tabName) {
  const activeColors = {
    b2b: 'border-purple-400 text-purple-300 bg-slate-800/70',
    b2c: 'border-cyan-400 text-cyan-300 bg-slate-800/70',
    students: 'border-emerald-400 text-emerald-300 bg-slate-800/70',
    cloud: 'border-blue-400 text-blue-300 bg-slate-800/70'
  };

  ['b2b', 'b2c', 'students', 'cloud'].forEach((t) => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tabBtn-${t}`);
    if (t === tabName) {
      sec.classList.remove('hidden');
      btn.className = `tab-btn px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 ${activeColors[t]}`;
    } else {
      sec.classList.add('hidden');
      btn.className = 'tab-btn px-4 py-2.5 text-sm font-bold rounded-t-lg border-b-2 border-transparent text-slate-400 hover:text-white';
    }
  });

  if (tabName === 'b2b') loadB2BLeads();
  if (tabName === 'b2c') loadB2CLeads();
  if (tabName === 'students') loadStudents();
  if (tabName === 'cloud') {
    loadCloudStatus();
    renderPlaybook();
  }
}

/**
 * 1. TẢI THỐNG KÊ KPI 100 HỌC VIÊN / THÁNG & SỐ LIỆU RIÊNG CỦA 2 PHÂN HỆ (B2B vs B2C)
 */
async function loadDashboardKpi() {
  try {
    const res = await fetch('/api/dashboard/kpi');
    const data = await res.json();

    document.getElementById('kpiMonthLabel').textContent = data.month;
    document.getElementById('kpiEnrolledCount').textContent = data.enrolled_count;
    document.getElementById('kpiPercent').textContent = data.kpi_percentage;
    document.getElementById('kpiProgressBar').style.width = `${data.kpi_percentage}%`;
    document.getElementById('kpiTodayOutreach').textContent = data.today_outreach;

    const b2b = data.b2b_hub || {};
    const b2c = data.b2c_hub || {};

    document.getElementById('navB2BCount').textContent = b2b.total || 0;
    document.getElementById('navB2CCount').textContent = b2c.total || 0;
    document.getElementById('navTotalStudents').textContent = data.enrolled_count || 0;

    // Số liệu Phân hệ 1: Cơ sở Tập luyện B2B
    document.getElementById('b2bStatTotal').textContent = b2b.total || 0;
    document.getElementById('b2bStatPotential').textContent = b2b.potential_students || 0;
    document.getElementById('b2bStatNew').textContent = b2b.new || 0;
    document.getElementById('b2bStatContacted').textContent = (b2b.contacted || 0) + (b2b.follow_up || 0);
    document.getElementById('b2bStatInterested').textContent = b2b.interested || 0;
    document.getElementById('b2bStatDue').textContent = b2b.due_today || 0;
    document.getElementById('b2bStatWon').textContent = b2b.closed_won || 0;

    // Số liệu Phân hệ 2: Khách hàng Cá nhân B2C
    document.getElementById('b2cStatTotal').textContent = b2c.total || 0;
    document.getElementById('b2cStatNew').textContent = b2c.new || 0;
    document.getElementById('b2cStatContacted').textContent = (b2c.contacted || 0) + (b2c.follow_up || 0);
    document.getElementById('b2cStatInterested').textContent = b2c.interested || 0;
    document.getElementById('b2cStatDue').textContent = b2c.due_today || 0;
    document.getElementById('b2cStatWon').textContent = b2c.closed_won || 0;

    renderHeaderCloudBadge(data.cloud_status);
  } catch (err) {
    console.error('KPI load error:', err);
  }
}

function renderHeaderCloudBadge(cs) {
  if (!cs) return;
  const badge = document.getElementById('headerCloudBadge');
  if (cs.configured && cs.connected) {
    badge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold';
    badge.textContent = `☁️ Cloud DB: Đã đồng bộ (${cs.deviceName})`;
  } else if (cs.configured && !cs.connected) {
    badge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold';
    badge.textContent = `☁️ Cloud DB: Chờ kết nối`;
  } else {
    badge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700 font-semibold hover:border-cyan-400';
    badge.textContent = `📱 Đa thiết bị / Cloud DB: Bấm để cấu hình`;
  }
}

/**
 * ====================================================================================
 * PHÂN HỆ 1: PHƯƠNG ÁN CƠ SỞ TẬP LUYỆN (B2B FACILITIES HUB)
 * ====================================================================================
 */
function setB2BQuickFilter(mode) {
  const approachEl = document.getElementById('b2bFilterApproach');
  const statusEl = document.getElementById('b2bFilterStatus');
  approachEl.value = '';
  statusEl.value = '';

  if (mode === 'uncontacted') approachEl.value = 'uncontacted';
  else if (mode === 'contacted_before') approachEl.value = 'contacted_before';
  else if (mode === 'due_followup') approachEl.value = 'due_followup';
  else if (mode === 'interested') statusEl.value = 'interested';
  else if (mode === 'closed_won') statusEl.value = 'closed_won';

  loadB2BLeads();
}

async function loadB2BLeads() {
  const search = document.getElementById('b2bFilterSearch').value;
  const source = document.getElementById('b2bFilterSource') ? document.getElementById('b2bFilterSource').value : '';
  const sport = document.getElementById('b2bFilterSport').value;
  const approach = document.getElementById('b2bFilterApproach').value;
  const status = document.getElementById('b2bFilterStatus').value;
  const province = document.getElementById('b2bFilterProvince').value;

  const qs = new URLSearchParams({
    lead_type: 'B2B',
    search,
    source,
    sport_category: sport,
    approach_filter: approach,
    status,
    province
  });

  const res = await fetch(`/api/leads?${qs.toString()}`);
  const data = await res.json();
  const tbody = document.getElementById('b2bTableBody');

  if (!data.leads || data.leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-slate-400">
          Chưa có Cơ sở tập luyện (B2B) nào khớp bộ lọc. Hãy bấm nút <b>"🔍 Quét Cơ Sở B2B Ngay"</b> ở khung phía trên để quét Kênh Tuyển Sinh hoặc Google Maps!
        </td>
      </tr>
    `;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  tbody.innerHTML = data.leads.map((l) => {
    const sportInfo = SPORT_LABELS[l.sport_category] || SPORT_LABELS.gym;
    const statusInfo = STATUS_LABELS[l.status] || STATUS_LABELS.new;
    const isDue = l.next_follow_up_at && l.next_follow_up_at <= today && l.status !== 'closed_won' && l.status !== 'closed_lost';
    const isAdmissions = (l.source && l.source.includes('admissions')) || l.lead_intent === 'admissions' || l.evidence_type === 'admissions_announcement';

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">🏢 CƠ SỞ B2B</span>
            ${isAdmissions ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">📢 TUYỂN SINH</span>` : `<span class="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">📍 MAPS</span>`}
            <button onclick="openLeadDetail(${l.id})" class="font-bold text-white hover:text-purple-300 text-left">
              ${escapeHtml(l.name)}
            </button>
          </div>
          <div class="text-xs text-slate-400 mt-1">📍 ${escapeHtml(l.address || l.province || 'Chưa rõ địa chỉ')}</div>
          ${isAdmissions && l.evidence_snippet ? `<div class="text-[11px] text-amber-200/90 mt-1 line-clamp-1 italic bg-amber-950/20 px-2 py-0.5 rounded border border-amber-500/20">📢 "${escapeHtml(l.evidence_snippet)}"</div>` : ''}
          ${l.contact_person ? `<div class="text-xs text-purple-300 mt-0.5">👤 Quản lý: ${escapeHtml(l.contact_person)}</div>` : ''}
        </td>

        <td class="py-3.5 px-3">
          <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${sportInfo.badge}">
            ${sportInfo.icon} ${sportInfo.name}
          </span>
        </td>

        <td class="py-3.5 px-3">
          ${l.phone ? `
            <div class="font-mono font-bold text-emerald-400 text-sm">${escapeHtml(l.phone)}</div>
          ` : `<div class="text-xs text-slate-500">Chưa có SĐT</div>`}
          <div class="flex items-center gap-2 mt-1">
            ${l.is_mobile ? `<button onclick="openLeadDetail(${l.id})" class="text-[11px] px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white">💬 Zalo Chủ cơ sở</button>` : ''}
            ${l.evidence_url || l.facebook_url || l.website ? `<a href="${escapeHtml(l.evidence_url || l.facebook_url || l.website)}" target="_blank" class="text-[11px] text-indigo-400 hover:underline">Bài viết/Web</a>` : ''}
          </div>
        </td>

        <td class="py-3.5 px-3 text-xs">
          <div class="text-white font-semibold">Dự kiến chốt: <span class="text-purple-300 font-bold">~${l.expected_students || 3} HV</span></div>
          ${l.rating > 0 ? `<div class="text-amber-400 mt-0.5">⭐ ${l.rating} (${l.review_count || 0} đánh giá Maps)</div>` : '<div class="text-slate-500 mt-0.5">Cơ sở địa phương</div>'}
          ${l.enrolled_students_count > 0 ? `<div class="text-emerald-400 font-bold mt-0.5">🎓 Đã chốt: ${l.enrolled_students_count} HV</div>` : ''}
        </td>

        <td class="py-3.5 px-3">
          <span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusInfo.cls}">
            ${statusInfo.text}
          </span>
          <div class="text-[11px] text-slate-400 mt-1">
            ${l.outreach_count > 0 ? `✅ Đã gọi/nhắn <b>${l.outreach_count} lần</b>` : `<span class="text-blue-400">🆕 Chưa từng liên hệ</span>`}
          </div>
        </td>

        <td class="py-3.5 px-3 max-w-xs">
          ${l.next_follow_up_at ? `
            <div class="text-xs font-semibold mb-1 ${isDue ? 'text-rose-400' : 'text-amber-300'}">
              ⏰ Hẹn: ${l.next_follow_up_at} ${isDue ? '(Hôm nay!)' : ''}
            </div>
          ` : ''}
          <div class="text-xs text-slate-300 line-clamp-2">${escapeHtml(l.notes || 'Chưa có ghi chú')}</div>
        </td>

        <td class="py-3.5 px-4 text-right whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5">
            <button onclick="openLeadDetail(${l.id})"
              class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white shadow">
              🏢 Tư vấn Chủ Cơ Sở
            </button>
            <button onclick="deleteLead(${l.id}, '${escapeHtml(l.name).replace(/'/g, "\\'")}')" title="Xóa cơ sở này"
              class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-xs font-bold text-rose-400 hover:text-white border border-slate-700 transition">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateB2BCrawlKeyword() {
  const sport = document.getElementById('b2bCrawlSport').value;
  const mode = document.getElementById('b2bCrawlMode') ? document.getElementById('b2bCrawlMode').value : 'b2b_admissions';

  const admissionsMap = {
    gym: 'Chiêu sinh phòng gym thể hình',
    yoga: 'Chiêu sinh lớp Yoga trị liệu',
    dance: 'Chiêu sinh CLB Dân vũ Zumba',
    martial_arts: 'Chiêu sinh lớp võ cổ truyền'
  };

  const mapsMap = {
    gym: 'Phòng tập Gym Fitness',
    yoga: 'Phòng tập Yoga Pilates Studio',
    dance: 'CLB Zumba Shuffle Dance Dân vũ',
    martial_arts: 'Võ đường Võ cổ truyền Kickfit'
  };

  if (mode === 'b2b_maps') {
    document.getElementById('b2bCrawlKeyword').value = mapsMap[sport] || 'Phòng tập Gym Fitness';
  } else {
    document.getElementById('b2bCrawlKeyword').value = admissionsMap[sport] || 'Chiêu sinh CLB thể thao';
  }
}

async function startB2BCrawl() {
  const crawlMode = document.getElementById('b2bCrawlMode') ? document.getElementById('b2bCrawlMode').value : 'b2b_admissions';
  const sportCategory = document.getElementById('b2bCrawlSport').value;
  const keyword = document.getElementById('b2bCrawlKeyword').value.trim();
  const province = document.getElementById('b2bCrawlProvince').value.trim();
  const maxResults = Number(document.getElementById('b2bCrawlMax').value || 20);

  if (!province) {
    showToast('Vui lòng nhập Quận/Huyện hoặc Tỉnh/Thành để quét Cơ sở B2B!', true);
    return;
  }

  const res = await fetch('/api/crawler/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sportCategory,
      keyword,
      province,
      targetMode: crawlMode,
      platforms: crawlMode === 'b2b_maps' ? ['google_maps'] : ['facebook', 'web', 'zalo'],
      maxResults
    })
  });

  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Không thể bắt đầu quét', true);
    return;
  }

  const modeLabel = crawlMode === 'b2b_admissions'
    ? 'các Kênh Tuyển Sinh & Chiêu Sinh'
    : (crawlMode === 'b2b_all' ? 'Toàn diện (Maps + Tuyển Sinh)' : 'Google Maps');
  showToast(`🔍 Đang quét Cơ sở B2B trên ${modeLabel}...`);
  startPollingCrawl('b2bCrawlLiveBar');
}

/**
 * ====================================================================================
 * PHÂN HỆ 2: PHƯƠNG ÁN KHÁCH HÀNG CÁ NHÂN & KHO BẰNG CHỨNG BÀI VIẾT MXH (B2C HUB)
 * ====================================================================================
 */
function setB2CQuickFilter(mode) {
  const approachEl = document.getElementById('b2cFilterApproach');
  approachEl.value = '';

  if (mode === 'uncontacted') approachEl.value = 'uncontacted';
  else if (mode === 'contacted_before') approachEl.value = 'contacted_before';
  else if (mode === 'due_followup') approachEl.value = 'due_followup';

  loadB2CLeads(mode === 'interested' ? 'interested' : (mode === 'closed_won' ? 'closed_won' : ''));
}

async function loadB2CLeads(forceStatus = '') {
  const search = document.getElementById('b2cFilterSearch').value;
  const platform = document.getElementById('b2cFilterPlatform').value;
  const evidence_type = document.getElementById('b2cFilterEvidence').value;
  const sport = document.getElementById('b2cFilterSport').value;
  const approach = document.getElementById('b2cFilterApproach').value;

  const qs = new URLSearchParams({
    lead_type: 'B2C',
    search,
    platform,
    evidence_type,
    sport_category: sport,
    approach_filter: approach,
    status: forceStatus
  });

  const res = await fetch(`/api/leads?${qs.toString()}`);
  const data = await res.json();
  const tbody = document.getElementById('b2cTableBody');

  if (!data.leads || data.leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-slate-400">
          Chưa có Khách hàng Cá nhân (B2C) nào khớp bộ lọc. Hãy chọn các nền tảng (Facebook, Zalo, Threads, TikTok...) ở trên và bấm <b>"🔍 Săn Cá Nhân & Lưu Bằng Chứng"</b>!
        </td>
      </tr>
    `;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  tbody.innerHTML = data.leads.map((l) => {
    const sportInfo = SPORT_LABELS[l.sport_category] || SPORT_LABELS.gym;
    const pfInfo = PLATFORM_LABELS[l.platform] || PLATFORM_LABELS.web;
    const evInfo = EVIDENCE_TYPE_LABELS[l.evidence_type] || EVIDENCE_TYPE_LABELS.post_teaching;
    const statusInfo = STATUS_LABELS[l.status] || STATUS_LABELS.new;
    const isDue = l.next_follow_up_at && l.next_follow_up_at <= today && l.status !== 'closed_won' && l.status !== 'closed_lost';
    const evidenceLink = l.evidence_url || l.social_url || l.facebook_url || '';

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <!-- Cột 1: Tên cá nhân & Nick MXH -->
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">👤 CÁ NHÂN B2C</span>
            <button onclick="openLeadDetail(${l.id})" class="font-bold text-white hover:text-cyan-400 text-left">
              ${escapeHtml(l.name)}
            </button>
          </div>
          ${l.social_handle ? `<div class="text-xs font-mono text-cyan-300 mt-1">${escapeHtml(l.social_handle)}</div>` : ''}
          <div class="text-[11px] text-slate-400 mt-0.5">📍 ${escapeHtml(l.province || 'Việt Nam')} • Điểm: <b class="text-cyan-400">${l.potential_score}/100</b></div>
        </td>

        <!-- Cột 2: Nền tảng & Bộ môn -->
        <td class="py-3.5 px-3 space-y-1.5">
          <div>
            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${pfInfo.cls}">
              ${pfInfo.icon} ${pfInfo.name}
            </span>
          </div>
          <div>
            <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${sportInfo.badge}">
              ${sportInfo.icon} ${sportInfo.name}
            </span>
          </div>
        </td>

        <!-- Cột 3: BẰNG CHỨNG CÁ NHÂN (BÀI VIẾT / VIDEO GỐC TRÊN MXH) -->
        <td class="py-3.5 px-3 max-w-md">
          <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${evInfo.cls}">
                ${evInfo.text}
              </span>
              ${l.evidence_count > 1 ? `<span class="text-[10px] text-cyan-400 font-semibold">+${l.evidence_count} bài viết</span>` : ''}
            </div>
            <div class="text-xs text-slate-200 italic line-clamp-2 leading-relaxed">
              "${escapeHtml(l.evidence_snippet || l.notes || 'Đã thu thập hồ sơ hoạt động thể thao trên MXH')}"
            </div>
            ${evidenceLink ? `
              <div>
                <a href="${escapeHtml(evidenceLink)}" target="_blank" class="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline font-medium">
                  🔗 Xem bài viết / bằng chứng gốc trên ${pfInfo.name} &rarr;
                </a>
              </div>
            ` : ''}
          </div>
        </td>

        <!-- Cột 4: Liên hệ Zalo / DM MXH -->
        <td class="py-3.5 px-3">
          ${l.phone ? `
            <div class="font-mono font-bold text-emerald-400 text-sm">${escapeHtml(l.phone)}</div>
          ` : `
            <div class="text-xs text-amber-300 font-medium">Nhắn qua ${pfInfo.name} DM</div>
          `}
          <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
            ${l.phone ? `
              <button onclick="openLeadDetail(${l.id})" class="text-[11px] px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition">
                💬 Zalo
              </button>
            ` : ''}
            ${evidenceLink ? `
              <a href="${escapeHtml(evidenceLink)}" target="_blank" class="text-[11px] px-2 py-0.5 rounded bg-pink-600/30 text-pink-300 hover:bg-pink-600 hover:text-white transition">
                ${pfInfo.icon} Nhắn ${pfInfo.name}
              </a>
            ` : ''}
          </div>
        </td>

        <!-- Cột 5: Trạng thái & Lịch sử tiếp cận -->
        <td class="py-3.5 px-3">
          <span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusInfo.cls}">
            ${statusInfo.text}
          </span>
          <div class="text-[11px] text-slate-400 mt-1.5">
            ${l.outreach_count > 0
              ? `✅ Đã nhắn <b>${l.outreach_count} lần</b><br/><span class="text-slate-500">${l.last_contacted_at || ''}</span>`
              : `<span class="text-blue-400 font-medium">🆕 Chưa từng nhắn</span>`}
          </div>
          ${l.next_follow_up_at ? `
            <div class="text-[11px] font-semibold mt-1 ${isDue ? 'text-rose-400' : 'text-amber-300'}">
              ⏰ Hẹn: ${l.next_follow_up_at}
            </div>
          ` : ''}
        </td>

        <!-- Cột 6: Nút thao tác -->
        <td class="py-3.5 px-4 text-right whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5">
            <button onclick="openLeadDetail(${l.id})"
              class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow">
              💬 Tư Vấn Theo Bài Viết
            </button>
            <button onclick="deleteLead(${l.id}, '${escapeHtml(l.name).replace(/'/g, "\\'")}')" title="Xóa cá nhân này"
              class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-xs font-bold text-rose-400 hover:text-white border border-slate-700 transition">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateB2CCrawlKeyword() {
  const sport = document.getElementById('b2cCrawlSport').value;
  const mode = document.getElementById('b2cCrawlMode').value;

  const presets = {
    gym: {
      b2c_all: 'PT gym dạy kèm',
      b2c_creators: 'PT gym dạy kèm',
      b2c_job_seekers: 'tuyển PT gym',
      b2c_cert_hunters: 'chứng chỉ PT gym'
    },
    yoga: {
      b2c_all: 'giáo viên Yoga',
      b2c_creators: 'HLV Yoga trị liệu',
      b2c_job_seekers: 'tuyển giáo viên Yoga',
      b2c_cert_hunters: 'chứng chỉ HLV Yoga'
    },
    dance: {
      b2c_all: 'dạy nhảy Zumba',
      b2c_creators: 'dạy nhảy Zumba',
      b2c_job_seekers: 'giáo viên Zumba',
      b2c_cert_hunters: 'chứng chỉ Dân vũ'
    },
    martial_arts: {
      b2c_all: 'võ cổ truyền',
      b2c_creators: 'HLV Kickfit',
      b2c_job_seekers: 'tuyển HLV võ',
      b2c_cert_hunters: 'chứng chỉ võ cổ truyền'
    }
  };

  document.getElementById('b2cCrawlKeyword').value = (presets[sport] && presets[sport][mode]) || 'HLV thể thao';
}

async function startB2CCrawl() {
  const targetMode = document.getElementById('b2cCrawlMode').value;
  const sportCategory = document.getElementById('b2cCrawlSport').value;
  const keyword = document.getElementById('b2cCrawlKeyword').value.trim();
  const province = document.getElementById('b2cCrawlProvince').value.trim();

  const platforms = Array.from(document.querySelectorAll('.b2c-pf-cb:checked')).map(cb => cb.value);
  if (platforms.length === 0) {
    showToast('Vui lòng tích chọn ít nhất 1 nền tảng mạng xã hội (Facebook, Zalo, Threads, TikTok...)!', true);
    return;
  }

  const res = await fetch('/api/crawler/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sportCategory,
      keyword,
      province: province || 'Hà Nội',
      targetMode,
      platforms,
      maxResults: 35
    })
  });

  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Không thể bắt đầu quét', true);
    return;
  }

  showToast(`🌐 Đang săn Khách hàng Cá nhân & Bằng chứng bài viết trên ${platforms.length} nền tảng MXH...`);
  startPollingCrawl('b2cCrawlLiveBar');
}

function startPollingCrawl(barElementId) {
  const bar = document.getElementById(barElementId);
  if (bar) {
    bar.classList.remove('hidden');
    bar.textContent = '⏳ Đang khởi động trình duyệt tự động thu thập dữ liệu...';
  }

  if (crawlPollTimer) clearInterval(crawlPollTimer);
  crawlPollTimer = setInterval(async () => {
    const res = await fetch('/api/crawler/status');
    const state = await res.json();

    if (bar && state.logs && state.logs.length > 0) {
      bar.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
          <span class="font-bold text-white">${state.isRunning ? '⏳ Đang quét & lọc nhiễu trực tiếp...' : '✅ Đã hoàn tất chiến dịch!'}</span>
          <span>Đạt chuẩn: <b>${state.totalFound}</b> | Thêm mới: <b class="text-emerald-400">+${state.newInserted}</b> | Trùng: <b>${state.duplicatesSkipped}</b> | <span class="text-rose-400">Đã lọc bỏ sai môn/rác: <b>${state.rejectedNoise || 0}</b></span></span>
        </div>
        <div class="text-slate-300 truncate">${escapeHtml(state.logs[0] || '')}</div>
      `;
    }

    if (!state.isRunning) {
      clearInterval(crawlPollTimer);
      crawlPollTimer = null;
      loadDashboardKpi();
      loadB2BLeads();
      loadB2CLeads();
      showToast(`Hoàn tất! Đã thêm +${state.newInserted} hồ sơ mới vào hệ thống.`);
    }
  }, 1500);
}

/**
 * ====================================================================================
 * 3. CỬA SỔ CHI TIẾT HỒ SƠ + KHO BẰNG CHỨNG BÀI VIẾT CÁ NHÂN + LỊCH SỬ TIẾP CẬN
 * ====================================================================================
 */
async function openLeadDetail(leadId) {
  const res = await fetch(`/api/leads/${leadId}`);
  const data = await res.json();
  if (!data.lead) return;

  currentSelectedLead = data.lead;
  const l = data.lead;
  const sportInfo = SPORT_LABELS[l.sport_category] || SPORT_LABELS.gym;
  const pfInfo = PLATFORM_LABELS[l.platform] || PLATFORM_LABELS.web;

  document.getElementById('modalLeadSportBadge').textContent = `${sportInfo.icon} ${sportInfo.name} (${l.lead_type === 'B2C' ? 'Phương án 2: Cá nhân B2C' : 'Phương án 1: Cơ sở B2B'})`;
  document.getElementById('modalLeadPlatformBadge').textContent = `${pfInfo.icon} ${pfInfo.name} ${l.social_handle || ''}`;
  document.getElementById('modalLeadName').textContent = l.name;
  document.getElementById('modalLeadAddress').textContent = `📍 ${l.province || l.address || ''} | 📞 SĐT: ${l.phone || 'Nhắn qua MXH'}`;
  document.getElementById('modalUpdatePhone').value = l.phone || '';
  document.getElementById('logNextFollowUp').value = l.next_follow_up_at || '';
  document.getElementById('logNote').value = '';

  // Tự động chọn kênh liên hệ theo nền tảng
  const channelSelect = document.getElementById('logChannel');
  if (l.phone) channelSelect.value = 'zalo';
  else if (l.platform === 'threads') channelSelect.value = 'threads_dm';
  else if (l.platform === 'tiktok') channelSelect.value = 'tiktok_dm';
  else if (l.platform === 'instagram') channelSelect.value = 'instagram_dm';
  else if (l.platform === 'facebook') channelSelect.value = 'facebook_msg';
  else if (l.platform === 'telegram') channelSelect.value = 'telegram_msg';
  else if (l.platform === 'x') channelSelect.value = 'x_dm';

  // Chọn mẫu kịch bản khớp với Phân hệ (B2C hoặc B2B) và tự động chèn Bằng chứng Bài viết
  const isAdmissions = (l.source && l.source.includes('admissions')) || l.lead_intent === 'admissions' || l.evidence_type === 'admissions_announcement';
  let matchedScript = null;

  if (l.lead_type === 'B2B' && isAdmissions) {
    matchedScript =
      allScripts.find(s => s.target_type === 'B2B' && s.sport_category === l.sport_category && s.title.includes('Tuyển sinh')) ||
      allScripts.find(s => s.target_type === 'B2B' && s.sport_category === l.sport_category) ||
      allScripts.find(s => s.target_type === 'B2B');
  } else {
    matchedScript =
      allScripts.find(s => s.target_type === l.lead_type && s.sport_category === l.sport_category) ||
      allScripts.find(s => s.target_type === l.lead_type) ||
      allScripts[0];
  }

  const shortEvidence = (l.evidence_snippet || l.notes || 'chia sẻ chuyên môn thể thao')
    .replace(/^"|"$/g, '')
    .slice(0, 90);

  if (matchedScript) {
    const personalized = matchedScript.content
      .replace(/\{\{name\}\}/g, l.name)
      .replace(/\{\{handle\}\}/g, l.social_handle || pfInfo.name)
      .replace(/\{\{platform\}\}/g, pfInfo.name)
      .replace(/\{\{evidence\}\}/g, shortEvidence + '...')
      .replace(/\{\{province\}\}/g, l.province || 'Việt Nam');
    document.getElementById('modalGeneratedScript').value = personalized;
  }

  // Nút mở Zalo
  const zaloBtn = document.getElementById('modalZaloDirectBtn');
  if (l.phone) {
    zaloBtn.href = `https://zalo.me/${l.phone}`;
    zaloBtn.classList.remove('opacity-40', 'pointer-events-none');
    zaloBtn.textContent = `💬 Copy & Mở Zalo (${l.phone})`;
  } else if (l.platform === 'zalo' && l.social_url) {
    zaloBtn.href = l.social_url;
    zaloBtn.classList.remove('opacity-40', 'pointer-events-none');
    zaloBtn.textContent = `💬 Copy & Mở Nhóm Zalo`;
  } else {
    zaloBtn.href = '#';
    zaloBtn.classList.add('opacity-40', 'pointer-events-none');
    zaloBtn.textContent = 'Chưa có SĐT Zalo';
  }

  // Nút mở trực tiếp Bài viết Bằng chứng hoặc Profile MXH
  const socialBtn = document.getElementById('modalSocialDirectBtn');
  const externalLink = l.evidence_url || l.social_url || l.facebook_url || l.website || l.google_maps_url;
  if (externalLink) {
    socialBtn.href = externalLink;
    socialBtn.classList.remove('opacity-40', 'pointer-events-none');
    socialBtn.textContent = `${pfInfo.icon} Copy & Mở ${pfInfo.name} (Bài viết/Profile)`;
  } else {
    socialBtn.href = '#';
    socialBtn.classList.add('opacity-40', 'pointer-events-none');
    socialBtn.textContent = 'Không có Link MXH';
  }

  renderModalEvidences(data.evidences || [], l);
  renderOutreachTimeline(data.logs || []);
  renderModalLeadStudents(data.students || []);

  document.getElementById('leadDetailModal').classList.remove('hidden');
}

function closeLeadDetailModal() {
  document.getElementById('leadDetailModal').classList.add('hidden');
  currentSelectedLead = null;
}

function copyGeneratedScript() {
  const txt = document.getElementById('modalGeneratedScript').value;
  navigator.clipboard.writeText(txt);
  showToast('Đã copy kịch bản tư vấn (kèm bằng chứng bài viết) vào bộ nhớ tạm!');
}

function renderModalEvidences(evidences, lead) {
  const box = document.getElementById('modalEvidencesList');
  const list = [...evidences];

  if (list.length === 0 && lead.evidence_snippet) {
    list.push({
      platform: lead.platform,
      evidence_type: lead.evidence_type,
      content_snippet: lead.evidence_snippet,
      post_url: lead.evidence_url || lead.social_url,
      captured_at: lead.created_at
    });
  }

  if (list.length === 0) {
    box.innerHTML = `<div class="text-xs text-slate-500 italic">Chưa có bài viết bằng chứng nào được lưu. Bạn có thể dán thêm bài viết/video của khách ở bên dưới.</div>`;
    return;
  }

  box.innerHTML = list.map((ev) => {
    const evInfo = EVIDENCE_TYPE_LABELS[ev.evidence_type] || EVIDENCE_TYPE_LABELS.post_teaching;
    const pfInfo = PLATFORM_LABELS[ev.platform] || PLATFORM_LABELS.web;
    return `
      <div class="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded border ${evInfo.cls}">${pfInfo.icon} ${evInfo.text}</span>
          <span class="text-[10px] text-slate-500">${ev.captured_at || ''}</span>
        </div>
        <div class="text-slate-200 italic leading-relaxed">"${escapeHtml(ev.content_snippet)}"</div>
        ${ev.post_url ? `
          <div>
            <a href="${escapeHtml(ev.post_url)}" target="_blank" class="text-[11px] text-cyan-400 hover:underline font-semibold">
              🔗 Mở xem bài viết / video bằng chứng gốc &rarr;
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function submitNewEvidence() {
  if (!currentSelectedLead) return;
  const content_snippet = document.getElementById('newEvSnippet').value.trim();
  const post_url = document.getElementById('newEvUrl').value.trim();

  if (!content_snippet) {
    showToast('Vui lòng nhập nội dung trích dẫn bài viết bằng chứng!', true);
    return;
  }

  const res = await fetch(`/api/leads/${currentSelectedLead.id}/evidences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: currentSelectedLead.platform || 'facebook',
      evidence_type: 'post_teaching',
      content_snippet,
      post_url
    })
  });

  const data = await res.json();
  if (res.ok) {
    document.getElementById('newEvSnippet').value = '';
    document.getElementById('newEvUrl').value = '';
    renderModalEvidences(data.evidences || [], data.lead);
    showToast('📌 Đã lưu thêm bằng chứng bài viết cho cá nhân này!');
    loadB2CLeads();
  }
}

function renderOutreachTimeline(logs) {
  const box = document.getElementById('modalOutreachTimeline');
  if (!logs || logs.length === 0) {
    box.innerHTML = `<div class="text-xs text-slate-500 italic">Chưa có lịch sử liên hệ nào.</div>`;
    return;
  }

  box.innerHTML = logs.map((item) => `
    <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1">
      <div class="flex items-center justify-between">
        <span class="font-bold text-cyan-300 uppercase">[${escapeHtml(item.channel)}] ${OUTCOME_LABELS[item.outcome] || item.outcome}</span>
        <span class="text-slate-500">${item.created_at}</span>
      </div>
      ${item.note ? `<div class="text-slate-200">${escapeHtml(item.note)}</div>` : ''}
      ${item.next_follow_up_date ? `<div class="text-amber-400">⏰ Hẹn liên hệ lại: ${item.next_follow_up_date}</div>` : ''}
    </div>
  `).join('');
}

function renderModalLeadStudents(students) {
  const box = document.getElementById('modalLeadStudents');
  if (!students || students.length === 0) {
    box.innerHTML = `<div class="text-xs text-slate-500 italic">Chưa có học viên nào được chốt từ hồ sơ này.</div>`;
    return;
  }

  box.innerHTML = students.map(s => `
    <div class="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-700/40 flex items-center justify-between text-xs">
      <div>
        <div class="font-bold text-emerald-300">🎓 ${escapeHtml(s.full_name)} (${escapeHtml(s.phone)})</div>
        <div class="text-slate-400">Khóa: ${SPORT_LABELS[s.sport_course]?.name || s.sport_course} | Tháng KPI: ${s.batch_month}</div>
      </div>
      <div class="text-right font-semibold text-white">Đã thu: ${formatMoney(s.paid_amount)}</div>
    </div>
  `).join('');
}

async function submitOutreachLog() {
  if (!currentSelectedLead) return;

  const channel = document.getElementById('logChannel').value;
  const outcome = document.getElementById('logOutcome').value;
  const next_follow_up_date = document.getElementById('logNextFollowUp').value;
  const updatedPhone = document.getElementById('modalUpdatePhone').value.trim();
  const note = document.getElementById('logNote').value;

  if (updatedPhone && updatedPhone !== currentSelectedLead.phone) {
    await fetch(`/api/leads/${currentSelectedLead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: updatedPhone })
    });
  }

  const res = await fetch(`/api/leads/${currentSelectedLead.id}/outreach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, outcome, note, next_follow_up_date })
  });

  const data = await res.json();
  if (data.logs) {
    renderOutreachTimeline(data.logs);
    document.getElementById('logNote').value = '';
    showToast('Đã lưu lịch sử tiếp cận & tự động đồng bộ Cloud!');
    loadDashboardKpi();
    loadB2BLeads();
    loadB2CLeads();
  }
}

/**
 * ====================================================================================
 * 4. PHÂN HỆ 3: QUẢN LÝ 100 HỌC VIÊN ĐÃ CHỐT & HỒ SƠ VTC
 * ====================================================================================
 */
function openEnrollModalFromLead() {
  if (!currentSelectedLead) return;
  openEnrollModal(currentSelectedLead);
}

function openEnrollModal(lead = null) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  document.getElementById('enrollBatchMonth').value = currentMonth;
  document.getElementById('enrollLeadId').value = lead ? lead.id : '';
  document.getElementById('enrollFullName').value = lead ? lead.name : '';
  document.getElementById('enrollPhone').value = lead ? (lead.phone || '') : '';
  document.getElementById('enrollSport').value = lead ? lead.sport_category : 'gym';
  document.getElementById('enrollNotes').value = lead
    ? `Nguồn: [${lead.lead_type} - ${lead.platform.toUpperCase()}] ${lead.social_handle || lead.name}`
    : '';
  document.getElementById('enrollModal').classList.remove('hidden');
}

function closeEnrollModal() {
  document.getElementById('enrollModal').classList.add('hidden');
}

async function submitEnrollStudent() {
  const payload = {
    lead_id: document.getElementById('enrollLeadId').value || null,
    full_name: document.getElementById('enrollFullName').value.trim(),
    phone: document.getElementById('enrollPhone').value.trim(),
    sport_course: document.getElementById('enrollSport').value,
    batch_month: document.getElementById('enrollBatchMonth').value,
    tuition_fee: Number(document.getElementById('enrollTuition').value || 6500000),
    discount_amount: Number(document.getElementById('enrollDiscount').value || 0),
    paid_amount: Number(document.getElementById('enrollPaid').value || 0),
    doc_form: document.getElementById('enrollDocForm').checked ? 1 : 0,
    doc_cccd: document.getElementById('enrollDocCccd').checked ? 1 : 0,
    doc_diploma: document.getElementById('enrollDocDiploma').checked ? 1 : 0,
    doc_photo: document.getElementById('enrollDocPhoto').checked ? 1 : 0,
    notes: document.getElementById('enrollNotes').value.trim()
  };

  if (!payload.full_name || !payload.phone) {
    showToast('Vui lòng nhập Họ tên và Số điện thoại học viên!', true);
    return;
  }

  const res = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    closeEnrollModal();
    showToast('🎉 Chúc mừng! Đã thêm học viên mới vào KPI 100 HV/Tháng!');
    loadDashboardKpi();
    loadB2BLeads();
    loadB2CLeads();
    loadStudents();
    if (currentSelectedLead) openLeadDetail(currentSelectedLead.id);
  }
}

async function loadStudents() {
  const month = document.getElementById('studentFilterMonth').value;
  const sport = document.getElementById('studentFilterSport').value;
  const qs = new URLSearchParams({ batch_month: month, sport_course: sport });

  const res = await fetch(`/api/students?${qs.toString()}`);
  const data = await res.json();
  const tbody = document.getElementById('studentsTableBody');

  if (!data.students || data.students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-slate-400">
          Chưa có học viên nào trong bộ lọc này. Hãy bấm <b>"+ Thêm Học Viên Đã Chốt Đơn"</b>!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.students.map((s) => {
    const sportInfo = SPORT_LABELS[s.sport_course] || SPORT_LABELS.gym;
    return `
      <tr class="hover:bg-slate-800/50">
        <td class="py-3 px-4">
          <div class="font-bold text-white">${escapeHtml(s.full_name)}</div>
          <div class="text-xs font-mono text-emerald-400">${escapeHtml(s.phone)}</div>
        </td>
        <td class="py-3 px-3 text-xs text-slate-300">
          <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${s.organization_type === 'B2B' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'}">
            ${s.organization_type === 'B2B' ? '🏢 Cơ sở B2B' : '👤 Cá nhân B2C'}
          </span>
          <div class="mt-1">${escapeHtml(s.organization_name || 'Đăng ký trực tiếp')}</div>
        </td>
        <td class="py-3 px-3">
          <span class="text-xs font-semibold px-2 py-0.5 rounded border ${sportInfo.badge}">
            ${sportInfo.icon} ${sportInfo.name}
          </span>
          <div class="text-xs text-cyan-400 mt-1 font-semibold">Tháng KPI: ${s.batch_month}</div>
        </td>
        <td class="py-3 px-3 text-xs">
          <div class="text-slate-300">Phải thu: <b>${formatMoney(s.tuition_fee - s.discount_amount)}</b></div>
          <div class="text-emerald-400 font-bold">Đã đóng: ${formatMoney(s.paid_amount)}</div>
        </td>
        <td class="py-3 px-3 text-xs">
          <div class="flex flex-wrap gap-1.5">
            <button onclick="toggleStudentDoc(${s.id}, 'doc_form', ${s.doc_form ? 0 : 1})"
              class="px-2 py-0.5 rounded border ${s.doc_form ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}">
              ${s.doc_form ? '✓' : '○'} Đơn ĐK
            </button>
            <button onclick="toggleStudentDoc(${s.id}, 'doc_cccd', ${s.doc_cccd ? 0 : 1})"
              class="px-2 py-0.5 rounded border ${s.doc_cccd ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}">
              ${s.doc_cccd ? '✓' : '○'} CCCD
            </button>
            <button onclick="toggleStudentDoc(${s.id}, 'doc_diploma', ${s.doc_diploma ? 0 : 1})"
              class="px-2 py-0.5 rounded border ${s.doc_diploma ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}">
              ${s.doc_diploma ? '✓' : '○'} Bằng cấp
            </button>
            <button onclick="toggleStudentDoc(${s.id}, 'doc_photo', ${s.doc_photo ? 0 : 1})"
              class="px-2 py-0.5 rounded border ${s.doc_photo ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}">
              ${s.doc_photo ? '✓' : '○'} Ảnh 3x4
            </button>
          </div>
        </td>
        <td class="py-3 px-3 text-xs">
          <select onchange="updateStudentExamStatus(${s.id}, this.value)"
            class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white">
            <option value="waiting" ${s.exam_status === 'waiting' ? 'selected' : ''}>Chờ mở lớp</option>
            <option value="studying_online" ${s.exam_status === 'studying_online' ? 'selected' : ''}>Đang học Lý thuyết Online</option>
            <option value="tested" ${s.exam_status === 'tested' ? 'selected' : ''}>Đã thi Thực hành</option>
            <option value="certified" ${s.exam_status === 'certified' ? 'selected' : ''}>Đã nhận Chứng chỉ Cục TDTT</option>
          </select>
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="deleteStudent(${s.id})" class="text-xs text-rose-400 hover:underline">Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function toggleStudentDoc(id, field, val) {
  await fetch(`/api/students/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: val })
  });
  loadStudents();
}

async function updateStudentExamStatus(id, exam_status) {
  await fetch(`/api/students/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exam_status })
  });
  showToast('Đã cập nhật trạng thái học & thi của học viên!');
}

async function deleteStudent(id) {
  if (!confirm('Bạn có chắc muốn xóa học viên này?')) return;
  await fetch(`/api/students/${id}`, { method: 'DELETE' });
  loadDashboardKpi();
  loadStudents();
}

/**
 * ====================================================================================
 * 5. PHÂN HỆ 4: KẾT NỐI CLOUD DATABASE ĐA THIẾT BỊ (SUPABASE / NEON) & KỊCH BẢN
 * ====================================================================================
 */
async function loadCloudStatus() {
  const res = await fetch('/api/cloud/status');
  const cs = await res.json();

  document.getElementById('cloudDeviceName').value = cs.deviceName || '';
  document.getElementById('cloudMaskedUrlLabel').textContent = cs.maskedUrl
    ? `Đang cấu hình: ${cs.maskedUrl}`
    : 'Chưa cấu hình chuỗi DATABASE_URL.';

  const badge = document.getElementById('cloudStatusBadge');
  if (cs.configured && cs.connected) {
    badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    badge.textContent = '✅ Đã kết nối Cloud PostgreSQL';
  } else if (cs.configured) {
    badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40';
    badge.textContent = '⚠️ Cần kiểm tra chuỗi kết nối';
  } else {
    badge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300';
    badge.textContent = 'Chế độ Local SQLite';
  }

  const lanBox = document.getElementById('lanUrlsBox');
  if (cs.lanUrls && cs.lanUrls.length > 0) {
    lanBox.innerHTML = cs.lanUrls.map((u) => `
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono font-bold text-emerald-400 text-sm">${escapeHtml(u)}</span>
        <button onclick="navigator.clipboard.writeText('${u}'); showToast('Đã copy link mở trên Điện thoại/Laptop khác!');"
          class="px-2.5 py-1 rounded bg-emerald-600/30 text-emerald-300 text-xs font-semibold hover:bg-emerald-600 hover:text-white">
          📋 Copy Link LAN
        </button>
      </div>
    `).join('');
  } else {
    lanBox.innerHTML = `<div class="text-xs text-slate-400">Truy cập tại: <b>http://localhost:3000</b></div>`;
  }

  renderHeaderCloudBadge(cs);
}

async function saveAndSyncCloud() {
  const device_name = document.getElementById('cloudDeviceName').value.trim();
  const cloud_postgres_url = document.getElementById('cloudPostgresUrl').value.trim();
  const box = document.getElementById('cloudSyncResultBox');

  box.innerHTML = `<div class="text-cyan-300 font-semibold">⏳ Đang kết nối tới Cloud PostgreSQL và đồng bộ dữ liệu 2 chiều...</div>`;

  const res = await fetch('/api/cloud/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_name, cloud_postgres_url })
  });

  const data = await res.json();
  await loadCloudStatus();

  if (data.syncResult && data.syncResult.connected) {
    box.innerHTML = `
      <div class="text-emerald-400 font-bold">✅ Đồng bộ Cloud PostgreSQL thành công lúc ${data.syncResult.lastSyncedAt}!</div>
      <div>• Đã đẩy lên Cloud: <b>${data.syncResult.pushedLeads} hồ sơ</b> & <b>${data.syncResult.pushedStudents} học viên</b></div>
      <div>• Đã tải mới từ thiết bị khác về máy: <b>+${data.syncResult.pulledLeads} hồ sơ</b> & <b>+${data.syncResult.pulledStudents} học viên</b></div>
    `;
    showToast('☁️ Đã kết nối và đồng bộ dữ liệu Cloud thành công!');
    loadDashboardKpi();
    loadB2BLeads();
    loadB2CLeads();
  } else if (data.syncResult && data.syncResult.lastError) {
    box.innerHTML = `<div class="text-rose-400 font-bold">❌ Lỗi kết nối Cloud: ${escapeHtml(data.syncResult.lastError)}</div>`;
    showToast('Không thể kết nối Cloud DB. Vui lòng kiểm tra lại DATABASE_URL!', true);
  } else {
    box.innerHTML = `<div class="text-slate-300">Đã lưu tên thiết bị (${escapeHtml(device_name)}).</div>`;
  }
}

async function triggerManualSync() {
  const box = document.getElementById('cloudSyncResultBox');
  box.innerHTML = `<div class="text-cyan-300 font-semibold">🔄 Đang đồng bộ dữ liệu 2 chiều với Cloud PostgreSQL...</div>`;

  const res = await fetch('/api/cloud/sync', { method: 'POST' });
  const data = await res.json();
  await loadCloudStatus();

  if (data.syncResult && data.syncResult.connected) {
    box.innerHTML = `
      <div class="text-emerald-400 font-bold">✅ Đồng bộ hoàn tất lúc ${data.syncResult.lastSyncedAt}!</div>
      <div>• Đã đẩy lên Cloud: <b>${data.syncResult.pushedLeads} hồ sơ</b> | Tải mới về: <b>+${data.syncResult.pulledLeads} hồ sơ</b></div>
    `;
    showToast('🔄 Đã đồng bộ dữ liệu mới nhất từ Cloud!');
    loadDashboardKpi();
    loadB2BLeads();
    loadB2CLeads();
    loadStudents();
  } else {
    box.innerHTML = `<div class="text-amber-400">${escapeHtml(data.syncResult?.lastError || 'Chưa cấu hình Cloud DB')}</div>`;
  }
}

/**
 * 6. THÊM HỒ SƠ THỦ CÔNG & KHO KỊCH BẢN
 */
function openAddLeadModal(defaultType = 'B2C') {
  document.getElementById('newLeadType').value = defaultType;
  document.getElementById('newLeadPlatform').value = defaultType === 'B2B' ? 'google_maps' : 'threads';
  document.getElementById('addLeadModalTitle').textContent =
    defaultType === 'B2B'
      ? '+ Thêm Cơ Sở Tập Luyện Mới (Phương án 1 - B2B)'
      : '+ Thêm Khách Hàng Cá Nhân & Bằng Chứng Bài Viết (Phương án 2 - B2C)';
  document.getElementById('addLeadModal').classList.remove('hidden');
}

function closeAddLeadModal() {
  document.getElementById('addLeadModal').classList.add('hidden');
}

async function submitNewLead() {
  const lead_type = document.getElementById('newLeadType').value;
  const platform = document.getElementById('newLeadPlatform').value;
  const name = document.getElementById('newLeadName').value.trim();
  const phone = document.getElementById('newLeadPhone').value.trim();
  const social_handle = document.getElementById('newLeadHandle').value.trim();
  const sport_category = document.getElementById('newLeadSport').value;
  const province = document.getElementById('newLeadProvince').value.trim();
  const evidence_snippet = document.getElementById('newLeadEvidenceSnippet').value.trim();
  const evidence_url = document.getElementById('newLeadEvidenceUrl').value.trim();

  if (!name) {
    showToast('Vui lòng nhập Tên cá nhân hoặc Tên phòng tập/CLB!', true);
    return;
  }

  const res = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_type,
      platform,
      name,
      phone,
      social_handle,
      sport_category,
      province,
      social_url: evidence_url,
      evidence_snippet,
      evidence_url,
      notes: evidence_snippet
    })
  });

  const data = await res.json();
  if (res.ok) {
    closeAddLeadModal();
    if (data.result?.action === 'skipped_duplicate') {
      showToast('Hồ sơ đã tồn tại — Đã tự động cộng thêm Bằng chứng bài viết mới vào hồ sơ!', false);
    } else {
      showToast(`Đã thêm mới vào Phân hệ ${lead_type}!`);
    }
    loadDashboardKpi();
    loadB2BLeads();
    loadB2CLeads();
  }
}

async function loadScripts() {
  const res = await fetch('/api/scripts');
  const data = await res.json();
  allScripts = data.scripts || [];
  renderPlaybook();
}

function renderPlaybook() {
  const box = document.getElementById('playbookList');
  if (!box) return;
  box.innerHTML = allScripts.map((s) => `
    <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
      <div>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded ${s.target_type === 'B2B' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'} uppercase">
              ${s.target_type === 'B2B' ? '🏢 Phương án 1: Cơ sở B2B' : '👤 Phương án 2: Cá nhân B2C'}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">${s.sport_category}</span>
          </div>
          <button onclick="navigator.clipboard.writeText(${JSON.stringify(s.content).replace(/"/g, '&quot;')}); showToast('Đã copy mẫu kịch bản!');"
            class="text-xs text-cyan-400 hover:underline">📋 Copy mẫu</button>
        </div>
        <h4 class="font-bold text-sm text-white mt-2">${escapeHtml(s.title)}</h4>
        <pre class="text-xs text-slate-300 whitespace-pre-wrap font-sans mt-2 bg-slate-950 p-3 rounded-lg border border-slate-800/80 leading-relaxed">${escapeHtml(s.content)}</pre>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function deleteLead(leadId, leadName = '') {
  if (!confirm(`Bạn có chắc muốn xóa hồ sơ "${leadName || '#' + leadId}"?`)) return;
  try {
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('🗑️ Đã xóa hồ sơ thành công!');
    if (currentSelectedLead && currentSelectedLead.id === leadId) {
      closeLeadDetailModal();
    }
    await loadDashboardKpi();
    await loadB2BLeads();
    await loadB2CLeads();
  } catch (err) {
    showToast('Lỗi khi xóa hồ sơ!', true);
  }
}

async function deleteCurrentLeadFromModal() {
  if (!currentSelectedLead) return;
  await deleteLead(currentSelectedLead.id, currentSelectedLead.name);
}

async function clearDatabasePrompt(target = 'all') {
  const labels = {
    all: 'TOÀN BỘ dữ liệu hiện tại (Cả Cơ sở B2B, Cá nhân B2C, Học viên & Lịch sử quét)',
    B2B: 'toàn bộ danh sách Cơ sở Tập luyện (B2B)',
    B2C: 'toàn bộ danh sách Khách hàng Cá nhân (B2C)'
  };
  if (!confirm(`⚠️ Bạn có chắc chắn muốn XÓA SẠCH ${labels[target] || labels.all} để quét lại từ đầu không?`)) {
    return;
  }

  showToast('⏳ Đang xóa sạch dữ liệu...');

  try {
    // Cách 1: Gọi API xóa nhanh hàng loạt (/api/data/clear)
    const res = await fetch('/api/data/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });

    if (res.ok) {
      showToast(`🗑️ Đã xóa sạch dữ liệu (${target.toUpperCase()}) thành công!`);
      await loadDashboardKpi();
      await loadB2BLeads();
      await loadB2CLeads();
      await loadStudents();
      return;
    }

    // Cách 2 (Fallback tự động khi máy chủ cũ chưa khởi động lại):
    // Quét danh sách hiện tại và gọi DELETE từng bản ghi qua endpoint /api/leads/:id & /api/students/:id
    if (target === 'all') {
      const stuRes = await fetch('/api/students');
      if (stuRes.ok) {
        const stuData = await stuRes.json();
        for (const s of stuData.students || []) {
          await fetch(`/api/students/${s.id}`, { method: 'DELETE' });
        }
      }
    }

    const leadQuery = (target === 'B2B' || target === 'B2C') ? `?lead_type=${target}` : '';
    const leadsRes = await fetch(`/api/leads${leadQuery}`);
    if (!leadsRes.ok) {
      throw new Error('Không thể kết nối máy chủ để lấy danh sách cần xóa');
    }
    const leadsData = await leadsRes.json();
    const list = leadsData.leads || [];

    // Xóa song song theo lô 15 bản ghi để cực nhanh
    for (let i = 0; i < list.length; i += 15) {
      const batch = list.slice(i, i + 15);
      await Promise.all(batch.map(item => fetch(`/api/leads/${item.id}`, { method: 'DELETE' })));
    }

    showToast(`🗑️ Đã xóa sạch ${list.length} hồ sơ (${target.toUpperCase()}) thành công!`);
    await loadDashboardKpi();
    await loadB2BLeads();
    await loadB2CLeads();
    await loadStudents();
  } catch (err) {
    console.error('Clear database error:', err);
    showToast(`Không thể xóa dữ liệu: ${err.message || 'Vui lòng kiểm tra server'}`, true);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadScripts();
  await loadDashboardKpi();
  await loadB2BLeads();
  await loadB2CLeads();
});
