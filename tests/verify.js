const assert = require('node:assert');
const {
  normalizePhone,
  isMobilePhone,
  extractPhonesFromText,
  parseSocialIdentity,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent
} = require('../src/utils/phoneParser');
const { buildPlatformQueries } = require('../src/crawlers/socialB2CCrawler');
const { db, upsertLead, addOutreachLog } = require('../src/db/database');
const app = require('../src/server');

async function runVerification() {
  console.log('--- 1. Kiểm thử Nhận diện Mạng Xã Hội (TikTok, IG, FB, Telegram, X) & Phân loại Cá nhân B2C ---');
  assert.strictEqual(normalizePhone('+84 988.123.456'), '0988123456');
  assert.strictEqual(isMobilePhone('0988123456'), true);

  const tt = parseSocialIdentity('https://www.tiktok.com/@coach_minh_gym');
  assert.strictEqual(tt.platform, 'tiktok');
  assert.strictEqual(tt.handle, '@coach_minh_gym');

  const ig = parseSocialIdentity('https://www.instagram.com/yogaby_lan/');
  assert.strictEqual(ig.platform, 'instagram');
  assert.strictEqual(ig.handle, '@yogaby_lan');

  const tg = parseSocialIdentity('https://t.me/pt_fitness_vn');
  assert.strictEqual(tg.platform, 'telegram');
  assert.strictEqual(tg.handle, '@pt_fitness_vn');

  const xt = parseSocialIdentity('https://x.com/vietnam_trainer');
  assert.strictEqual(xt.platform, 'x');
  assert.strictEqual(xt.handle, '@vietnam_trainer');

  assert.strictEqual(detectLeadType('PT Tuấn nhận dạy kèm 1:1', '', 'https://www.tiktok.com/@pt_tuan'), 'B2C');
  assert.strictEqual(detectLeadIntent('Học chứng chỉ PT Cục TDTT ở đâu', '', 'B2C'), 'cert_hunter');
  assert.strictEqual(detectLeadIntent('Tìm việc làm PT Gym ca tối', '', 'B2C'), 'job_seeker');

  const queries = buildPlatformQueries({
    sportCategory: 'dance',
    province: 'Hà Nội',
    platforms: ['tiktok', 'facebook', 'instagram', 'telegram', 'x'],
    b2cMode: 'all'
  });
  assert.ok(queries.length >= 6);
  console.log('✅ Bộ nhận diện 6 nền tảng MXH & Phân loại Khách hàng Cá nhân (B2C) hoạt động chính xác!');

  console.log('\n--- 2. Kiểm thử Chống Trùng Lặp cho Cá Nhân Ẩn SĐT (Lưu theo @handle / Link Profile MXH) ---');
  const testHandle = '@test_tiktok_b2c_coach';
  db.prepare('DELETE FROM leads WHERE social_handle = ?').run(testHandle);

  // Lần quét 1: Cá nhân trên TikTok chỉ có @handle và Link Profile, chưa công khai SĐT
  const firstB2C = upsertLead({
    name: 'Cô Giáo Shuffle Dance Test B2C',
    lead_type: 'B2C',
    sport_category: 'dance',
    platform: 'tiktok',
    social_handle: testHandle,
    social_url: 'https://www.tiktok.com/@test_tiktok_b2c_coach',
    province: 'Hà Nội'
  });
  assert.strictEqual(firstB2C.action, 'inserted');

  // Ghi nhận đã nhắn TikTok DM cho khách cá nhân này
  const afterDmLog = addOutreachLog({
    lead_id: firstB2C.leadId,
    channel: 'tiktok_dm',
    outcome: 'answered_interested',
    note: 'Đã nhắn TikTok DM, khách quan tâm khóa Dân vũ QĐ 557'
  });
  assert.strictEqual(afterDmLog.status, 'interested');

  // Lần quét 2: Quét trúng lại đúng kênh TikTok này -> Phải nhận diện trùng và bảo toàn lịch sử đã nhắn DM!
  const secondB2C = upsertLead({
    name: 'Cô Giáo Shuffle Dance Test B2C',
    social_url: 'https://www.tiktok.com/@test_tiktok_b2c_coach',
    province: 'Hà Nội'
  });
  assert.strictEqual(secondB2C.action, 'skipped_duplicate');
  assert.strictEqual(secondB2C.existingStatus, 'interested');
  console.log('✅ Cơ chế chống trùng & bảo toàn lịch sử nhắn DM cho Khách hàng Cá nhân MXH hoạt động hoàn hảo!');

  console.log('\n--- 3. Kiểm thử REST API Lọc Khách hàng Cá nhân (B2C) & Đa Nền Tảng ---');
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const kpiRes = await fetch(`${baseUrl}/api/dashboard/kpi`);
    assert.strictEqual(kpiRes.status, 200);
    const kpiData = await kpiRes.json();
    assert.ok(kpiData.funnel.b2c_count >= 1);

    const b2cRes = await fetch(`${baseUrl}/api/leads?lead_type=B2C&platform=tiktok`);
    assert.strictEqual(b2cRes.status, 200);
    const b2cData = await b2cRes.json();
    assert.ok(b2cData.leads.some(l => l.id === firstB2C.leadId));

    console.log('✅ REST API Lọc Khách hàng Cá nhân (B2C) theo từng nền tảng MXH hoạt động chuẩn xác!');
  } finally {
    db.prepare('DELETE FROM leads WHERE id = ?').run(firstB2C.leadId);
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
