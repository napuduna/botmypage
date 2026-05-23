# AGENT.md

เอกสารนี้ใช้เป็นคู่มือสั้นสำหรับ agent หรือ developer ที่เข้ามาแก้ repo `BotOnMyPage`.

## ภาพรวมระบบ

- โปรเจกต์เป็น Node.js + Express webhook สำหรับรับ Facebook Messenger และส่ง notification ไป LINE Messaging API
- entrypoint หลักคือ `src/app.js`
- route หลักคือ `POST /webhook` และ `GET /webhook`
- logic conversation อยู่ที่ `src/services/flow.service.js`
- session/customer ใช้ Mongoose model ใน `src/models/`
- message outbound แยกอยู่ใน `src/services/messenger.service.js` และ `src/services/line.service.js`

## State Flow

state ปัจจุบัน:

1. `INIT`
2. `SELECT_CATEGORY`
3. `SELECT_SERVICE`
4. `ASK_CUSTOM_SERVICE`
5. `ASK_BUDGET`
6. `ASK_URGENT`
7. `ASK_DETAIL`
8. `COMPLETED`

ข้อควรระวัง:

- payload ที่ไม่รู้จักต้องไม่ข้าม state
- budget ต้องเป็น positive integer string เท่านั้น เช่น `3000`
- หลัง `COMPLETED` ให้รอ admin หรือให้ user พิมพ์ `reset`
- admin takeover ต้องหยุด bot response จนกว่าจะถูก reset/clear
- Facebook event ที่มี `message.mid` เดิมซ้ำต้องถูก skip เพื่อกันข้อความรั่วจาก webhook retry
- ถ้า event มาจาก Page เอง ให้ถือว่าเป็น admin reply และตั้ง `adminTakenOver=true`

## Commands

```bash
npm install
npm test
node scripts/simulate_webhook.js
npm audit --omit=dev
node src/app.js
```

syntax check ทุกไฟล์ JavaScript:

```powershell
Get-ChildItem -Path src,test,scripts -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Environment Variables

ดูตัวอย่างใน `.env.example`.

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `FB_PAGE_ACCESS_TOKEN`
- `FB_VERIFY_TOKEN`
- `FB_APP_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `LINE_OWNER_ID`
- `ALLOW_UNSIGNED_WEBHOOKS`
- `LOG_LEVEL`

`ALLOW_UNSIGNED_WEBHOOKS=true` ใช้ได้เฉพาะ local/dev และต้องไม่ใช้ใน production.

## Security Rules

- ห้าม commit `.env` หรือ credential จริง
- `.env.example` ต้องมีแต่ placeholder
- ถ้า token/secret เคยถูก commit ให้ rotate credential นอก repo ทันที
- production webhook POST ต้องมี Facebook หรือ LINE signature ที่ verify ผ่าน
- ห้าม fallback ไป verify LINE ด้วย empty secret
- ใช้ `crypto.timingSafeEqual` หรือ helper ที่เทียบแบบ constant-time สำหรับ signature
- อย่าเปิด unsigned webhook ใน production

## Testing Notes

- test runner อยู่ที่ `test/run.js`
- ใช้ Node `assert` และ mocks ผ่าน `require.cache` โดยไม่เพิ่ม Jest/Mocha/Supertest
- ก่อนแก้ behavior ใหม่ ให้เพิ่ม regression test ก่อนและรันให้เห็น fail
- `src/app.js` ต้อง import ได้โดยไม่ start server เอง เพื่อให้ tests ใช้ Express app ได้
- `node src/app.js` ยังต้อง start server ตามปกติ

## Dependency Policy

- `package-lock.json` ต้องถูก track เพื่อให้ install reproducible
- หลังอัปเดต dependency ให้รัน `npm test` และ `npm audit --omit=dev`
- สถานะล่าสุดหลังอัปเดต dependencies: `npm audit --omit=dev` รายงาน `found 0 vulnerabilities`
- ต้องเลือก dependency major ที่ยังรองรับ `engines.node >=16`; หลีกเลี่ยงการอัปเดตไป `express@5`, `body-parser@2`, หรือ `mongoose@9` จนกว่าจะยกระดับ Node runtime ของโปรเจกต์

## Implementation Guidelines

- แก้ให้แคบตาม bug หรือ feature ที่ร้องขอ
- อย่าปรับ wording ภาษาไทยใน bot โดยไม่จำเป็น เพราะเป็น user-facing copy
- ถ้าเพิ่ม state ใหม่ ต้องเพิ่ม tests ทั้ง happy path และ invalid input
- ถ้าแก้ webhook/security ต้องเพิ่ม tests สำหรับ reject/allow path อย่างน้อยหนึ่งกรณี
- ถ้าแตะ startup behavior ต้องยืนยันว่า `require('./src/app')` ไม่เปิด port เอง
- ถ้าแตะ Facebook webhook processing ต้องมี tests สำหรับ duplicate `message.mid` และ admin takeover path
