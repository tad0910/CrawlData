import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import path from 'path';

chromium.use(stealth());

(async () => {
    const url = process.argv[2];
    if (!url) {
        console.log('❌ Vui lòng nhập URL cần đăng nhập. Ví dụ: node login.js https://example.com/login');
        process.exit(1);
    }
    
    console.log(`\n🌐 Đang mở trình duyệt để bạn đăng nhập vào: ${url}`);
    const context = await chromium.launchPersistentContext(path.resolve('./browser_data'), {
        headless: false,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    await page.goto(url);
    
    console.log(`\n👉 HƯỚNG DẪN:`);
    console.log(`1. Hãy thực hiện đăng nhập trên trình duyệt vừa hiện ra.`);
    console.log(`2. Trình duyệt sẽ được giữ lại để ghi nhớ Cookies và Session.`);
    console.log(`3. Sau khi bạn đăng nhập thành công, hãy tắt hoàn toàn cửa sổ trình duyệt đó đi.`);
    
    context.on('close', () => {
        console.log(`\n✅ Đã lưu phiên đăng nhập thành công! Cookies được lưu ở ./browser_data/`);
        console.log(`Giờ đây các tiến trình Scraper và Sniffer sẽ tự động dùng phiên đăng nhập này khi chạy ngầm.`);
        process.exit(0);
    });
})();
