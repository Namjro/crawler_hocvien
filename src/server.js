const express = require('express');
const cors = require('cors');
const path = require('node:path');
const apiRoutes = require('./routes/api');
const { backupDatabase, DB_PATH } = require('./db/database');
const { getLocalNetworkUrls, syncWithCloud } = require('./db/cloudSync');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiRoutes);

backupDatabase();

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    const lanUrls = getLocalNetworkUrls(PORT);
    console.log('==================================================================');
    console.log(`🚀 VTC SPORT LEAD HUNTER & CRM v2.0 (B2B Hub + B2C Evidence Hub)`);
    console.log(`💻 Mở trên máy tính này: http://localhost:${PORT}`);
    if (lanUrls.length > 0) {
      console.log(`📱 Mở trên Điện thoại / Máy tính khác (cùng Wi-Fi): ${lanUrls.join(' hoặc ')}`);
    }
    console.log(`💾 Cơ sở dữ liệu Local: ${DB_PATH}`);
    console.log('==================================================================');

    // Tự động đồng bộ Cloud PostgreSQL nếu đã cấu hình
    syncWithCloud().catch(() => {});
  });
}

module.exports = app;
