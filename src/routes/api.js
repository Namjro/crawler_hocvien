const express = require('express');
const XLSX = require('xlsx');
const { db, upsertLead, addOutreachLog, backupDatabase } = require('../db/database');
const {
  SPORT_KEYWORDS_PRESETS,
  B2C_SPORT_KEYWORDS,
  getCrawlState,
  runCrawlCampaign
} = require('../crawlers/crawlerEngine');

const router = express.Router();

/**
 * 1. API THỐNG KÊ KPI 100 HỌC VIÊN / THÁNG & DASHBOARD ĐA NỀN TẢNG
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

    const studentsBySport = db.prepare(`
      SELECT sport_course, COUNT(*) as count
      FROM students
      WHERE batch_month = ?
      GROUP BY sport_course
    `).all(currentMonth);

    const funnelRows = db.prepare(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(expected_students), 0) as potential_students
      FROM leads
      GROUP BY status
    `).all();

    const typeRows = db.prepare(`
      SELECT lead_type, COUNT(*) as count FROM leads GROUP BY lead_type
    `).all();

    const platformRows = db.prepare(`
      SELECT platform, COUNT(*) as count FROM leads GROUP BY platform
    `).all();

    const funnel = {
      total_leads: 0,
      b2c_count: 0,
      b2b_count: 0,
      new: 0,
      contacted: 0,
      interested: 0,
      follow_up: 0,
      closed_won: 0,
      closed_lost: 0,
      total_potential_students: 0,
      by_platform: {}
    };

    for (const r of funnelRows) {
      funnel.total_leads += r.count;
      funnel[r.status] = r.count;
      if (r.status !== 'closed_lost') {
        funnel.total_potential_students += r.potential_students;
      }
    }

    for (const t of typeRows) {
      if (t.lead_type === 'B2C') funnel.b2c_count = t.count;
      if (t.lead_type === 'B2B') funnel.b2b_count = t.count;
    }

    for (const p of platformRows) {
      funnel.by_platform[p.platform || 'web'] = p.count;
    }

    const todayOutreach = db.prepare(`
      SELECT COUNT(*) as count FROM outreach_logs WHERE date(created_at) = date('now', 'localtime')
    `).get().count;

    const monthOutreach = db.prepare(`
      SELECT COUNT(*) as count FROM outreach_logs WHERE strftime('%Y-%m', created_at) = ?
    `).get(currentMonth).count;

    const followUpsDue = db.prepare(`
      SELECT id, name, lead_type, sport_category, platform, social_handle, social_url, phone, zalo_url,
             province, contact_person, status, expected_students, next_follow_up_at, last_contacted_at, notes
      FROM leads
      WHERE next_follow_up_at IS NOT NULL
        AND next_follow_up_at != ''
        AND date(next_follow_up_at) <= date(?)
        AND status NOT IN ('closed_won', 'closed_lost')
      ORDER BY date(next_follow_up_at) ASC, potential_score DESC
      LIMIT 25
    `).all(today);

    res.json({
      month: currentMonth,
      kpi_target: 100,
      enrolled_count: studentStats.enrolled_count || 0,
      kpi_percentage: Math.min(100, Math.round(((studentStats.enrolled_count || 0) / 100) * 100)),
      expected_revenue: studentStats.expected_revenue || 0,
      collected_revenue: studentStats.collected_revenue || 0,
      students_by_sport: studentsBySport,
      funnel,
      today_outreach: todayOutreach,
      month_outreach: monthOutreach,
      follow_ups_due: followUpsDue
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. API DANH SÁCH & BỘ LỌC KHÁCH HÀNG CÁ NHÂN (B2C) + CƠ SỞ (B2B) ĐA NỀN TẢNG
 */
