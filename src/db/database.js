const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {
  normalizePhone,
  isMobilePhone,
  unwrapSearchRedirectUrl,
  parseSocialIdentity,
  validateLeadRelevance,
  classifyEvidenceType,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent,
  calculatePotentialScore,
  estimateStudentsCount
} = require('../utils/phoneParser');

const DATA_DIR = path.join(__dirname, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'vtc_sport_crm.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

function initDatabase() {
  db.exec(`
    -- 1. Bảng Cơ sở Tập luyện (B2B) & Khách hàng Cá nhân (B2C)
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 2. Bảng Kho Bằng Chứng Bài Viết Cá Nhân (Lead Evidences)
    CREATE TABLE IF NOT EXISTS lead_evidences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      evidence_type TEXT NOT NULL,
      title TEXT DEFAULT '',
      content_snippet TEXT NOT NULL,
      post_url TEXT DEFAULT '',
      captured_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    -- 3. Bảng Lịch sử Tiếp cận (Outreach Logs)
    CREATE TABLE IF NOT EXISTS outreach_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      outcome TEXT NOT NULL,
      message_sent TEXT DEFAULT '',
      note TEXT DEFAULT '',
      next_follow_up_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    -- 4. Bảng Học viên Đã Chốt Đăng ký (Enrolled Students - KPI 100 HV/Tháng)
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
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
      enrolled_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    -- 5. Bảng Lịch sử Chiến dịch Quét
    CREATE TABLE IF NOT EXISTS crawl_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      province TEXT NOT NULL,
      sport_category TEXT NOT NULL,
      source TEXT NOT NULL,
      total_found INTEGER DEFAULT 0,
      new_inserted INTEGER DEFAULT 0,
      duplicates_skipped INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      log_summary TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT
    );

    -- 6. Bảng Kịch bản Chốt đơn VTC
    CREATE TABLE IF NOT EXISTS script_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sport_category TEXT NOT NULL,
      target_type TEXT NOT NULL,
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 7. Bảng Cấu hình Hệ thống & Kết nối Cloud Database Đa thiết bị
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  const existingCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
  const migrations = [
    { col: 'lead_intent', sql: "ALTER TABLE leads ADD COLUMN lead_intent TEXT DEFAULT 'facility'" },
    { col: 'platform', sql: "ALTER TABLE leads ADD COLUMN platform TEXT DEFAULT 'google_maps'" },
    { col: 'social_handle', sql: "ALTER TABLE leads ADD COLUMN social_handle TEXT DEFAULT ''" },
    { col: 'social_url', sql: "ALTER TABLE leads ADD COLUMN social_url TEXT DEFAULT ''" },
    { col: 'evidence_type', sql: "ALTER TABLE leads ADD COLUMN evidence_type TEXT DEFAULT 'profile_bio'" },
    { col: 'evidence_snippet', sql: "ALTER TABLE leads ADD COLUMN evidence_snippet TEXT DEFAULT ''" },
    { col: 'evidence_url', sql: "ALTER TABLE leads ADD COLUMN evidence_url TEXT DEFAULT ''" }
  ];
  for (const m of migrations) {
    if (!existingCols.includes(m.col)) {
      db.exec(m.sql);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_sport ON leads(sport_category);
    CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform);
    CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);
    CREATE INDEX IF NOT EXISTS idx_leads_social_url ON leads(social_url);
    CREATE INDEX IF NOT EXISTS idx_evidences_lead_id ON lead_evidences(lead_id);
  `);

  const devName = getSetting('device_name');
  if (!devName) {
    setSetting('device_name', os.hostname() || 'May-Tinh-Chinh');
  }
  if (process.env.DATABASE_URL && !getSetting('cloud_postgres_url')) {
    setSetting('cloud_postgres_url', process.env.DATABASE_URL);
  }

  seedDefaultScripts();
  purgeInvalidLeads();
}

/**
 * Tự động quét và dọn sạch mọi bản ghi nhiễu/lỗi cũ (nếu có tiến trình cũ chèn link bing.com/ck/a hoặc hồ sơ không hợp lệ)
 */
function purgeInvalidLeads() {
  try {
    const allLeads = db.prepare("SELECT * FROM leads WHERE source != 'manual'").all();
    for (const l of allLeads) {
      const check = validateLeadRelevance({
        name: l.name,
        text: `${l.evidence_snippet || ''} ${l.notes || ''}`,
        url: l.evidence_url || l.social_url || l.google_maps_url || '',
        leadType: l.lead_type || 'B2C',
        sportCategory: l.sport_category || 'gym',
        expectedPlatform: l.lead_type === 'B2C' ? l.platform : '',
        requireSocialDomain: l.lead_type === 'B2C' && l.platform !== 'zalo'
      });

      if (!check.isValid) {
        deleteLeadById(l.id);
      } else if (l.social_url && l.social_url.includes('bing.com/ck/a')) {
        const cleanSocial = unwrapSearchRedirectUrl(l.social_url);
        const cleanEv = unwrapSearchRedirectUrl(l.evidence_url || l.social_url);
        db.prepare('UPDATE leads SET social_url = ?, evidence_url = ? WHERE id = ?').run(cleanSocial, cleanEv, l.id);
      }
    }
  } catch (_) {}
}

function getSetting(key, defaultValue = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now', 'localtime')
  `).run(key, String(value ?? ''));
}

/**
 * Xóa an toàn 1 hồ sơ Lead theo ID (Xóa kèm bằng chứng & lịch sử liên hệ, gỡ liên kết học viên để không bao giờ lỗi khóa ngoại)
 */
function deleteLeadById(leadId) {
  const id = Number(leadId);
  if (!id || Number.isNaN(id)) return { deleted: 0 };

  try {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.prepare('DELETE FROM lead_evidences WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM outreach_logs WHERE lead_id = ?').run(id);
    db.prepare('UPDATE students SET lead_id = NULL WHERE lead_id = ?').run(id);
    const info = db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    return { deleted: info.changes || 0 };
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON;');
    } catch (_) {}
  }
}

/**
 * Xóa sạch dữ liệu trong hệ thống (Hỗ trợ xóa toàn bộ 'all', hoặc xóa riêng 'B2B', hoặc xóa riêng 'B2C')
 * Tắt tạm thời foreign_keys khi xóa để đảm bảo không bao giờ bị lỗi ràng buộc khóa ngoại trên mọi phiên bản SQLite
 */
function clearAllData(target = 'all') {
  const normalizedTarget = String(target || 'all').trim();

  try {
    db.exec('PRAGMA foreign_keys = OFF;');

    if (normalizedTarget === 'B2B' || normalizedTarget === 'B2C') {
      db.prepare(`
        DELETE FROM lead_evidences
        WHERE lead_id IN (SELECT id FROM leads WHERE lead_type = ?)
      `).run(normalizedTarget);

      db.prepare(`
        DELETE FROM outreach_logs
        WHERE lead_id IN (SELECT id FROM leads WHERE lead_type = ?)
      `).run(normalizedTarget);

      db.prepare(`
        UPDATE students
        SET lead_id = NULL
        WHERE lead_id IN (SELECT id FROM leads WHERE lead_type = ?)
      `).run(normalizedTarget);

      const info = db.prepare('DELETE FROM leads WHERE lead_type = ?').run(normalizedTarget);
      return { success: true, cleared: normalizedTarget, deletedCount: info.changes || 0 };
    }

    db.exec(`
      DELETE FROM lead_evidences;
      DELETE FROM outreach_logs;
      DELETE FROM students;
      DELETE FROM leads;
      DELETE FROM crawl_campaigns;
    `);

    try {
      db.exec(`
        DELETE FROM sqlite_sequence
        WHERE name IN ('leads', 'lead_evidences', 'outreach_logs', 'students', 'crawl_campaigns');
      `);
    } catch (_) {}

    return { success: true, cleared: 'all' };
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON;');
    } catch (_) {}
  }
}

function seedDefaultScripts() {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM script_templates').get().cnt;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO script_templates (title, sport_category, target_type, stage, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  const scripts = [
    {
      title: '[B2C Cá nhân - Theo Bằng Chứng Bài Viết] Nhắn PT Gym từ bài đăng Threads/TikTok/FB/Zalo',
      sport_category: 'gym',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào Coach / PT {{name}} ({{handle}}) ạ! 👋
Mình vừa đọc được bài viết/chia sẻ của bạn trên {{platform}} ("{{evidence}}") tại {{province}}, thấy chuyên môn huấn luyện của bạn rất tốt!
Mình liên hệ từ bộ phận Tuyển sinh Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).

Hiện Cục Thể dục Thể thao Việt Nam phối hợp cùng Học viện VTC đang mở lớp Tập huấn cấp "Giấy chứng nhận chuyên môn HLV Thể dục Thể hình & Fitness" (QĐ 3843/QĐ-BVHTTDL):
✅ Văn bằng chính quy do CỤC THỂ DỤC THỂ THAO VIỆT NAM cấp (giá trị toàn quốc & vô thời hạn).
✅ Học Lý thuyết ONLINE từ xa, không làm gián đoạn lịch dạy khách 1:1 hàng ngày của bạn.

Không biết {{name}} đã có chứng chỉ của Cục TDTT chưa để mình gửi lịch khai giảng khóa gần nhất cho bạn tham khảo nhé?`
    },
    {
      title: '[B2C Cá nhân - Cô giáo Yoga] Nhắn từ Bằng chứng Bài viết mở lớp trên Threads/IG/FB/Zalo',
      sport_category: 'yoga',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào cô giáo / HLV Yoga {{name}} ({{handle}}) ạ! 🧘‍♀️
Mình vừa thấy bài chia sẻ của bạn trên {{platform}} ("{{evidence}}") tại {{province}}.
Mình bên bộ phận Tuyển sinh Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).

Hiện nay theo Nghị định 36/2019/NĐ-CP, bên cạnh bằng Yoga 200h/300h, các HLV Yoga khi đứng lớp hoặc mở phòng tập hợp pháp tại Việt Nam bắt buộc phải có "Giấy chứng nhận tập huấn chuyên môn Yoga do Cục Thể dục Thể thao Việt Nam cấp".
Khóa tập huấn của VTC học Lý thuyết ONLINE tại nhà + chỉ tập trung ngắn ngày thi thực hành. Mình gửi thông tin chi tiết để {{name}} tham khảo bổ sung văn bằng Nhà nước nhé ạ!`
    },
    {
      title: '[B2C Cá nhân - Giáo viên Zumba / Shuffle Dance / Dân vũ] Nhắn từ Video/Bài viết mở lớp',
      sport_category: 'dance',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào HLV / Giáo viên {{name}} ({{handle}}) ạ! 💃
Mình vừa xem bài viết/video hướng dẫn nhảy của bạn trên {{platform}} ("{{evidence}}") rất năng lượng!
Hiện Bộ VHTTDL đã ban hành Quyết định 557/QĐ-BVHTTDL cấp chứng chỉ hành nghề chính thức cho môn "Dân vũ thể thao & Vũ đạo thể thao giải trí" (Zumba, Shuffle Dance, Hip hop, Aerobic, Khiêu vũ...).
Có Giấy chứng nhận do CỤC THỂ DỤC THỂ THAO VIỆT NAM cấp qua khóa học Lý thuyết Online của VTC, bạn hoàn toàn đủ pháp lý tự mở lớp thu học phí hoặc dạy tại các Trung tâm, Trường học toàn quốc. Mình gửi lịch khai giảng để bạn tham khảo nhé!`
    },
    {
      title: '[B2B Cơ sở Tập luyện] Tiếp cận Chủ Phòng Tập / CLB chuẩn hóa Pháp lý & Đội ngũ HLV (Chốt sỉ 3-5 HV)',
      sport_category: 'gym',
      target_type: 'B2B',
      stage: 'first_touch',
      content: `Chào anh/chị Quản lý {{name}} tại {{province}} ạ!
Em liên hệ từ bộ phận Tuyển sinh Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).
Hiện Cục Thể dục Thể thao Việt Nam phối hợp cùng VTC đang mở đợt Tập huấn cấp "Giấy chứng nhận chuyên môn Huấn luyện viên" (theo Thông tư 07/2021 & Nghị định 36/2019/NĐ-CP).
- Chứng nhận do CỤC TDTT VIỆT NAM cấp (giá trị toàn quốc để cơ sở hoàn thiện hồ sơ pháp lý khi đoàn liên ngành kiểm tra).
- Học Lý thuyết ONLINE từ xa, đội ngũ PT/HLV của {{name}} không phải nghỉ dạy. Có ưu đãi giảm học phí khi cơ sở đăng ký theo nhóm từ 2-5 HLV.
Em xin phép gửi thông tin lịch khai giảng và biểu phí ưu đãi nhóm qua Zalo cho anh/chị tham khảo ạ!`
    },
    {
      title: '[B2B Cơ sở Tuyển sinh] Hợp tác cấp chứng chỉ Cục TDTT cho đội ngũ HLV chiêu sinh mở lớp',
      sport_category: 'dance',
      target_type: 'B2B',
      stage: 'first_touch',
      content: `Chào anh/chị Quản lý CLB / Studio {{name}} tại {{province}} ạ! 💃✨
Em liên hệ từ bộ phận Tuyển sinh & Đào tạo Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).
Em thấy bên mình đang chiêu sinh / mở lớp đào tạo mới ("{{evidence}}"). 
Hiện Cục Thể dục Thể thao đang triển khai đợt tập huấn cấp "Giấy chứng nhận chuyên môn HLV Dân vũ thể thao / Khiêu vũ / Zumba" chính quy:
- Giấy chứng nhận giúp các giáo viên/HLV đứng lớp của {{name}} đủ 100% điều kiện pháp lý mở lớp và cấp thẻ hội viên.
- Cơ sở đăng ký tập huấn theo nhóm từ 3-5 HLV được hỗ trợ ưu đãi học phí liên kết B2B và học Lý thuyết Online linh hoạt.
Em xin phép gửi lịch khai giảng và chính sách ưu đãi đối tác cho cơ sở mình tham khảo nhé ạ!`
    },
    {
      title: '[B2B Cơ sở Tuyển sinh] Liên kết cấp chứng chỉ Võ thuật / Kickfit cho Võ sinh & HLV',
      sport_category: 'martial_arts',
      target_type: 'B2B',
      stage: 'first_touch',
      content: `Chào Ban chủ nhiệm Võ đường / CLB {{name}} tại {{province}} ạ! 🥋
Em liên hệ từ bộ phận Tuyển sinh Học viện Thể thao VTC phối hợp cùng Cục Thể dục Thể thao Việt Nam.
Em theo dõi thấy Võ đường đang có thông báo chiêu sinh võ sinh khóa mới ("{{evidence}}").
Hiện VTC đang tổ chức lớp tập huấn & cấp "Giấy chứng nhận chuyên môn HLV Võ cổ truyền / Kickfit" cấp Quốc gia:
- Bổ sung văn bằng chuẩn Cục TDTT cho các huấn luyện viên và trợ giảng đứng lớp tại các chi nhánh/võ đường.
- Hỗ trợ cơ sở liên kết tổ chức thi và cấp chứng chỉ cho môn sinh đạt chuẩn đai/đẳng.
Em xin phép gửi thông tin chi tiết qua Zalo để Thầy / Quản lý tham khảo ạ!`
    },
    {
      title: '[B2B Cơ sở Tuyển sinh] Chuẩn hóa chứng chỉ HLV Yoga trị liệu cho Studio / CLB chiêu sinh',
      sport_category: 'yoga',
      target_type: 'B2B',
      stage: 'first_touch',
      content: `Chào anh/chị Quản lý Studio Yoga {{name}} tại {{province}} ạ! 🧘
Em liên hệ từ Học viện Thể thao VTC. Em thấy Studio mình đang thông báo chiêu sinh / mở khóa học mới ("{{evidence}}").
Theo quy định pháp luật thể thao hiện hành, các giáo viên Yoga đứng lớp tại Studio bắt buộc phải có Giấy chứng nhận tập huấn chuyên môn do Cục Thể dục Thể thao Việt Nam cấp.
VTC đang có chương trình phối hợp cùng các Studio Yoga: đào tạo Lý thuyết Online tại nhà + hỗ trợ cấp chứng chỉ Cục TDTT cho toàn bộ đội ngũ giáo viên của Studio với chi phí ưu đãi nhóm.
Em xin phép gửi lịch thi và chi tiết chương trình cho anh/chị tham khảo ạ!`
    }
  ];

  for (const s of scripts) {
    insert.run(s.title, s.sport_category, s.target_type, s.stage, s.content);
  }
}

