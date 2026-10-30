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
  tiktok: { name: 'TikTok', cls: 'bg-pink-500/20 text-pink-300 border-pink-500/40', icon: '🎵' },
  facebook: { name: 'Facebook', cls: 'bg-blue-600/20 text-blue-300 border-blue-500/40', icon: '📘' },
  instagram: { name: 'Instagram', cls: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40', icon: '📸' },
  telegram: { name: 'Telegram', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/40', icon: '✈️' },
  x: { name: 'X (Twitter)', cls: 'bg-slate-700 text-slate-200 border-slate-600', icon: '🐦' },
  youtube: { name: 'YouTube', cls: 'bg-red-500/20 text-red-300 border-red-500/40', icon: '▶️' },
  google_maps: { name: 'Google Maps', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: '📍' },
  web: { name: 'Website', cls: 'bg-slate-800 text-slate-300 border-slate-700', icon: '🌐' }
};

const INTENT_LABELS = {
  cert_hunter: { text: '🔥 Đang tìm học chứng chỉ', cls: 'text-rose-400 font-bold' },
  freelance_coach: { text: '👤 HLV / PT Tự do (Creator)', cls: 'text-cyan-300' },
  job_seeker: { text: '💼 Đang tìm việc PT / HLV', cls: 'text-amber-300' },
  facility: { text: '🏢 Cơ sở / CLB Thể thao', cls: 'text-purple-300' }
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
  callback_later: '⏰ Hẹn đợt sau / Đang suy nghĩ',
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
  ['crm', 'crawler', 'students', 'playbook'].forEach((t) => {
    const sec = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tabBtn-${t}`);
    if (t === tabName) {
      sec.classList.remove('hidden');
      btn.className = 'tab-btn px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-cyan-400 text-cyan-400 bg-slate-800/60';
    } else {
      sec.classList.add('hidden');
      btn.className = 'tab-btn px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 border-transparent text-slate-400 hover:text-white';
    }
  });

  if (tabName === 'crm') loadLeads();
  if (tabName === 'crawler') loadCrawlerPresets();
  if (tabName === 'students') loadStudents();
  if (tabName === 'playbook') renderPlaybook();
}

/**
 * 1. TẢI THỐNG KÊ KPI 100 HỌC VIÊN / THÁNG & PHỄU B2C / B2B
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
    document.getElementById('kpiFollowUpDueCount').textContent = (data.follow_ups_due || []).length;

    const f = data.funnel || {};
    document.getElementById('navTotalLeads').textContent = f.total_leads || 0;
    document.getElementById('navTotalStudents').textContent = data.enrolled_count || 0;

    document.getElementById('funnelB2C').textContent = f.b2c_count || 0;
    document.getElementById('funnelB2B').textContent = f.b2b_count || 0;
    document.getElementById('funnelPotentialStudents').textContent = f.total_potential_students || 0;
    document.getElementById('funnelNew').textContent = f.new || 0;
    document.getElementById('funnelContacted').textContent = (f.contacted || 0) + (f.follow_up || 0);
    document.getElementById('funnelInterested').textContent = f.interested || 0;
    document.getElementById('funnelFollowUp').textContent = (data.follow_ups_due || []).length;
    document.getElementById('funnelWon').textContent = f.closed_won || 0;
  } catch (err) {
    console.error('KPI load error:', err);
  }
}

function setQuickFilter(mode) {
  const statusEl = document.getElementById('filterStatus');
  const approachEl = document.getElementById('filterApproach');
  const leadTypeEl = document.getElementById('filterLeadType');

  statusEl.value = '';
  approachEl.value = '';
  leadTypeEl.value = '';

  if (mode === 'only_b2c') {
    leadTypeEl.value = 'B2C';
  } else if (mode === 'only_b2b') {
    leadTypeEl.value = 'B2B';
  } else if (mode === 'uncontacted') {
    approachEl.value = 'uncontacted';
  } else if (mode === 'contacted_before') {
    approachEl.value = 'contacted_before';
  } else if (mode === 'due_followup') {
    approachEl.value = 'due_followup';
  } else if (mode === 'interested') {
    statusEl.value = 'interested';
  }
  loadLeads();
}

/**
 * 2. TẢI DANH SÁCH HỌC VIÊN CÁ NHÂN (B2C) & CƠ SỞ (B2B)
 */
async function loadLeads() {
  const search = document.getElementById('filterSearch').value;
  const lead_type = document.getElementById('filterLeadType').value;
  const platform = document.getElementById('filterPlatform').value;
  const sport = document.getElementById('filterSport').value;
  const approach = document.getElementById('filterApproach').value;
  const status = document.getElementById('filterStatus').value;
  const province = document.getElementById('filterProvince').value;
  const onlyMobile = document.getElementById('filterOnlyMobile').checked ? '1' : '';

  const qs = new URLSearchParams({
    search,
    lead_type,
    platform,
    sport_category: sport,
    approach_filter: approach,
    status,
    province,
    only_mobile: onlyMobile
  });

  const res = await fetch(`/api/leads?${qs.toString()}`);
  const data = await res.json();
  const tbody = document.getElementById('leadsTableBody');

  if (!data.leads || data.leads.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-10 text-center text-slate-400">
          Không tìm thấy học viên cá nhân hoặc cơ sở nào khớp bộ lọc. Hãy sang tab <b>"2. Quét Học Viên Cá Nhân Đa MXH"</b> để săn thêm khách hàng mới!
        </td>
      </tr>
    `;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  tbody.innerHTML = data.leads.map((l) => {
    const sportInfo = SPORT_LABELS[l.sport_category] || SPORT_LABELS.gym;
    const pfInfo = PLATFORM_LABELS[l.platform] || PLATFORM_LABELS.web;
    const intentInfo = INTENT_LABELS[l.lead_intent] || INTENT_LABELS.freelance_coach;
    const statusInfo = STATUS_LABELS[l.status] || STATUS_LABELS.new;
    const isDue = l.next_follow_up_at && l.next_follow_up_at <= today && l.status !== 'closed_won' && l.status !== 'closed_lost';
    const profileUrl = l.social_url || l.facebook_url || l.website || l.google_maps_url || '';

    return `
      <tr class="hover:bg-slate-800/50 transition">
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded border ${
              l.lead_type === 'B2C'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
            }">${l.lead_type === 'B2C' ? '👤 CÁ NHÂN' : '🏢 CLB/CƠ SỞ'}</span>

            <button onclick="openLeadDetail(${l.id})" class="font-bold text-white hover:text-cyan-400 text-left">
              ${escapeHtml(l.name)}
            </button>
          </div>
          <div class="text-[11px] mt-1 ${intentInfo.cls}">
            ${intentInfo.text} • 📍 ${escapeHtml(l.province || l.address || 'Việt Nam')}
          </div>
        </td>

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

        <td class="py-3.5 px-3">
          ${l.phone ? `
            <div class="font-mono font-bold text-emerald-400 text-sm">${escapeHtml(l.phone)}</div>
          ` : `
            <div class="text-xs text-amber-300 font-medium">Nhắn qua ${pfInfo.name} DM</div>
          `}

          ${l.social_handle ? `
            <div class="text-xs text-cyan-300 font-mono mt-0.5">${escapeHtml(l.social_handle)}</div>
          ` : ''}

          <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
            ${l.is_mobile ? `
              <button onclick="openLeadDetail(${l.id})" class="text-[11px] px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition">
                💬 Zalo
              </button>
            ` : ''}
            ${profileUrl ? `
              <a href="${escapeHtml(profileUrl)}" target="_blank" class="text-[11px] px-2 py-0.5 rounded bg-pink-600/30 text-pink-300 hover:bg-pink-600 hover:text-white transition">
                ${pfInfo.icon} Mở ${pfInfo.name}
              </a>
            ` : ''}
          </div>
        </td>

        <td class="py-3.5 px-3">
          <span class="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusInfo.cls}">
            ${statusInfo.text}
          </span>
          <div class="text-[11px] text-slate-400 mt-1.5">
            ${l.outreach_count > 0
              ? `✅ Đã liên hệ <b>${l.outreach_count} lần</b><br/><span class="text-slate-500">${l.last_contacted_at || ''}</span>`
              : `<span class="text-blue-400 font-medium">🆕 Chưa từng liên hệ</span>`}
          </div>
        </td>

        <td class="py-3.5 px-3">
          <div class="text-xs font-bold text-white">Điểm: <span class="text-cyan-400">${l.potential_score}/100</span></div>
          <div class="text-[11px] text-slate-400 mt-0.5">Dự kiến: <b>~${l.expected_students || 1} HV</b></div>
          ${l.enrolled_students_count > 0 ? `<div class="text-[11px] text-emerald-400 font-bold mt-0.5">🎓 Đã chốt: ${l.enrolled_students_count} HV</div>` : ''}
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
          <button onclick="openLeadDetail(${l.id})"
            class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-bold text-white shadow">
            💬 Nhắn Tin & Lưu Vết
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 3. CHI TIẾT HỌC VIÊN CÁ NHÂN (B2C) / CƠ SỞ (B2B) + TỰ ĐỘNG CÁ NHÂN HÓA KỊCH BẢN
 */
async function openLeadDetail(leadId) {
  const res = await fetch(`/api/leads/${leadId}`);
  const data = await res.json();
  if (!data.lead) return;

  currentSelectedLead = data.lead;
  const l = data.lead;
  const sportInfo = SPORT_LABELS[l.sport_category] || SPORT_LABELS.gym;
  const pfInfo = PLATFORM_LABELS[l.platform] || PLATFORM_LABELS.web;

  document.getElementById('modalLeadSportBadge').textContent = `${sportInfo.icon} ${sportInfo.name} (${l.lead_type === 'B2C' ? 'Cá nhân B2C' : 'CLB B2B'})`;
  document.getElementById('modalLeadPlatformBadge').textContent = `${pfInfo.icon} ${pfInfo.name} ${l.social_handle || ''}`;
  document.getElementById('modalLeadName').textContent = l.name;
  document.getElementById('modalLeadAddress').textContent = `📍 ${l.province || l.address || ''} | 📞 SĐT: ${l.phone || 'Chưa công khai (Nhắn qua MXH)'}`;
  document.getElementById('modalUpdatePhone').value = l.phone || '';
  document.getElementById('logNextFollowUp').value = l.next_follow_up_at || '';
  document.getElementById('logNote').value = '';

  // Tự động chọn kênh liên hệ mặc định dựa trên nền tảng của khách
  const channelSelect = document.getElementById('logChannel');
  if (l.phone) {
    channelSelect.value = 'zalo';
  } else if (l.platform === 'tiktok') {
    channelSelect.value = 'tiktok_dm';
  } else if (l.platform === 'instagram') {
    channelSelect.value = 'instagram_dm';
  } else if (l.platform === 'facebook') {
    channelSelect.value = 'facebook_msg';
  } else if (l.platform === 'telegram') {
    channelSelect.value = 'telegram_msg';
  } else if (l.platform === 'x') {
    channelSelect.value = 'x_dm';
  }

  // Chọn đúng kịch bản B2C (nếu là khách cá nhân) hoặc B2B (nếu là CLB) khớp bộ môn
  const matchedScript =
    allScripts.find(s => s.target_type === l.lead_type && s.sport_category === l.sport_category) ||
    allScripts.find(s => s.sport_category === l.sport_category) ||
    allScripts[0];

  if (matchedScript) {
    const personalized = matchedScript.content
      .replace(/\{\{name\}\}/g, l.name)
      .replace(/\{\{handle\}\}/g, l.social_handle || pfInfo.name)
      .replace(/\{\{province\}\}/g, l.province || 'Việt Nam');
    document.getElementById('modalGeneratedScript').value = personalized;
  }

  // Nút mở Zalo
  const zaloBtn = document.getElementById('modalZaloDirectBtn');
  if (l.phone) {
    zaloBtn.href = `https://zalo.me/${l.phone}`;
    zaloBtn.classList.remove('opacity-40', 'pointer-events-none');
    zaloBtn.textContent = `💬 Copy & Mở Zalo (${l.phone})`;
  } else {
    zaloBtn.href = '#';
    zaloBtn.classList.add('opacity-40', 'pointer-events-none');
    zaloBtn.textContent = 'Chưa có SĐT Zalo';
  }

  // Nút mở trực tiếp Profile MXH (TikTok, Instagram, Facebook, Telegram, X)
  const socialBtn = document.getElementById('modalSocialDirectBtn');
  const externalLink = l.social_url || l.facebook_url || l.website || l.google_maps_url;
  if (externalLink) {
    socialBtn.href = externalLink;
    socialBtn.classList.remove('opacity-40', 'pointer-events-none');
    socialBtn.textContent = `${pfInfo.icon} Copy & Mở ${pfInfo.name} ${l.social_handle || ''}`;
  } else {
    socialBtn.href = '#';
    socialBtn.classList.add('opacity-40', 'pointer-events-none');
    socialBtn.textContent = 'Không có Link MXH';
  }

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
  showToast('Đã copy kịch bản tư vấn cá nhân hóa vào bộ nhớ tạm!');
}

function renderOutreachTimeline(logs) {
  const box = document.getElementById('modalOutreachTimeline');
  if (!logs || logs.length === 0) {
    box.innerHTML = `<div class="text-xs text-slate-500 italic">Chưa có lịch sử liên hệ nào với học viên/cơ sở này.</div>`;
    return;
  }

  box.innerHTML = logs.map((item) => `
    <div class="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
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
      <div class="text-right font-semibold text-white">
        Đã thu: ${formatMoney(s.paid_amount)}
      </div>
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
    body: JSON.stringify({
      channel,
      outcome,
      note,
      next_follow_up_date
    })
  });

  const data = await res.json();
  if (data.logs) {
    renderOutreachTimeline(data.logs);
    document.getElementById('logNote').value = '';
    showToast('Đã lưu lịch sử tiếp cận vào CRM!');
    loadDashboardKpi();
    loadLeads();
  }
}

/**
 * 4. QUẢN LÝ CHỐT HỌC VIÊN & HỒ SƠ VTC (KPI 100 HỌC VIÊN / THÁNG)
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
    ? `Nguồn: [${lead.platform.toUpperCase()} - ${lead.lead_type}] ${lead.social_handle || lead.name}`
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
    loadLeads();
    loadStudents();
    if (currentSelectedLead) {
      openLeadDetail(currentSelectedLead.id);
    }
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
          Chưa có học viên nào trong bộ lọc này. Hãy bấm <b>"+ Thêm Học Viên Đã Chốt Đơn"</b> để ghi nhận KPI!
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
          ${escapeHtml(s.organization_name || 'Khách hàng Cá nhân (B2C)')}
          ${s.organization_province ? `<div class="text-slate-500">${escapeHtml(s.organization_province)}</div>` : ''}
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
 * 5. ĐIỀU KHIỂN BỘ MÁY SĂN HỌC VIÊN CÁ NHÂN (B2C) ĐA NỀN TẢNG MXH
 */
async function loadCrawlerPresets() {
  const res = await fetch('/api/crawler/presets');
  const data = await res.json();
  keywordPresets = data.presets || {};
  applyPresetKeyword();
  renderCrawlState(data.state);
  renderCampaignHistory(data.campaigns || []);
}

function applyPresetKeyword() {
  const sport = document.getElementById('crawlSport').value;
  const targetMode = document.getElementById('crawlTargetMode').value;
  const list = keywordPresets[sport] || [];

  if (list.length > 0) {
    if (targetMode === 'b2c_job_seekers' && list[2]) {
      document.getElementById('crawlKeyword').value = list[2];
    } else if (targetMode === 'b2c_cert_hunters' && list[3]) {
      document.getElementById('crawlKeyword').value = list[3];
    } else if (targetMode === 'b2b_maps' && list[4]) {
      document.getElementById('crawlKeyword').value = list[4];
    } else {
      document.getElementById('crawlKeyword').value = list[0];
    }
  }

  const pillsBox = document.getElementById('keywordPresetPills');
  pillsBox.innerHTML = list.map((kw) => `
    <button type="button" onclick="document.getElementById('crawlKeyword').value = '${kw}'"
      class="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700 transition">
      ${kw}
    </button>
  `).join('');
}

async function startCrawler() {
  const targetMode = document.getElementById('crawlTargetMode').value;
  const sportCategory = document.getElementById('crawlSport').value;
  const keyword = document.getElementById('crawlKeyword').value.trim();
  const province = document.getElementById('crawlProvince').value.trim();
  const maxResults = Number(document.getElementById('crawlMaxResults').value || 35);

  const checkedPfs = Array.from(document.querySelectorAll('.crawl-pf-cb:checked')).map(cb => cb.value);
  const platforms = checkedPfs.length > 0 ? checkedPfs : ['all'];

  if (!province) {
    showToast('Vui lòng nhập Khu vực / Tỉnh thành cần quét!', true);
    return;
  }

  const res = await fetch('/api/crawler/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sportCategory, keyword, province, targetMode, platforms, maxResults })
  });

  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Không thể bắt đầu quét', true);
    return;
  }

  showToast('🚀 Đã khởi chạy săn học viên cá nhân đa mạng xã hội!');
  if (crawlPollTimer) clearInterval(crawlPollTimer);
  crawlPollTimer = setInterval(pollCrawlerStatus, 1500);
}

async function pollCrawlerStatus() {
  const res = await fetch('/api/crawler/status');
  const state = await res.json();
  renderCrawlState(state);

  if (!state.isRunning && crawlPollTimer) {
    clearInterval(crawlPollTimer);
    crawlPollTimer = null;
    loadDashboardKpi();
    loadCrawlerPresets();
    showToast(`Hoàn tất! Đã thêm ${state.newInserted} học viên/cơ sở mới vào CRM.`);
  }
}

function renderCrawlState(state) {
  if (!state) return;
  const btn = document.getElementById('btnStartCrawl');
  const sub = document.getElementById('crawlStatusSubtitle');

  document.getElementById('crawlFoundCount').textContent = state.totalFound || 0;
  document.getElementById('crawlNewCount').textContent = state.newInserted || 0;
  document.getElementById('crawlDupCount').textContent = state.duplicatesSkipped || 0;

  if (state.isRunning) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang săn học viên trên các mạng xã hội... Vui lòng đợi';
    btn.classList.add('opacity-60');
    sub.textContent = `Đang quét: "${state.keyword}" tại ${state.province}...`;
  } else {
    btn.disabled = false;
    btn.textContent = '🔍 Bắt Đầu Săn Học Viên Cá Nhân & Chống Trùng Lặp';
    btn.classList.remove('opacity-60');
    sub.textContent = 'Sẵn sàng khởi chạy chiến dịch mới.';
  }

  if (state.logs && state.logs.length > 0) {
    document.getElementById('crawlLogsBox').innerHTML = state.logs
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join('');
  }
}

function renderCampaignHistory(campaigns) {
  const tbody = document.getElementById('campaignsHistoryBody');
  if (!campaigns || campaigns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="py-3 text-slate-500">Chưa có lịch sử chiến dịch nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = campaigns.map((c) => `
    <tr>
      <td class="py-2 text-slate-400">${c.created_at}</td>
      <td class="py-2 font-semibold text-cyan-300 uppercase">${c.sport_category} <span class="text-slate-500 text-[10px]">(${escapeHtml(c.source)})</span></td>
      <td class="py-2 text-white">${escapeHtml(c.keyword)} — <b>${escapeHtml(c.province)}</b></td>
      <td class="py-2">
        <span class="text-emerald-400 font-bold">+${c.new_inserted} mới</span>
        <span class="text-slate-500">(${c.duplicates_skipped} trùng đã bỏ qua)</span>
      </td>
      <td class="py-2">
        <span class="px-2 py-0.5 rounded text-[11px] ${
          c.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
          c.status === 'running' ? 'bg-blue-500/20 text-blue-300' : 'bg-rose-500/20 text-rose-300'
        }">${c.status}</span>
      </td>
    </tr>
  `).join('');
}

/**
 * 6. THÊM HỒ SƠ THỦ CÔNG & KỊCH BẢN CHỐT ĐƠN
 */
function openAddLeadModal() {
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
  const social_url = document.getElementById('newLeadSocialUrl').value.trim();
  const notes = document.getElementById('newLeadNotes').value.trim();

  if (!name) {
    showToast('Vui lòng nhập tên học viên cá nhân hoặc cơ sở!', true);
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
      social_url,
      notes
    })
  });

  const data = await res.json();
  if (res.ok) {
    closeAddLeadModal();
    if (data.result?.action === 'skipped_duplicate') {
      showToast('Học viên/Nick MXH này đã có sẵn trong CRM (Chống trùng)!', true);
    } else {
      showToast('Đã thêm Học viên/Cơ sở mới vào CRM!');
    }
    loadDashboardKpi();
    loadLeads();
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
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 uppercase">${s.target_type}</span>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase">${s.sport_category}</span>
          </div>
          <button onclick="navigator.clipboard.writeText(${JSON.stringify(s.content).replace(/"/g, '&quot;')}); showToast('Đã copy mẫu kịch bản!');"
            class="text-xs text-cyan-400 hover:underline">📋 Copy mẫu này</button>
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

window.addEventListener('DOMContentLoaded', async () => {
  await loadScripts();
  await loadDashboardKpi();
  await loadLeads();
});