router.get('/leads', (req, res) => {
  try {
    const {
      search = '',
      sport_category = '',
      status = '',
      province = '',
      lead_type = '', // 'B2C' hoặc 'B2B'
      platform = '', // 'tiktok', 'facebook', 'instagram', 'telegram', 'x', 'youtube', 'google_maps'
      lead_intent = '', // 'cert_hunter', 'freelance_coach', 'job_seeker', 'facility'
      approach_filter = '',
      only_mobile = ''
    } = req.query;

    const conditions = [];
    const params = [];

    if (search.trim()) {
      conditions.push('(name LIKE ? OR phone LIKE ? OR social_handle LIKE ? OR address LIKE ? OR contact_person LIKE ? OR notes LIKE ?)');
      const likeStr = `%${search.trim()}%`;
      params.push(likeStr, likeStr, likeStr, likeStr, likeStr, likeStr);
    }

    if (sport_category) {
      conditions.push('sport_category = ?');
      params.push(sport_category);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (province.trim()) {
      conditions.push('province LIKE ?');
      params.push(`%${province.trim()}%`);
    }

    if (lead_type) {
      conditions.push('lead_type = ?');
      params.push(lead_type);
    }

    if (platform) {
      conditions.push('platform = ?');
      params.push(platform);
    }

    if (lead_intent) {
      conditions.push('lead_intent = ?');
      params.push(lead_intent);
    }

    if (only_mobile === '1') {
      conditions.push('is_mobile = 1');
    }

    if (approach_filter === 'uncontacted') {
      conditions.push("status = 'new' AND outreach_count = 0");
    } else if (approach_filter === 'contacted_before') {
      conditions.push("(status != 'new' OR outreach_count > 0)");
    } else if (approach_filter === 'due_followup') {
      conditions.push("next_follow_up_at IS NOT NULL AND next_follow_up_at != '' AND date(next_follow_up_at) <= date('now', 'localtime') AND status NOT IN ('closed_won', 'closed_lost')");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const leads = db.prepare(`
      SELECT l.*,
        (SELECT COUNT(*) FROM students s WHERE s.lead_id = l.id) as enrolled_students_count
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

router.get('/leads/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });

    const logs = db.prepare('SELECT * FROM outreach_logs WHERE lead_id = ? ORDER BY id DESC').all(id);
    const students = db.prepare('SELECT * FROM students WHERE lead_id = ? ORDER BY id DESC').all(id);

    res.json({ lead, logs, students });
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
      'social_handle', 'social_url', 'phone', 'contact_person',
      'address', 'province', 'district', 'facebook_url', 'website',
      'status', 'expected_students', 'next_follow_up_at', 'notes'
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
    res.json({ lead: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/leads/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM leads WHERE id = ?').run(Number(req.params.id));
    res.json({ success: true });
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
 * 5. API KỊCH BẢN CHỐT ĐƠN VTC (B2C CÁ NHÂN + B2B CƠ SỞ)
 */
router.get('/scripts', (req, res) => {
  try {
    const scripts = db.prepare('SELECT * FROM script_templates ORDER BY id ASC').all();
    res.json({ scripts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scripts', (req, res) => {
  try {
    const { title, sport_category = 'all', target_type = 'B2C', stage = 'first_touch', content } = req.body;
    const r = db.prepare(`
      INSERT INTO script_templates (title, sport_category, target_type, stage, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, sport_category, target_type, stage, content);
    const script = db.prepare('SELECT * FROM script_templates WHERE id = ?').get(Number(r.lastInsertRowid));
    res.json({ script });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. API ĐIỀU KHIỂN BỘ MÁY QUÉT ĐA NỀN TẢNG (B2C SOCIAL + B2B MAPS)
 */
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
 * 7. API XUẤT FILE EXCEL (.XLSX)
 */
router.get('/export/excel', (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT
        id as "Mã ID",
        name as "Tên Học viên Cá nhân / Cơ sở",
        lead_type as "Phân loại (B2C/B2B)",
        lead_intent as "Nhóm nhu cầu",
        platform as "Nền tảng MXH",
        social_handle as "Tài khoản MXH (@handle)",
        social_url as "Link Profile MXH",
        sport_category as "Bộ môn VTC",
        phone as "SĐT Chính",
        zalo_url as "Link Zalo",
        status as "Trạng thái tiếp cận",
        outreach_count as "Số lần đã liên hệ",
        last_contacted_at as "Lần liên hệ gần nhất",
        next_follow_up_at as "Lịch hẹn gọi lại",
        province as "Tỉnh/Thành",
        notes as "Tiểu sử Bio / Ghi chú"
      FROM leads
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
        payment_status as "Trạng thái học phí",
        doc_cccd as "Có CCCD",
        doc_diploma as "Có Bằng THPT/ĐH",
        doc_photo as "Có Ảnh 3x4",
        exam_status as "Tiến độ học & thi",
        notes as "Ghi chú"
      FROM students
      ORDER BY id DESC
    `).all();

    const wb = XLSX.utils.book_new();
    const wsLeads = XLSX.utils.json_to_sheet(leads);
    const wsStudents = XLSX.utils.json_to_sheet(students);

    XLSX.utils.book_append_sheet(wb, wsLeads, 'Khach_Ca_Nhan_Va_CLB');
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Hoc_Vien_Da_Chot_KPI');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `VTC_Sport_CRM_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup', (req, res) => {
  const file = backupDatabase();
  res.json({ success: Boolean(file), backupFile: file });
});

module.exports = router;
