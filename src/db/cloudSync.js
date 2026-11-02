/**
 * MODULE ĐỒNG BỘ CƠ SỞ DỮ LIỆU ĐÁM MÂY (CLOUD POSTGRESQL - SUPABASE / NEON) & ĐA THIẾT BỊ
 * Giúp làm việc xuyên suốt trên nhiều máy tính và điện thoại với 1 nguồn dữ liệu thống nhất
 */

const { Pool } = require('pg');
const os = require('node:os');
const { db, upsertLead, addLeadEvidence, getSetting, setSetting } = require('./database');

let pgPool = null;
let lastSyncState = {
  connected: false,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
  pushedLeads: 0,
  pulledLeads: 0,
  pushedStudents: 0,
  pulledStudents: 0
};

/**
 * Lấy danh sách địa chỉ IP LAN của máy hiện tại để Điện thoại / Máy tính khác truy cập nhanh
 */
function getLocalNetworkUrls(port = 3000) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

/**
 * Chuẩn hóa chuỗi kết nối PostgreSQL:
 * Tự động encode mật khẩu nếu chứa ký tự đặc biệt (@, #, ...) tránh làm gãy URI kết nối
 */
function normalizeConnectionString(rawUrl) {
  if (!rawUrl) return '';
  const url = rawUrl.trim();
  const lastAt = url.lastIndexOf('@');
  if (lastAt !== -1) {
    const front = url.substring(0, lastAt);
    const back = url.substring(lastAt + 1);
    const slashSlash = front.indexOf('://');
    if (slashSlash !== -1) {
      const proto = front.substring(0, slashSlash + 3);
      const creds = front.substring(slashSlash + 3);
      const colon = creds.indexOf(':');
      if (colon !== -1) {
        const user = creds.substring(0, colon);
        const pass = creds.substring(colon + 1);
        let safePass = pass;
        try {
          safePass = encodeURIComponent(decodeURIComponent(pass));
        } catch (_) {
          safePass = encodeURIComponent(pass);
        }
        return `${proto}${user}:${safePass}@${back}`;
      }
    }
  }
  return url;
}

/**
 * Ẩn mật khẩu trong chuỗi kết nối để hiển thị an toàn trên giao diện
 */
function maskConnectionString(rawUrl) {
  if (!rawUrl) return '';
  const url = rawUrl.trim();
  const lastAt = url.lastIndexOf('@');
  if (lastAt === -1) return url;
  const front = url.substring(0, lastAt);
  const back = url.substring(lastAt);
  const slashSlash = front.indexOf('://');
  if (slashSlash !== -1) {
    const creds = front.substring(slashSlash + 3);
    const colon = creds.indexOf(':');
    if (colon !== -1) {
      const protoAndUser = front.substring(0, slashSlash + 3 + colon + 1);
      return `${protoAndUser}****${back}`;
    }
  }
  return url;
}

/**
 * Khởi tạo kết nối Pool tới Cloud PostgreSQL (Supabase / Neon)
 */
async function getPgPool(customUrl = null) {
  const rawConnStr = (customUrl || getSetting('cloud_postgres_url') || process.env.DATABASE_URL || '').trim();
  if (!rawConnStr) return null;

  const connStr = normalizeConnectionString(rawConnStr);

  if (pgPool && pgPool._connStr === connStr) {
    return pgPool;
  }

  if (pgPool) {
    await pgPool.end().catch(() => {});
    pgPool = null;
  }

  const pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes('localhost') || connStr.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
  pool._connStr = connStr;
  pgPool = pool;
  return pool;
}

/**
 * Khởi tạo cấu trúc bảng trên Cloud PostgreSQL nếu chưa có
 */
