const express = require('express');
const cors = require('cors');
const path = require('node:path');
const apiRoutes = require('./routes/api');
const { backupDatabase, DB_PATH } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', apiRoutes);

// Tự động sao lưu Database mỗi khi khởi động server để bảo vệ dữ liệu lâu dài
backupDatabase();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('==================================================================');
    console.log(`🚀 VTC SPORT LEAD HUNTER & CRM đang chạy tại: http://localhost:${PORT}`);
    console.log(`💾 Cơ sở dữ liệu lưu trữ lâu dài tại: ${DB_PATH}`);
    console.log(`🎯 Mục tiêu vận hành: Chốt 100 Học viên / Tháng (B2B Cơ sở + B2C HLV)`);
    console.log('==================================================================');
  });
}

module.exports = app;
