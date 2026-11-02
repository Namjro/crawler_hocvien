const { chromium } = require('playwright');
const cheerio = require('cheerio');
const {
  normalizePhone,
  extractPhonesFromText,
  extractEmailsFromText,
  validateLeadRelevance,
  detectSportCategory
} = require('../utils/phoneParser');
const { db, upsertLead } = require('../db/database');
const { B2C_SPORT_KEYWORDS, crawlMultiPlatformSocialB2C } = require('./socialB2CCrawler');
const { B2B_ADMISSION_KEYWORDS, crawlB2BAdmissions } = require('./b2bAdmissionsCrawler');

const SPORT_KEYWORDS_PRESETS = {
  gym: [
    '"PT gym" nhận dạy kèm',
    '"Personal Trainer" kèm 1:1',
    '"Tìm việc PT" gym',
    '"chứng chỉ PT" gym',
    'Phòng tập Gym Fitness'
  ],
  yoga: [
    '"giáo viên Yoga" dạy kèm',
    '"HLV Yoga" trị liệu',
    '"tìm việc giáo viên Yoga"',
    '"chứng chỉ HLV Yoga"',
    'Studio Yoga Pilates'
  ],
  dance: [
    '"dạy nhảy Zumba" Shuffle Dance',
    '"lớp Shuffle Dance" Aerobic',
    '"giáo viên dạy nhảy" Zumba',
    '"chứng chỉ Dân vũ"',
    'CLB Zumba Shuffle Dance Khiêu vũ'
  ],
  martial_arts: [
    '"võ cổ truyền" dạy kèm',
    '"HLV Kickfit" Boxing',
    '"chứng chỉ võ cổ truyền"',
    'Võ đường Võ cổ truyền CLB Kickfit'
  ]
};

const activeCrawlState = {
  isRunning: false,
  campaignId: null,
  keyword: '',
  province: '',
  sportCategory: '',
  source: '',
  targetMode: 'all',
  platforms: ['all'],
  totalFound: 0,
  newInserted: 0,
  duplicatesSkipped: 0,
  rejectedNoise: 0,
  logs: []
};

function addCrawlLog(message) {
  const time = new Date().toLocaleTimeString('vi-VN');
  const line = `[${time}] ${message}`;
  activeCrawlState.logs.unshift(line);
  if (activeCrawlState.logs.length > 120) {
    activeCrawlState.logs.pop();
  }
}

function getCrawlState() {
  return { ...activeCrawlState };
}

async function enrichFromWebsite(page, url) {
  const result = { phones: [], emails: [], facebookUrl: '' };
  if (!url || !url.startsWith('http')) return result;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    const html = await page.content();
    const $ = cheerio.load(html);
    const bodyText = $('body').text() || '';

    result.phones = extractPhonesFromText(bodyText);
    result.emails = extractEmailsFromText(bodyText);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('facebook.com/') && !href.includes('sharer') && !result.facebookUrl) {
        result.facebookUrl = href;
      }
      if (href.startsWith('tel:')) {
        const p = normalizePhone(href.replace('tel:', ''));
        if (p && !result.phones.includes(p)) {
          result.phones.unshift(p);
        }
      }
    });
  } catch (_) {}
  return result;
}

/**
 * Quét dữ liệu Cơ sở Thể thao (B2B) từ Google Maps kèm Bộ Lọc Chống Nhiễu (Loại bỏ Bida, Bóng đá, Cafe...)
 */
