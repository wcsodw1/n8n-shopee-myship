# n8n Shopee & 賣貨便 自動化處理專案

本專案用於透過 n8n 自動抓取並解析 Shopee 與賣貨便的電子郵件資訊，並將資料持久化儲存於 Docker Volume 中。

## 📂 專案結構
- `docker-compose.yml`: 定義 n8n 容器與掛載設定。
- `.venv/`: Python 虛擬環境，用於執行輔助數據分析腳本。
- `README.md`: 操作與復原手冊。

---

## 🚀 快速啟動與管理

### 1. 啟動 n8n 服務
如果你是第一次在此目錄執行，或是不小心刪除了容器，請執行：
```bash
docker-compose up -d