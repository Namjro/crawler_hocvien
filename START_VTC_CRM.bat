@echo off
chcp 65001 >nul
title VTC Sport Lead Hunter & CRM - Tuyen Sinh Chung Chi Cuc TDTT
echo ==================================================================
echo Đang khởi động hệ thống VTC Sport Lead Hunter & CRM...
echo Trình duyệt sẽ tự động mở tại địa chỉ: http://localhost:3000
echo (Không tắt cửa sổ này trong quá trình sử dụng phần mềm)
echo ==================================================================
start "" "http://localhost:3000"
npm start
pause
