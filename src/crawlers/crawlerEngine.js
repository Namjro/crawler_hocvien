const { chromium } = require('playwright');
const cheerio = require('cheerio');
const {
  normalizePhone,
  extractPhonesFromText,
  extractEmailsFromText,
  detectSportCategory
} = require('../utils/phoneParser');
const { db, upsertLead } = require('../db/database');
const { B2C_SPORT_KEYWORDS, crawlMultiPlatformSocialB2C } = require('./socialB2CCrawler');

/**
 * Bộ từ khóa mở rộng thông minh cho cả Cá nhân (B2C) và Cơ sở (B2B) theo 4 mảng của VTC
 */
const SPORT_KEYWORDS_PRESETS = {
  gym: [
    'PT tự do nhận dạy kèm 1:1',
    'Personal Trainer Gym Fitness',
    'Tìm việc PT Gym Huấn luyện viên thể hình',
    'Học chứng chỉ PT ở đâu',
    'Phòng tập Gym Fitness'
  ],
  yoga: [
    'Cô giáo Yoga dạy kèm',
    'HLV Yoga trị liệu cá nhân',
    'Tìm việc giáo viên Yoga',
    'Thi chứng chỉ HLV Yoga Cục TDTT',
    'Studio Yoga Pilates'
  ],
  dance: [
    'Giáo viên dạy nhảy Zumba Shuffle Dance',
    'HLV Dân vũ thể thao',
    'Nhận dạy lớp Zumba Shuffle Dance',
    'Chứng chỉ HLV Dân vũ thể thao',
    'Câu lạc bộ Dân vũ Zumba'
  ],
  martial_arts: [
    'HLV Võ cổ truyền Kickfit',
    'Thầy dạy võ tự vệ cá nhân',
    'Chứng chỉ HLV Võ cổ truyền Cục TDTT',
    'Câu lạc bộ Võ cổ truyền Võ đường'
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

/**
 * Quét sâu vào Website để lấy thêm SĐT di động, Zalo, Email và Link Facebook
 */
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
 * Quét dữ liệu Cơ sở Thể thao (B2B) từ Google Maps bằng Playwright
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

  addCrawlLog(`📍 Tìm thấy ${places.length} địa điểm trên bản đồ. Đang bóc tách SĐT & liên hệ...`);

  const collected = [];
  const limit = Math.min(places.length, maxResults);

  for (let i = 0; i < limit; i++) {
    const item = places[i];
    try {
      await page.goto(item.google_maps_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);

      const details = await page.evaluate(() => {
        const textContent = document.body ? document.body.innerText : '';
        let address = '';
        let phone = '';
        let website = '';
        let rating = 0;
        let reviewCount = 0;

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

        return { address, phone, website, rating, reviewCount, textContent: textContent.slice(0, 4000) };
      });

      const phones = extractPhonesFromText(`${details.phone} ${item.rawText} ${details.textContent}`);
      let primaryPhone = phones[0] || normalizePhone(details.phone) || '';
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
        sport_category: detectSportCategory(`${item.name} ${query}`, sportCategory),
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
        notes: `[Google Maps B2B] Quét với từ khóa "${query} - ${province}"`
      });
    } catch (_) {}
  }

  return collected;
}

/**
 * Hàm điều phối Chiến dịch Quét Dữ liệu (Hỗ trợ cả Khách hàng Cá nhân B2C trên 6 MXH & Cơ sở B2B)
 */
async function runCrawlCampaign({
  keyword,
  province = 'Hà Nội',
  sportCategory = 'gym',
  targetMode = 'b2c_all', // 'b2c_all' (Tất cả Cá nhân MXH), 'b2c_creators' (HLV/PT tự do TikTok/IG/FB), 'b2c_job_seekers' (Tìm việc PT), 'b2c_cert_hunters' (Cần học bằng), 'b2b_maps' (Chỉ CLB/Phòng tập), 'hybrid' (Kết hợp cả B2C + B2B)
  platforms = ['all'], // ['facebook', 'tiktok', 'instagram', 'telegram', 'x', 'youtube']
  maxResults = 30
}) {
  if (activeCrawlState.isRunning) {
    throw new Error('Hệ thống đang chạy một chiến dịch quét khác. Vui lòng đợi hoàn tất.');
  }

  const effectiveKeyword = (keyword && keyword.trim())
    ? keyword.trim()
    : (SPORT_KEYWORDS_PRESETS[sportCategory] ? SPORT_KEYWORDS_PRESETS[sportCategory][0] : 'HLV thể thao');

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

    // 1. Quét Khách hàng Cá nhân (B2C) trên Facebook, TikTok, Instagram, Telegram, X, YouTube
    if (targetMode.startsWith('b2c') || targetMode === 'hybrid') {
      const socialB2CLeads = await crawlMultiPlatformSocialB2C(page, {
        keyword: effectiveKeyword,
        province,
        sportCategory,
        platforms: Array.isArray(platforms) && platforms.length > 0 ? platforms : ['all'],
        b2cMode: targetMode === 'hybrid' ? 'all' : targetMode,
        maxResults,
        onLog: addCrawlLog
      });
      rawLeads = rawLeads.concat(socialB2CLeads);
    }

    // 2. Quét Cơ sở / Câu lạc bộ (B2B) trên Google Maps nếu chọn b2b_maps hoặc hybrid
    if (targetMode === 'b2b_maps' || targetMode === 'hybrid') {
      const gmapLeads = await crawlGoogleMaps(page, effectiveKeyword, province, sportCategory, Math.ceil(maxResults / 2));
      rawLeads = rawLeads.concat(gmapLeads);
    }

    // Lưu vào SQLite và chống trùng lặp theo cả SĐT lẫn Link Profile MXH (@handle)
    for (const item of rawLeads) {
      if (!item.phone && !item.social_url && !item.facebook_url && !item.website) continue;

      activeCrawlState.totalFound++;
      const res = upsertLead(item);
      if (res.action === 'inserted') {
        activeCrawlState.newInserted++;
        const contactTag = item.phone
          ? `SĐT/Zalo: ${item.phone}`
          : `${item.platform.toUpperCase()} ${item.social_handle || 'Profile'}`;
        addCrawlLog(`+ [MỚI - ${item.lead_type}] ${item.name} (${contactTag})`);
      } else {
        activeCrawlState.duplicatesSkipped++;
        addCrawlLog(`= [ĐÃ CÓ TRONG CRM - Bỏ qua trùng] ${item.name}`);
      }
    }

    addCrawlLog(
      `✅ Hoàn tất chiến dịch #${campaignId}! Tìm thấy: ${activeCrawlState.totalFound} | Thêm mới: ${activeCrawlState.newInserted} | Đã có (bỏ qua trùng): ${activeCrawlState.duplicatesSkipped}`
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
  getCrawlState,
  runCrawlCampaign
};