function addLeadEvidence({ lead_id, platform = 'web', evidence_type = 'post_teaching', title = '', content_snippet = '', post_url = '' }) {
  if (!lead_id || !content_snippet) return null;
  const cleanPostUrl = unwrapSearchRedirectUrl(post_url);

  const existing = db.prepare(`
    SELECT id FROM lead_evidences
    WHERE lead_id = ? AND (post_url = ? OR content_snippet = ?)
  `).get(lead_id, cleanPostUrl || '', content_snippet.trim());

  if (existing) return existing.id;

  const res = db.prepare(`
    INSERT INTO lead_evidences (lead_id, platform, evidence_type, title, content_snippet, post_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(lead_id, platform, evidence_type, title, content_snippet.trim(), cleanPostUrl || '');

  db.prepare(`
    UPDATE leads
    SET evidence_type = ?, evidence_snippet = ?, evidence_url = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(evidence_type, content_snippet.trim().slice(0, 350), cleanPostUrl || '', lead_id);

  return Number(res.lastInsertRowid);
}

/**
 * Thêm mới hoặc Cập nhật Cơ sở (B2B) / Khách hàng Cá nhân (B2C)
 * Tự động giải mã URL thật và kiểm duyệt độ chính xác
 */
function upsertLead(rawLead) {
  const normPhone = normalizePhone(rawLead.phone);
  const rawUrlToParse = unwrapSearchRedirectUrl(
    rawLead.evidence_url || rawLead.social_url || rawLead.facebook_url || rawLead.website || ''
  );

  const socialIdentity = parseSocialIdentity(
    rawUrlToParse,
    `${rawLead.name || ''} ${rawLead.evidence_snippet || ''} ${rawLead.notes || ''}`
  );

  const platform = rawLead.platform || socialIdentity.platform || 'web';
  const socialHandle = rawLead.social_handle || socialIdentity.handle || '';
  const socialUrl = unwrapSearchRedirectUrl(rawLead.social_url || socialIdentity.socialUrl || rawLead.facebook_url || '');
  const evidenceUrl = unwrapSearchRedirectUrl(rawLead.evidence_url || socialIdentity.rawEvidenceUrl || socialUrl);
  const evidenceSnippet = (rawLead.evidence_snippet || rawLead.notes || '').trim();
  const evidenceType = rawLead.evidence_type || classifyEvidenceType(evidenceUrl, evidenceSnippet);

  const sportCategory = rawLead.sport_category || detectSportCategory(`${rawLead.name} ${evidenceSnippet}`);
  const leadType = rawLead.lead_type || detectLeadType(rawLead.name, evidenceSnippet, socialUrl);
  const leadIntent = rawLead.lead_intent || detectLeadIntent(rawLead.name, evidenceSnippet, leadType);

  // Nếu không phải thêm thủ công (source !== 'manual'), bắt buộc kiểm tra qua Bộ lọc Độ chính xác 4 tầng
  if (rawLead.source && rawLead.source !== 'manual') {
    const check = validateLeadRelevance({
      name: rawLead.name,
      text: `${evidenceSnippet} ${rawLead.notes || ''}`,
      url: evidenceUrl || socialUrl || rawLead.google_maps_url,
      leadType,
      sportCategory,
      expectedPlatform: leadType === 'B2C' ? platform : '',
      requireSocialDomain: leadType === 'B2C' && platform !== 'zalo'
    });
    if (!check.isValid) {
      return { action: 'rejected_irrelevant', reason: check.reason };
    }
  }

  const mobileFlag = normPhone && isMobilePhone(normPhone) ? 1 : 0;
  const zaloUrl = mobileFlag ? `https://zalo.me/${normPhone}` : (platform === 'zalo' ? socialUrl : '');

  let existing = null;
  if (normPhone) {
    existing = db.prepare('SELECT * FROM leads WHERE phone = ?').get(normPhone);
  }
  if (!existing && socialUrl && socialUrl.length > 12) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(social_url) = lower(?)').get(socialUrl);
  }
  if (!existing && socialHandle && socialHandle.length > 3) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(social_handle) = lower(?) AND platform = ?')
      .get(socialHandle, platform);
  }
  if (!existing && rawLead.name && rawLead.province) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(name) = lower(?) AND lower(province) = lower(?) AND lead_type = ?')
      .get(rawLead.name.trim(), rawLead.province.trim(), leadType);
  }

  const score = calculatePotentialScore({
    phone: normPhone,
    social_handle: socialHandle,
    social_url: socialUrl,
    facebook_url: rawLead.facebook_url,
    website: rawLead.website,
    review_count: rawLead.review_count,
    address: rawLead.address,
    lead_intent: leadIntent,
    evidence_type: evidenceType,
    evidence_snippet: evidenceSnippet
  });

  const expectedStudents = rawLead.expected_students || estimateStudentsCount(leadType, sportCategory);

  if (existing) {
    const updatedFb = existing.facebook_url || rawLead.facebook_url || (platform === 'facebook' ? socialUrl : '');
    const updatedSocialUrl = existing.social_url || socialUrl || '';
    const updatedHandle = existing.social_handle || socialHandle || '';
    const updatedPhone = existing.phone || normPhone || null;
    const updatedZalo = existing.zalo_url || zaloUrl || '';

    db.prepare(`
      UPDATE leads
      SET facebook_url = ?, social_url = ?, social_handle = ?, phone = ?, zalo_url = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(updatedFb, updatedSocialUrl, updatedHandle, updatedPhone, updatedZalo, existing.id);

    if (evidenceSnippet) {
      addLeadEvidence({
        lead_id: existing.id,
        platform,
        evidence_type: evidenceType,
        title: rawLead.name || existing.name,
        content_snippet: evidenceSnippet,
        post_url: evidenceUrl
      });
    }

    return { action: 'skipped_duplicate', leadId: existing.id, existingStatus: existing.status };
  }

  const stmt = db.prepare(`
    INSERT INTO leads (
      name, lead_type, lead_intent, sport_category, platform, social_handle, social_url,
      evidence_type, evidence_snippet, evidence_url,
      phone, secondary_phones, is_mobile, zalo_url,
      email, facebook_url, website, google_maps_url, address, province, district,
      rating, review_count, potential_score, expected_students, status, source,
      contact_person, next_follow_up_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    (rawLead.name || socialHandle || 'Học viên Tiềm năng').trim(),
    leadType,
    leadIntent,
    sportCategory,
    platform,
    socialHandle,
    socialUrl,
    evidenceType,
    evidenceSnippet.slice(0, 400),
    evidenceUrl,
    normPhone || null,
    rawLead.secondary_phones || '',
    mobileFlag,
    zaloUrl,
    rawLead.email || '',
    rawLead.facebook_url || (platform === 'facebook' ? socialUrl : ''),
    rawLead.website || '',
    rawLead.google_maps_url || '',
    rawLead.address || '',
    rawLead.province || '',
    rawLead.district || '',
    Number(rawLead.rating || 0),
    Number(rawLead.review_count || 0),
    score,
    expectedStudents,
    rawLead.status || 'new',
    rawLead.source || platform,
    rawLead.contact_person || socialHandle || '',
    rawLead.next_follow_up_at || null,
    rawLead.notes || evidenceSnippet.slice(0, 300)
  );

  const newLeadId = Number(result.lastInsertRowid);

  if (evidenceSnippet) {
    addLeadEvidence({
      lead_id: newLeadId,
      platform,
      evidence_type: evidenceType,
      title: rawLead.name || socialHandle,
      content_snippet: evidenceSnippet,
      post_url: evidenceUrl
    });
  }

  return { action: 'inserted', leadId: newLeadId };
}

function addOutreachLog({ lead_id, channel, outcome, message_sent = '', note = '', next_follow_up_date = null, new_status = null }) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) throw new Error('Không tìm thấy cơ sở/học viên tiềm năng');

  db.prepare(`
    INSERT INTO outreach_logs (lead_id, channel, outcome, message_sent, note, next_follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(lead_id, channel, outcome, message_sent, note, next_follow_up_date || null);

  let statusToSet = new_status || lead.status;
  if (!new_status) {
    if (outcome === 'enrolled') statusToSet = 'closed_won';
    else if (outcome === 'already_certified' || outcome === 'rejected') statusToSet = 'closed_lost';
    else if (outcome === 'answered_interested') statusToSet = 'interested';
    else if (outcome === 'callback_later') statusToSet = 'follow_up';
    else if (lead.status === 'new') statusToSet = 'contacted';
  }

  const followUpToSet = next_follow_up_date !== undefined ? next_follow_up_date : lead.next_follow_up_at;

  db.prepare(`
    UPDATE leads
    SET status = ?,
        outreach_count = outreach_count + 1,
        last_contacted_at = datetime('now', 'localtime'),
        next_follow_up_at = ?,
        notes = CASE WHEN ? != '' THEN ? ELSE notes END,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(statusToSet, followUpToSet || null, note, note, lead_id);

  return db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
}

function backupDatabase() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `vtc_sport_crm_backup_${dateStr}.sqlite`);
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupFile);
    }
    return backupFile;
  } catch (err) {
    console.error('Backup warning:', err.message);
    return null;
  }
}

initDatabase();

module.exports = {
  db,
  upsertLead,
  addLeadEvidence,
  addOutreachLog,
  deleteLeadById,
  clearAllData,
  purgeInvalidLeads,
  getSetting,
  setSetting,
  backupDatabase,
  DB_PATH
};