async function crawlGoogleMaps(page, query, province, sportCategory, maxResults = 20) {
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query + ' ' + province)}?hl=vi`;
  addCrawlLog(`📍 [GOOGLE MAPS B2B] Đang tìm kiếm cơ sở: "${query} - ${province}"...`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForTimeout(2200);

  const feedSelector = 'div[role="feed"]';
  const hasFeed = await page.locator(feedSelector).count();

  if (hasFeed > 0) {
    for (let i = 0; i < 4; i++) {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollBy(0, 1200);
      }, feedSelector);
      await page.waitForTimeout(900);
    }
  }

  const places = await page.evaluate(() => {
    const items = [];
    const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
    const seenUrls = new Set();

    for (const a of links) {
      const href = a.href;
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      const container = a.closest('div[jsaction]') || a.parentElement;
      const rawText = container ? container.innerText : a.getAttribute('aria-label') || '';
      const name = a.getAttribute('aria-label') || (rawText.split('\n')[0] || '').trim();

      if (name && name.length > 2) {
        items.push({ name, google_maps_url: href, rawText });
      }
    }
    return items;
  });

  addCrawlLog(`📍 Tìm thấy ${places.length} địa điểm trên bản đồ. Đang lọc đúng bộ môn [${sportCategory.toUpperCase()}]...`);

  const collected = [];
  const limit = Math.min(places.length, maxResults + 10);

  for (let i = 0; i < limit; i++) {
    if (collected.length >= maxResults) break;
    const item = places[i];

    // Kiểm tra nhanh tên địa điểm trước khi mở trang chi tiết (Loại bỏ ngay CLB Bida, Billiards, Bóng đá...)
    const preCheck = validateLeadRelevance({
      name: item.name,
      text: item.rawText,
      url: item.google_maps_url,
      leadType: 'B2B',
      sportCategory
    });

    if (!preCheck.isValid) {
      activeCrawlState.rejectedNoise++;
      addCrawlLog(`🚫 [Đã lọc bỏ sai môn] ${item.name}`);
      continue;
    }

    try {
      await page.goto(item.google_maps_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const details = await page.evaluate(() => {
        const textContent = document.body ? document.body.innerText : '';
        let address = '';
        let phone = '';
        let website = '';
        let categoryText = '';
        let rating = 0;
        let reviewCount = 0;

        const catBtn = document.querySelector('button[jsaction*="pane.rating.category"]');
        if (catBtn) categoryText = catBtn.innerText.trim();

        const addrBtn = document.querySelector('button[data-item-id="address"]');
        if (addrBtn) address = addrBtn.innerText.trim();

        const phoneBtn = document.querySelector('button[data-item-id^="phone:tel:"]');
        if (phoneBtn) {
          phone = phoneBtn.getAttribute('data-item-id').replace('phone:tel:', '');
        }

        const webLink = document.querySelector('a[data-item-id="authority"]');
        if (webLink) website = webLink.href || '';

        const ratingEl = document.querySelector('div[role="img"][aria-label*="sao"], span[aria-label*="sao"]');
        if (ratingEl) {
          const m = (ratingEl.getAttribute('aria-label') || '').match(/([\d,.]+)/);
          if (m) rating = parseFloat(m[1].replace(',', '.'));
        }

        const revMatch = textContent.match(/\(([\d.,]+)\s*(?:bài đánh giá|đánh giá|reviews)?\)/i);
        if (revMatch) {
          reviewCount = parseInt(revMatch[1].replace(/[.,]/g, ''), 10) || 0;
        }

        return { address, phone, website, categoryText, rating, reviewCount, textContent: textContent.slice(0, 3000) };
      });

      // Kiểm tra lại với danh mục chi tiết của Google Maps
      const detailCheck = validateLeadRelevance({
        name: `${item.name} ${details.categoryText}`,
        text: details.address,
        url: item.google_maps_url,
        leadType: 'B2B',
        sportCategory
      });

      if (!detailCheck.isValid) {
        activeCrawlState.rejectedNoise++;
        addCrawlLog(`🚫 [Đã lọc bỏ sai danh mục] ${item.name} (${details.categoryText || 'Không khớp'})`);
        continue;
      }

      const phones = extractPhonesFromText(`${details.phone} ${item.rawText}`);
      let primaryPhone = normalizePhone(details.phone) || phones[0] || '';
      let facebookUrl = details.website.includes('facebook.com') ? details.website : '';
      let email = '';

      if ((!primaryPhone || !/^(09|03|08|07|05)/.test(primaryPhone)) &&
          details.website && !details.website.includes('facebook.com')) {
        const enriched = await enrichFromWebsite(page, details.website);
        if (enriched.phones.length > 0 && !primaryPhone) primaryPhone = enriched.phones[0];
        if (enriched.emails.length > 0) email = enriched.emails[0];
        if (enriched.facebookUrl && !facebookUrl) facebookUrl = enriched.facebookUrl;
      }

      collected.push({
        name: item.name,
        lead_type: 'B2B',
        lead_intent: 'facility',
        sport_category: detailCheck.detectedSport,
        platform: 'google_maps',
        social_url: item.google_maps_url,
        phone: primaryPhone,
        secondary_phones: phones.slice(1, 3).join(', '),
        email,
        facebook_url: facebookUrl,
        website: details.website,
        google_maps_url: item.google_maps_url,
        address: details.address || province,
        province,
        rating: details.rating,
        review_count: details.reviewCount,
        source: 'google_maps',
        notes: `[Google Maps B2B${details.categoryText ? ' - ' + details.categoryText : ''}] Khu vực: ${details.address || province}`
      });
    } catch (_) {}
  }

  return collected;
}

async function runCrawlCampaign({
  keyword,
  province = 'Hà Nội',
  sportCategory = 'gym',
  targetMode = 'b2c_all',
  platforms = ['all'],
  maxResults = 30
}) {
  if (activeCrawlState.isRunning) {
    throw new Error('Hệ thống đang chạy một chiến dịch quét khác. Vui lòng đợi hoàn tất.');
  }

  const effectiveKeyword = (keyword && keyword.trim())
    ? keyword.trim()
    : (SPORT_KEYWORDS_PRESETS[sportCategory] ? SPORT_KEYWORDS_PRESETS[sportCategory][0] : 'Phòng tập Gym');

  const sourceDesc = `${targetMode}:${Array.isArray(platforms) ? platforms.join(',') : platforms}`;

  const insertCampaign = db.prepare(`
    INSERT INTO crawl_campaigns (keyword, province, sport_category, source, status)
    VALUES (?, ?, ?, ?, 'running')
  `).run(effectiveKeyword, province, sportCategory, sourceDesc);

  const campaignId = Number(insertCampaign.lastInsertRowid);

  Object.assign(activeCrawlState, {
    isRunning: true,
    campaignId,
    keyword: effectiveKeyword,
    province,
    sportCategory,
    source: sourceDesc,
    targetMode,
    platforms,
    totalFound: 0,
    newInserted: 0,
    duplicatesSkipped: 0,
    rejectedNoise: 0,
    logs: []
  });

  addCrawlLog(`🚀 Bắt đầu chiến dịch #${campaignId}: [${sportCategory.toUpperCase()}] - Chế độ [${targetMode}] tại [${province}]`);

  let browser = null;
  try {
    try {
      browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
    } catch (_) {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
    }

    const context = await browser.newContext({
      locale: 'vi-VN',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    let rawLeads = [];

    if (targetMode.startsWith('b2c') || targetMode === 'hybrid') {
      // Nạp mới socialB2CCrawler & phoneParser để luôn áp dụng quy tắc lọc mới nhất mà không cần khởi động lại Server
      delete require.cache[require.resolve('../utils/phoneParser')];
      delete require.cache[require.resolve('./socialB2CCrawler')];
      const { crawlMultiPlatformSocialB2C: freshCrawlB2C } = require('./socialB2CCrawler');

      const socialB2CLeads = await freshCrawlB2C(page, {
        keyword: effectiveKeyword,
        province,
        sportCategory,
        platforms: Array.isArray(platforms) && platforms.length > 0 ? platforms : ['all'],
        b2cMode: targetMode === 'hybrid' ? 'all' : targetMode,
        maxResults,
        onLog: addCrawlLog,
        onReject: () => {
          activeCrawlState.rejectedNoise++;
        }
      });
      rawLeads = rawLeads.concat(socialB2CLeads);
    }

    if (targetMode === 'b2b_maps' || targetMode === 'b2b_all' || targetMode === 'hybrid') {
      const mapsLimit = targetMode === 'b2b_all' ? Math.max(10, Math.ceil(maxResults / 2)) : maxResults;
      const gmapLeads = await crawlGoogleMaps(page, effectiveKeyword, province, sportCategory, mapsLimit);
      rawLeads = rawLeads.concat(gmapLeads);
    }

    if (targetMode === 'b2b_admissions' || targetMode === 'b2b_all') {
      delete require.cache[require.resolve('../utils/phoneParser')];
      delete require.cache[require.resolve('./b2bAdmissionsCrawler')];
      const { crawlB2BAdmissions: freshCrawlB2BAdmissions } = require('./b2bAdmissionsCrawler');

      const admLimit = targetMode === 'b2b_all' ? Math.max(10, Math.ceil(maxResults / 2)) : maxResults;
      const admissionLeads = await freshCrawlB2BAdmissions(page, {
        keyword: effectiveKeyword,
        province,
        sportCategory,
        maxResults: admLimit,
        onLog: addCrawlLog,
        onReject: () => {
          activeCrawlState.rejectedNoise++;
        }
      });
      rawLeads = rawLeads.concat(admissionLeads);
    }

    for (const item of rawLeads) {
      if (!item.phone && !item.social_url && !item.facebook_url && !item.website) continue;

      const res = upsertLead(item);
      if (res.action === 'rejected_irrelevant') {
        activeCrawlState.rejectedNoise++;
        continue;
      }

      activeCrawlState.totalFound++;
      if (res.action === 'inserted') {
        activeCrawlState.newInserted++;
        const contactTag = item.phone
          ? `SĐT/Zalo: ${item.phone}`
          : `${item.platform.toUpperCase()} ${item.social_handle || 'Profile'}`;
        addCrawlLog(`+ [CHÍNH XÁC - ${item.lead_type}] ${item.name} (${contactTag})`);
      } else {
        activeCrawlState.duplicatesSkipped++;
        addCrawlLog(`= [ĐÃ CÓ - Bỏ qua trùng] ${item.name}`);
      }
    }

    addCrawlLog(
      `✅ Hoàn tất chiến dịch #${campaignId}! Đạt chuẩn: ${activeCrawlState.totalFound} | Thêm mới: +${activeCrawlState.newInserted} | Bỏ qua trùng: ${activeCrawlState.duplicatesSkipped} | Đã lọc bỏ rác/sai môn: ${activeCrawlState.rejectedNoise}`
    );

    db.prepare(`
      UPDATE crawl_campaigns
      SET total_found = ?, new_inserted = ?, duplicates_skipped = ?, status = 'completed',
          log_summary = ?, completed_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      activeCrawlState.totalFound,
      activeCrawlState.newInserted,
      activeCrawlState.duplicatesSkipped,
      activeCrawlState.logs.slice(0, 15).join('\n'),
      campaignId
    );
  } catch (err) {
    addCrawlLog(`❌ LỖI CHIẾN DỊCH: ${err.message}`);
    db.prepare(`
      UPDATE crawl_campaigns
      SET status = 'failed', log_summary = ?, completed_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(err.message, campaignId);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    activeCrawlState.isRunning = false;
  }

  return getCrawlState();
}

module.exports = {
  SPORT_KEYWORDS_PRESETS,
  B2C_SPORT_KEYWORDS,
  B2B_ADMISSION_KEYWORDS,
  getCrawlState,
  runCrawlCampaign
};
