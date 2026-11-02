const express = require('express');
const XLSX = require('xlsx');
const {
  db,
  upsertLead,
  addLeadEvidence,
  addOutreachLog,
  deleteLeadById,
  clearAllData,
  purgeInvalidLeads,
  getSetting,
  setSetting,
  backupDatabase
} = require('../db/database');
const {
  getCloudSyncStatus,
  clearCloudData,
  syncWithCloud
} = require('../db/cloudSync');
const {
  SPORT_KEYWORDS_PRESETS,
  B2C_SPORT_KEYWORDS,
  getCrawlState,
  runCrawlCampaign
} = require('../crawlers/crawlerEngine');

const router = express.Router();

/**
 * 1. API THỐNG KÊ KPI 100 HỌC VIÊN / THÁNG & TÁCH RIÊNG 2 PHÂN HỆ (B2B vs B2C)
 */
router.get('/dashboard/kpi', (req, res) => {
  try {
    const currentMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);

    const studentStats = db.prepare(`
      SELECT
        COUNT(*) as enrolled_count,
        COALESCE(SUM(tuition_fee - discount_amount), 0) as expected_revenue,
        COALESCE(SUM(paid_amount), 0) as collected_revenue
      FROM students
      WHERE batch_month = ?
    `).get(currentMonth);

    // Thống kê tách biệt hoàn toàn giữa B2B (Cơ sở tập luyện) và B2C (Khách hàng cá nhân)
    const splitRows = db.prepare(`
      SELECT
        lead_type,
        status,
        COUNT(*) as count,
        COALESCE(SUM(expected_students), 0) as potential_students
      FROM leads
      GROUP BY lead_type, status
    `).all();

    const makeHubSummary = () => ({
      total: 0,
      new: 0,
      contacted: 0,
      interested: 0,
      follow_up: 0,
      closed_won: 0,
      closed_lost: 0,
      potential_students: 0,
      due_today: 0
    });

    const b2b_hub = makeHubSummary();
    const b2c_hub = makeHubSummary();

    for (const r of splitRows) {
      const target = r.lead_type === 'B2C' ? b2c_hub : b2b_hub;
      target.total += r.count;
      target[r.status] = (target[r.status] || 0) + r.count;
      if (r.status !== 'closed_lost') {
        target.potential_students += r.potential_students;
      }
    }

    b2b_hub.due_today = db.prepare(`
      SELECT COUNT(*) as cnt FROM leads
      WHERE lead_type = 'B2B' AND next_follow_up_at IS NOT NULL AND next_follow_up_at != ''
        AND date(next_follow_up_at) <= date(?) AND status NOT IN ('closed_won', 'closed_lost')
    `).get(today).cnt;

    b2c_hub.due_today = db.prepare(`
      SELECT COUNT(*) as cnt FROM leads
      WHERE lead_type = 'B2C' AND next_follow_up_at IS NOT NULL AND next_follow_up_at != ''
        AND date(next_follow_up_at) <= date(?) AND status NOT IN ('closed_won', 'closed_lost')
    `).get(today).cnt;

    const platformRows = db.prepare(`
      SELECT platform, COUNT(*) as count FROM leads WHERE lead_type = 'B2C' GROUP BY platform
    `).all();

    const b2c_by_platform = {};
    for (const p of platformRows) {
      b2c_by_platform[p.platform || 'web'] = p.count;
    }

    const todayOutreach = db.prepare(`
      SELECT COUNT(*) as count FROM outreach_logs WHERE date(created_at) = date('now', 'localtime')
    `).get().count;

    res.json({
      month: currentMonth,
      kpi_target: 100,
      enrolled_count: studentStats.enrolled_count || 0,
      kpi_percentage: Math.min(100, Math.round(((studentStats.enrolled_count || 0) / 100) * 100)),
      expected_revenue: studentStats.expected_revenue || 0,
      collected_revenue: studentStats.collected_revenue || 0,
      b2b_hub,
      b2c_hub,
      b2c_by_platform,
      funnel: {
        total_leads: b2b_hub.total + b2c_hub.total,
        b2b_count: b2b_hub.total,
        b2c_count: b2c_hub.total
      },
      today_outreach: todayOutreach,
      cloud_status: getCloudSyncStatus(process.env.PORT || 3000)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. API TRUY VẤN RIÊNG CHO TỪNG PHÂN HỆ (B2B CƠ SỞ TẬP LUYỆN / B2C KHÁCH CÁ NHÂN)
 */
router.get('/leads', (req, res) => {
  try {
    purgeInvalidLeads();
    const {
      search = '',
      sport_category = '',
      status = '',
      province = '',
      lead_type = '', // 'B2B' hoặc 'B2C'
      platform = '', // 'tiktok', 'facebook', 'zalo', 'threads', 'instagram', 'telegram', 'x', 'youtube', 'linkedin', 'google_maps'
      evidence_type = '', // 'post_teaching', 'post_job_seeking', 'post_asking_cert', 'zalo_community', 'profile_bio', 'admissions_announcement'
      source = '', // 'google_maps', 'admissions'
      approach_filter = '',
      only_mobile = ''
    } = req.query;

    const conditions = [];
    const params = [];

    if (lead_type) {
      conditions.push('l.lead_type = ?');
      params.push(lead_type);
    }

    if (search.trim()) {
      conditions.push('(l.name LIKE ? OR l.phone LIKE ? OR l.social_handle LIKE ? OR l.evidence_snippet LIKE ? OR l.address LIKE ? OR l.contact_person LIKE ? OR l.notes LIKE ?)');
      const likeStr = `%${search.trim()}%`;
      params.push(likeStr, likeStr, likeStr, likeStr, likeStr, likeStr, likeStr);
    }

    if (sport_category) {
      conditions.push('l.sport_category = ?');
      params.push(sport_category);
    }

    if (status) {
      conditions.push('l.status = ?');
      params.push(status);
    }

    if (province.trim()) {
      conditions.push('l.province LIKE ?');
      params.push(`%${province.trim()}%`);
    }

    if (platform) {
      conditions.push('l.platform = ?');
      params.push(platform);
    }

    if (evidence_type) {
      conditions.push('l.evidence_type = ?');
      params.push(evidence_type);
    }

    if (source === 'google_maps') {
      conditions.push("l.source = 'google_maps'");
    } else if (source === 'admissions') {
      conditions.push("(l.source LIKE 'admissions%' OR l.lead_intent = 'admissions' OR l.evidence_type = 'admissions_announcement')");
    }

    if (only_mobile === '1') {
      conditions.push('l.is_mobile = 1');
    }

    if (approach_filter === 'uncontacted') {
      conditions.push("l.status = 'new' AND l.outreach_count = 0");
    } else if (approach_filter === 'contacted_before') {
      conditions.push("(l.status != 'new' OR l.outreach_count > 0)");
    } else if (approach_filter === 'due_followup') {
      conditions.push("l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at != '' AND date(l.next_follow_up_at) <= date('now', 'localtime') AND l.status NOT IN ('closed_won', 'closed_lost')");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const leads = db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM students s WHERE s.lead_id = l.id) as enrolled_students_count,
        (SELECT COUNT(*) FROM lead_evidences e WHERE e.lead_id = l.id) as evidence_count
      FROM leads l
      ${whereClause}
      ORDER BY
        CASE WHEN l.status = 'interested' THEN 1
             WHEN l.status = 'follow_up' THEN 2
             WHEN l.status = 'new' THEN 3
             WHEN l.status = 'contacted' THEN 4
             WHEN l.status = 'closed_won' THEN 5
             ELSE 6 END,
        l.potential_score DESC,
        l.id DESC
      LIMIT 500
    `).all(...params);

    res.json({ leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Chi tiết 1 Cơ sở / Khách hàng Cá nhân + Danh sách Bằng chứng Bài viết + Nhật ký Tiếp cận + Học viên
 */
router.get('/leads/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });

    const evidences = db.prepare('SELECT * FROM lead_evidences WHERE lead_id = ? ORDER BY id DESC').all(id);
    const logs = db.prepare('SELECT * FROM outreach_logs WHERE lead_id = ? ORDER BY id DESC').all(id);
    const students = db.prepare('SELECT * FROM students WHERE lead_id = ? ORDER BY id DESC').all(id);

    res.json({ lead, evidences, logs, students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Thêm Bằng chứng bài viết / video mới cho Khách hàng Cá nhân B2C
 */
router.post('/leads/:id/evidences', (req, res) => {
  try {
    const lead_id = Number(req.params.id);
    const { platform = 'facebook', evidence_type = 'post_teaching', title = '', content_snippet = '', post_url = '' } = req.body;
    if (!content_snippet.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung trích dẫn bài viết/bằng chứng' });
    }

    addLeadEvidence({
      lead_id,
      platform,
      evidence_type,
      title,
      content_snippet,
      post_url
    });

    const evidences = db.prepare('SELECT * FROM lead_evidences WHERE lead_id = ? ORDER BY id DESC').all(lead_id);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
    res.json({ lead, evidences });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/leads', (req, res) => {
  try {
    const result = upsertLead({
      ...req.body,
      source: req.body.source || 'manual'
    });
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(result.leadId);
    // Tự động đồng bộ ngầm lên Cloud nếu đã cấu hình
    syncWithCloud().catch(() => {});
    res.json({ result, lead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leads/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });

    const fields = [
      'name', 'lead_type', 'lead_intent', 'sport_category', 'platform',
      'social_handle', 'social_url', 'evidence_type', 'evidence_snippet', 'evidence_url',
      'phone', 'contact_person', 'address', 'province', 'district',
      'facebook_url', 'website', 'status', 'expected_students', 'next_follow_up_at', 'notes'
    ];

    const updates = [];
    const values = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now', 'localtime')");
      values.push(id);
      db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    syncWithCloud().catch(() => {});
    res.json({ lead: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * API XÓA SẠCH DỮ LIỆU (ALL / B2B / B2C) & XÓA LẺ TỪNG HỒ SƠ
 */
function handleClearDataRequest(req, res) {
  try {
    const target =
      (req.body && req.body.target) ||
      req.query.target ||
      req.params.target ||
      'all';
    const result = clearAllData(target);
    clearCloudData(target).catch(() => {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.post('/data/clear', handleClearDataRequest);
router.delete('/data/clear', handleClearDataRequest);
router.get('/data/clear', handleClearDataRequest);
router.post('/leads/clear', handleClearDataRequest);
router.delete('/leads/clear', handleClearDataRequest);

router.delete('/leads/:id', (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    if (['all', 'B2B', 'B2C', 'clear'].includes(rawId)) {
      const target = rawId === 'clear' ? (req.query.target || 'all') : rawId;
      const result = clearAllData(target);
      clearCloudData(target).catch(() => {});
      return res.json({ success: true, ...result });
    }

    const result = deleteLeadById(Number(rawId));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. API GHI NHẬN LỊCH SỬ TIẾP CẬN (OUTREACH LOG)
 */
router.post('/leads/:id/outreach', (req, res) => {
  try {
    const lead_id = Number(req.params.id);
    const { channel = 'zalo', outcome = 'sent_zalo', message_sent = '', note = '', next_follow_up_date = null, new_status = null } = req.body;

    const updatedLead = addOutreachLog({
      lead_id,
      channel,
      outcome,
      message_sent,
      note,
      next_follow_up_date,
      new_status
    });

    const logs = db.prepare('SELECT * FROM outreach_logs WHERE lead_id = ? ORDER BY id DESC').all(lead_id);
    syncWithCloud().catch(() => {});
    res.json({ lead: updatedLead, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. API QUẢN LÝ HỌC VIÊN ĐÃ CHỐT & HỒ SƠ CHỨNG CHỈ VTC (KPI 100 HỌC VIÊN / THÁNG)
 */
router.get('/students', (req, res) => {
  try {
    const { batch_month = '', sport_course = '', payment_status = '', search = '' } = req.query;
    const conditions = [];
    const params = [];

    if (batch_month) {
      conditions.push('s.batch_month = ?');
      params.push(batch_month);
    }
    if (sport_course) {
      conditions.push('s.sport_course = ?');
      params.push(sport_course);
    }
    if (payment_status) {
      conditions.push('s.payment_status = ?');
      params.push(payment_status);
    }
    if (search.trim()) {
      conditions.push('(s.full_name LIKE ? OR s.phone LIKE ? OR l.name LIKE ?)');
      const q = `%${search.trim()}%`;
      params.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const students = db.prepare(`
      SELECT s.*, l.name as organization_name, l.province as organization_province, l.lead_type as organization_type
      FROM students s
      LEFT JOIN leads l ON s.lead_id = l.id
      ${whereClause}
      ORDER BY s.id DESC
    `).all(...params);

    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/students', (req, res) => {
  try {
    const {
      lead_id = null,
      full_name,
      phone,
      cccd_number = '',
      sport_course = 'gym',
      batch_month = new Date().toISOString().slice(0, 7),
      tuition_fee = 6500000,
      discount_amount = 0,
      paid_amount = 0,
      payment_status = 'deposit',
      doc_cccd = 0,
      doc_diploma = 0,
      doc_photo = 0,
      doc_form = 0,
      exam_status = 'waiting',
      notes = ''
    } = req.body;

    if (!full_name || !phone) {
      return res.status(400).json({ error: 'Vui lòng nhập Họ tên và Số điện thoại học viên' });
    }

    const result = db.prepare(`
      INSERT INTO students (
        lead_id, full_name, phone, cccd_number, sport_course, batch_month,
        tuition_fee, discount_amount, paid_amount, payment_status,
        doc_cccd, doc_diploma, doc_photo, doc_form, exam_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      lead_id ? Number(lead_id) : null,
      full_name.trim(),
      phone.trim(),
      cccd_number,
      sport_course,
      batch_month,
      Number(tuition_fee),
      Number(discount_amount),
      Number(paid_amount),
      payment_status,
      doc_cccd ? 1 : 0,
      doc_diploma ? 1 : 0,
      doc_photo ? 1 : 0,
      doc_form ? 1 : 0,
      exam_status,
      notes
    );

    if (lead_id) {
      addOutreachLog({
        lead_id: Number(lead_id),
        channel: 'zalo',
        outcome: 'enrolled',
        note: `Đã chốt học viên đăng ký: ${full_name} (${phone}) - Khóa ${sport_course.toUpperCase()}`,
        new_status: 'closed_won'
      });
    }

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(Number(result.lastInsertRowid));
    syncWithCloud().catch(() => {});
    res.json({ student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/students/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const fields = [
      'full_name', 'phone', 'cccd_number', 'sport_course', 'batch_month',
      'tuition_fee', 'discount_amount', 'paid_amount', 'payment_status',
      'doc_cccd', 'doc_diploma', 'doc_photo', 'doc_form', 'exam_status', 'notes'
    ];
    const updates = [];
    const values = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(req.body[f]);
      }
    }

    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE students SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
    syncWithCloud().catch(() => {});
    res.json({ student });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/students/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM students WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. API KẾT NỐI CLOUD DATABASE (SUPABASE / NEON) & ĐỒNG BỘ ĐA THIẾT BỊ
 */
router.get('/cloud/status', (req, res) => {
  res.json(getCloudSyncStatus(process.env.PORT || 3000));
});

router.post('/cloud/config', async (req, res) => {
  try {
    const { cloud_postgres_url = '', device_name = '' } = req.body;
    if (device_name.trim()) {
      setSetting('device_name', device_name.trim());
    }
    if (cloud_postgres_url !== undefined) {
      setSetting('cloud_postgres_url', cloud_postgres_url.trim());
    }

    if (cloud_postgres_url.trim()) {
      const syncResult = await syncWithCloud(cloud_postgres_url.trim());
      return res.json({
        saved: true,
        status: getCloudSyncStatus(process.env.PORT || 3000),
        syncResult
      });
    }

    res.json({
      saved: true,
      status: getCloudSyncStatus(process.env.PORT || 3000)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cloud/sync', async (req, res) => {
  try {
    const syncResult = await syncWithCloud();
    res.json({
      status: getCloudSyncStatus(process.env.PORT || 3000),
      syncResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. API KỊCH BẢN CHỐT ĐƠN VTC & BỘ MÁY QUÉT
 */
router.get('/scripts', (req, res) => {
  try {
    const scripts = db.prepare('SELECT * FROM script_templates ORDER BY id ASC').all();
    res.json({ scripts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/crawler/presets', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM crawl_campaigns ORDER BY id DESC LIMIT 20').all();
  res.json({
    presets: SPORT_KEYWORDS_PRESETS,
    b2cKeywords: B2C_SPORT_KEYWORDS,
    state: getCrawlState(),
    campaigns
  });
});

router.get('/crawler/status', (req, res) => {
  res.json(getCrawlState());
});

router.post('/crawler/start', (req, res) => {
  try {
    const {
      keyword,
      province = 'Hà Nội',
      sportCategory = 'gym',
      targetMode = 'b2c_all',
      platforms = ['all'],
      maxResults = 25
    } = req.body;

    if (getCrawlState().isRunning) {
      return res.status(409).json({ error: 'Đang có một tiến trình quét dữ liệu đang chạy!' });
    }

    runCrawlCampaign({
      keyword,
      province,
      sportCategory,
      targetMode,
      platforms,
      maxResults: Number(maxResults) || 25
    }).then(() => {
      syncWithCloud().catch(() => {});
    }).catch((err) => {
      console.error('Background crawl error:', err);
    });

    res.json({
      started: true,
      message: `Đã bắt đầu chiến dịch quét (${targetMode}) tại ${province}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. API XUẤT FILE EXCEL (.XLSX) TÁCH RIÊNG 3 SHEET: CƠ SỞ B2B, CÁ NHÂN B2C, HỌC VIÊN KPI
 */
router.get('/export/excel', (req, res) => {
  try {
    const b2bLeads = db.prepare(`
      SELECT
        id as "Mã Cơ sở",
        name as "Tên Phòng tập / CLB (B2B)",
        sport_category as "Bộ môn VTC",
        phone as "Hotline / Zalo",
        contact_person as "Người quản lý",
        expected_students as "Quy mô dự kiến (HV)",
        status as "Trạng thái tiếp cận",
        outreach_count as "Số lần đã liên hệ",
        last_contacted_at as "Liên hệ gần nhất",
        next_follow_up_at as "Lịch hẹn gọi lại",
        province as "Tỉnh/Thành",
        address as "Địa chỉ mặt bằng",
        rating as "Điểm Maps",
        review_count as "Số đánh giá",
        notes as "Ghi chú chăm sóc"
      FROM leads
      WHERE lead_type = 'B2B'
      ORDER BY id DESC
    `).all();

    const b2cLeads = db.prepare(`
      SELECT
        id as "Mã Cá nhân",
        name as "Họ tên / Kênh Cá nhân (B2C)",
        platform as "Nền tảng MXH",
        social_handle as "Nick (@handle)",
        sport_category as "Bộ môn VTC",
        phone as "SĐT Zalo",
        evidence_type as "Loại bằng chứng",
        evidence_snippet as "Bằng chứng Bài viết / Hoạt động cá nhân",
        evidence_url as "Link Bài viết Bằng chứng",
        social_url as "Link Trang cá nhân",
        status as "Trạng thái tiếp cận",
        outreach_count as "Số lần đã nhắn",
        next_follow_up_at as "Lịch hẹn",
        province as "Tỉnh/Thành"
      FROM leads
      WHERE lead_type = 'B2C'
      ORDER BY id DESC
    `).all();

    const students = db.prepare(`
      SELECT
        id as "Mã HV",
        full_name as "Họ và Tên Học viên",
        phone as "Số điện thoại",
        sport_course as "Khóa học VTC",
        batch_month as "Tháng KPI",
        tuition_fee as "Học phí",
        discount_amount as "Ưu đãi giảm",
        paid_amount as "Đã đóng",
        doc_cccd as "Có CCCD",
        doc_diploma as "Có Bằng THPT/ĐH",
        doc_photo as "Có Ảnh 3x4",
        exam_status as "Tiến độ học & thi"
      FROM students
      ORDER BY id DESC
    `).all();

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b2bLeads), '1_Co_So_Tap_Luyen_B2B');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(b2cLeads), '2_Khach_Ca_Nhan_B2C');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(students), '3_Hoc_Vien_KPI_100');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `VTC_Sport_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