async function ensureCloudSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vtc_cloud_leads (
      id SERIAL PRIMARY KEY,
      unique_key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      lead_type TEXT DEFAULT 'B2B',
      lead_intent TEXT DEFAULT 'facility',
      sport_category TEXT DEFAULT 'gym',
      platform TEXT DEFAULT 'google_maps',
      social_handle TEXT DEFAULT '',
      social_url TEXT DEFAULT '',
      evidence_type TEXT DEFAULT 'profile_bio',
      evidence_snippet TEXT DEFAULT '',
      evidence_url TEXT DEFAULT '',
      phone TEXT,
      secondary_phones TEXT DEFAULT '',
      is_mobile INTEGER DEFAULT 0,
      zalo_url TEXT DEFAULT '',
      email TEXT DEFAULT '',
      facebook_url TEXT DEFAULT '',
      website TEXT DEFAULT '',
      google_maps_url TEXT DEFAULT '',
      address TEXT DEFAULT '',
      province TEXT DEFAULT '',
      district TEXT DEFAULT '',
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      potential_score INTEGER DEFAULT 50,
      expected_students INTEGER DEFAULT 1,
      status TEXT DEFAULT 'new',
      source TEXT DEFAULT 'google_maps',
      contact_person TEXT DEFAULT '',
      outreach_count INTEGER DEFAULT 0,
      last_contacted_at TEXT,
      next_follow_up_at TEXT,
      notes TEXT DEFAULT '',
      updated_by_device TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vtc_cloud_students (
      id SERIAL PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      cccd_number TEXT DEFAULT '',
      sport_course TEXT NOT NULL,
      batch_month TEXT NOT NULL,
      tuition_fee INTEGER DEFAULT 6500000,
      discount_amount INTEGER DEFAULT 0,
      paid_amount INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'deposit',
      doc_cccd INTEGER DEFAULT 0,
      doc_diploma INTEGER DEFAULT 0,
      doc_photo INTEGER DEFAULT 0,
      doc_form INTEGER DEFAULT 0,
      exam_status TEXT DEFAULT 'waiting',
      notes TEXT DEFAULT '',
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

function buildLeadUniqueKey(lead) {
  if (lead.phone && lead.phone.trim()) return `phone:${lead.phone.trim()}`;
  if (lead.social_url && lead.social_url.trim()) return `url:${lead.social_url.trim().toLowerCase()}`;
  if (lead.social_handle && lead.social_handle.trim()) return `handle:${lead.platform}:${lead.social_handle.trim().toLowerCase()}`;
  return `name:${lead.lead_type}:${(lead.name || '').trim().toLowerCase()}:${(lead.province || '').trim().toLowerCase()}`;
}

/**
 * Thực hiện Đồng bộ 2 chiều (Two-Way Sync) giữa Local SQLite và Cloud PostgreSQL (Supabase / Neon)
 */
async function syncWithCloud(customUrl = null) {
  if (lastSyncState.syncing) {
    return lastSyncState;
  }

  const pool = await getPgPool(customUrl);
  if (!pool) {
    lastSyncState.connected = false;
    lastSyncState.lastError = 'Chưa cấu hình chuỗi kết nối Cloud PostgreSQL (Supabase / Neon).';
    return lastSyncState;
  }

  lastSyncState.syncing = true;
  lastSyncState.lastError = null;
  const deviceName = getSetting('device_name', os.hostname());

  try {
    await ensureCloudSchema(pool);
    lastSyncState.connected = true;

    // 1. PUSH: Đẩy toàn bộ Cơ sở B2B & Khách hàng Cá nhân B2C từ máy hiện tại lên Cloud
    const localLeads = db.prepare('SELECT * FROM leads ORDER BY id ASC').all();
    let pushedLeads = 0;

    for (const l of localLeads) {
      const uKey = buildLeadUniqueKey(l);
      await pool.query(`
        INSERT INTO vtc_cloud_leads (
          unique_key, name, lead_type, lead_intent, sport_category, platform, social_handle, social_url,
          evidence_type, evidence_snippet, evidence_url, phone, secondary_phones, is_mobile, zalo_url,
          email, facebook_url, website, google_maps_url, address, province, district,
          rating, review_count, potential_score, expected_students, status, source,
          contact_person, outreach_count, last_contacted_at, next_follow_up_at, notes, updated_by_device, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22,
          $23, $24, $25, $26, $27, $28,
          $29, $30, $31, $32, $33, $34, NOW()
        )
        ON CONFLICT (unique_key) DO UPDATE SET
          status = CASE WHEN EXCLUDED.outreach_count >= vtc_cloud_leads.outreach_count THEN EXCLUDED.status ELSE vtc_cloud_leads.status END,
          outreach_count = GREATEST(vtc_cloud_leads.outreach_count, EXCLUDED.outreach_count),
          last_contacted_at = COALESCE(EXCLUDED.last_contacted_at, vtc_cloud_leads.last_contacted_at),
          next_follow_up_at = COALESCE(EXCLUDED.next_follow_up_at, vtc_cloud_leads.next_follow_up_at),
          phone = COALESCE(EXCLUDED.phone, vtc_cloud_leads.phone),
          evidence_snippet = CASE WHEN EXCLUDED.evidence_snippet != '' THEN EXCLUDED.evidence_snippet ELSE vtc_cloud_leads.evidence_snippet END,
          evidence_url = CASE WHEN EXCLUDED.evidence_url != '' THEN EXCLUDED.evidence_url ELSE vtc_cloud_leads.evidence_url END,
          notes = CASE WHEN EXCLUDED.notes != '' THEN EXCLUDED.notes ELSE vtc_cloud_leads.notes END,
          updated_by_device = EXCLUDED.updated_by_device,
          updated_at = NOW()
      `, [
        uKey, l.name, l.lead_type, l.lead_intent, l.sport_category, l.platform, l.social_handle, l.social_url,
        l.evidence_type, l.evidence_snippet, l.evidence_url, l.phone, l.secondary_phones, l.is_mobile, l.zalo_url,
        l.email, l.facebook_url, l.website, l.google_maps_url, l.address, l.province, l.district,
        l.rating, l.review_count, l.potential_score, l.expected_students, l.status, l.source,
        l.contact_person, l.outreach_count, l.last_contacted_at, l.next_follow_up_at, l.notes, deviceName
      ]);
      pushedLeads++;
    }

    // 2. PULL: Tải toàn bộ Cơ sở B2B & Khách cá nhân B2C từ Cloud (do các thiết bị khác cập nhật) về máy hiện tại
    const cloudLeadsRes = await pool.query('SELECT * FROM vtc_cloud_leads ORDER BY id ASC');
    let pulledLeads = 0;

    for (const cl of cloudLeadsRes.rows) {
      const res = upsertLead(cl);
      if (res.action === 'inserted') {
        pulledLeads++;
      } else if (res.leadId) {
        // Đồng bộ trạng thái tiếp cận nếu trên Cloud có số lần liên hệ lớn hơn
        db.prepare(`
          UPDATE leads
          SET status = CASE WHEN ? > outreach_count THEN ? ELSE status END,
              outreach_count = MAX(outreach_count, ?),
              last_contacted_at = COALESCE(?, last_contacted_at),
              next_follow_up_at = COALESCE(?, next_follow_up_at)
          WHERE id = ?
        `).run(cl.outreach_count || 0, cl.status, cl.outreach_count || 0, cl.last_contacted_at, cl.next_follow_up_at, res.leadId);
      }
    }

    // 3. ĐỒNG BỘ HỌC VIÊN ĐÃ CHỐT (KPI 100 HỌC VIÊN / THÁNG)
    const localStudents = db.prepare('SELECT * FROM students ORDER BY id ASC').all();
    let pushedStudents = 0;
    for (const s of localStudents) {
      if (!s.phone) continue;
      await pool.query(`
        INSERT INTO vtc_cloud_students (
          phone, full_name, cccd_number, sport_course, batch_month,
          tuition_fee, discount_amount, paid_amount, payment_status,
          doc_cccd, doc_diploma, doc_photo, doc_form, exam_status, notes, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
        ON CONFLICT (phone) DO UPDATE SET
          paid_amount = GREATEST(vtc_cloud_students.paid_amount, EXCLUDED.paid_amount),
          doc_cccd = GREATEST(vtc_cloud_students.doc_cccd, EXCLUDED.doc_cccd),
          doc_diploma = GREATEST(vtc_cloud_students.doc_diploma, EXCLUDED.doc_diploma),
          doc_photo = GREATEST(vtc_cloud_students.doc_photo, EXCLUDED.doc_photo),
          exam_status = EXCLUDED.exam_status,
          updated_at = NOW()
      `, [
        s.phone, s.full_name, s.cccd_number, s.sport_course, s.batch_month,
        s.tuition_fee, s.discount_amount, s.paid_amount, s.payment_status,
        s.doc_cccd, s.doc_diploma, s.doc_photo, s.doc_form, s.exam_status, s.notes
      ]);
      pushedStudents++;
    }

    const cloudStudentsRes = await pool.query('SELECT * FROM vtc_cloud_students ORDER BY id ASC');
    let pulledStudents = 0;
    for (const cs of cloudStudentsRes.rows) {
      const ex = db.prepare('SELECT id FROM students WHERE phone = ?').get(cs.phone);
      if (!ex) {
        db.prepare(`
          INSERT INTO students (
            full_name, phone, cccd_number, sport_course, batch_month,
            tuition_fee, discount_amount, paid_amount, payment_status,
            doc_cccd, doc_diploma, doc_photo, doc_form, exam_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cs.full_name, cs.phone, cs.cccd_number, cs.sport_course, cs.batch_month,
          cs.tuition_fee, cs.discount_amount, cs.paid_amount, cs.payment_status,
          cs.doc_cccd, cs.doc_diploma, cs.doc_photo, cs.doc_form, cs.exam_status, cs.notes
        );
        pulledStudents++;
      }
    }

    const nowStr = new Date().toLocaleString('vi-VN');
    setSetting('last_synced_at', nowStr);

    Object.assign(lastSyncState, {
      connected: true,
      syncing: false,
      lastSyncedAt: nowStr,
      lastError: null,
      pushedLeads,
      pulledLeads,
      pushedStudents,
      pulledStudents
    });
  } catch (err) {
    let errorMsg = err.message || 'Lỗi kết nối không xác định';
    if (errorMsg.includes('ENOTFOUND') && (errorMsg.includes('db.') || errorMsg.includes('.supabase.co:') || errorMsg.includes('.supabase.co '))) {
      errorMsg = 'Lỗi phân giải tên miền Supabase Direct (IPv6). Mạng Internet của bạn không hỗ trợ IPv6. Vui lòng chuyển sang dùng Connection Pooling (aws-0-*.pooler.supabase.com) của Supabase để hỗ trợ mạng IPv4.';
    } else if (errorMsg.includes('password authentication failed') || errorMsg.includes('auth failed')) {
      errorMsg = 'Sai mật khẩu kết nối Supabase. Vui lòng kiểm tra lại mật khẩu dự án trong Supabase -> Project Settings -> Database.';
    } else if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('connect ETIMEDOUT')) {
      errorMsg = 'Quá thời gian kết nối (ETIMEDOUT). Vui lòng dùng Connection Pooling port 5432 / 6543 của Supabase.';
    }

    Object.assign(lastSyncState, {
      connected: false,
      syncing: false,
      lastError: errorMsg
    });
  }

  return lastSyncState;
}

function getCloudSyncStatus(port = 3000) {
  const configuredUrl = getSetting('cloud_postgres_url') || process.env.DATABASE_URL || '';
  const maskedUrl = maskConnectionString(configuredUrl);

  return {
    configured: Boolean(configuredUrl),
    maskedUrl,
    deviceName: getSetting('device_name', os.hostname()),
    lastSyncedAt: getSetting('last_synced_at', ''),
    lanUrls: getLocalNetworkUrls(port),
    ...lastSyncState
  };
}

async function clearCloudData(target = 'all') {
  try {
    const pool = await getPgPool();
    if (!pool) return;
    await ensureCloudSchema(pool);
    if (target === 'B2B' || target === 'B2C') {
      await pool.query('DELETE FROM vtc_cloud_leads WHERE lead_type = $1', [target]);
    } else {
      await pool.query('TRUNCATE TABLE vtc_cloud_leads, vtc_cloud_students RESTART IDENTITY');
    }
  } catch (_) {}
}

module.exports = {
  getLocalNetworkUrls,
  syncWithCloud,
  clearCloudData,
  getCloudSyncStatus
};
