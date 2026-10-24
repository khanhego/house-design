import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/* E2E-01 (người mua → lead → portal) và E2E-02 (duyệt & phát hành) — 02b §13, AC-01…AC-12. Chạy trên server thật với CSP. */

const ADMIN = { email: 'admin@local.test', password: 'admin12345' }
const APPROVER = { email: 'duyet@sunrise.local', password: 'admin12345' }

/** Ghi lỗi trang và vi phạm CSP để mỗi test tự khẳng định không có. */
const watch = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text()) && errors.push(m.text()))
  return errors
}

const login = async (page: Page, area: 'studio' | 'portal', u: { email: string; password: string }) => {
  await page.goto(`/${area}/login`)
  await page.fill('input[type=email]', u.email)
  await page.fill('input[type=password]', u.password)
  await page.click('button[type=submit]')
  await page.waitForURL(area === 'portal' ? '**/portal' : '**/studio/projects')
}

test('E2E-01: xem biệt thự nhiều tầng, mặt bằng, PDF, để lại SĐT → người duyệt thấy lead', async ({ page, browser }) => {
  const errors = watch(page)
  await page.goto('/v/sunrise-garden?src=qr')
  await expect(page.locator('.house-card')).not.toHaveCount(0)
  await page.click('.chips button:has-text("Biệt thự")')
  await page.locator('.house-card').first().click()
  await page.waitForURL(/\/v\/sunrise-garden\/[a-z0-9-]+/)
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 })

  await page.locator('.floor-list button', { hasText: 'Tầng 2' }).click()
  await expect(page).toHaveURL(/floor=/)
  await page.locator('.room-chips button').first().click()
  await expect(page).toHaveURL(/room=/)
  const item = page.locator('.room-items li button').first()
  if (await item.count()) {
    await item.click()
    await expect(page.locator('.item-panel:visible').first()).toBeVisible()
  }

  await page.click('[role=tab]:has-text("Mặt bằng")')
  await expect(page.locator('svg text', { hasText: 'm²' }).first()).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.click('button:has-text("Tải PDF mặt bằng")')])
  expect(download.suggestedFilename()).toMatch(/^sunrise-garden-.+-mat-bang\.pdf$/)

  await page.click('[role=tab]:has-text("3D")')
  await page.click('button:has-text("Liên hệ tư vấn")')
  await page.click('button:has-text("Để lại SĐT")')
  await page.fill('.lead-form input[autocomplete=name]', 'Khách E2E')
  await page.fill('.lead-form input[inputmode=tel]', '0988 777 666')
  await page.check('.lead-form .consent input')
  await page.waitForTimeout(3000) // token form hợp lệ sau 3 giây
  await page.click('.lead-form button.primary')
  await expect(page.locator('.lead-done')).toContainText('Cảm ơn Khách E2E!')
  await page.click('button:has-text("Tiếp tục xem nhà")')
  expect(errors).toEqual([])

  const portal = await (await browser.newContext()).newPage()
  await login(portal, 'portal', APPROVER)
  await portal.goto('/portal/leads')
  const row = portal.locator('.tbl.leads tr', { hasText: '0988777666' })
  await expect(row).toContainText('Khách E2E')
  await expect(row).toContainText('QR')
})

test('E2E-02: studio gửi duyệt → portal duyệt → studio phát hành → trang công khai hiện phiên bản mới', async ({ page, browser }) => {
  const errors = watch(page)
  await login(page, 'studio', ADMIN)
  // tạo phiên bản 2 cho mẫu nhà đầu tiên (đổi tên tầng để thấy khác biệt)
  const projects = (await (await page.request.get('/api/v1/projects')).json()).items
  const house = projects.find((p: { slug: string }) => p.slug === 'sunrise-garden').houses[0]
  const nv = await page.request.post(`/api/v1/houses/${house.id}/versions`, { headers: { 'X-Requested-With': 'fetch' } })
  expect(nv.status()).toBe(201)
  const vid = (await nv.json()).version.id
  const v = await (await page.request.get(`/api/v1/versions/${vid}`)).json()
  v.document.floors[0].name = 'Tầng trệt E2E'
  const saved = await page.request.put(`/api/v1/versions/${vid}/document`, { headers: { 'X-Requested-With': 'fetch', 'If-Match': String(v.revision) }, data: { document: v.document } })
  expect(saved.status()).toBe(200)

  await page.goto(`/studio/houses/${house.id}/versions`)
  await page.click('button:has-text("Gửi khách duyệt")')
  await expect(page.locator('.ver').first()).toContainText('Chờ khách duyệt')

  const portal = await (await browser.newContext()).newPage()
  const pErrors = watch(portal)
  await login(portal, 'portal', APPROVER)
  await portal.click(`a[href="/portal/review/${vid}"]`)
  await expect(portal.locator('.preview-banner')).toContainText(`Phiên bản ${v.number}`)
  await portal.click('button:has-text("Duyệt phiên bản này")')
  await portal.click('button:has-text("Xác nhận duyệt")')
  await expect(portal.locator('.review-bar')).toContainText('đã được duyệt')
  expect(pErrors).toEqual([])

  await page.reload()
  await page.click('.ver-head button:has-text("Phát hành")')
  await page.click('.am-foot button:has-text("Phát hành")')
  await expect(page.locator('.ver').first()).toContainText('Đã phát hành')

  const pub = await (await page.request.get(`/api/v1/public/projects/sunrise-garden/houses/${house.slug}`)).json()
  expect(pub.version.number).toBe(v.number)
  expect(pub.document.floors.some((f: { name: string }) => f.name === 'Tầng trệt E2E')).toBe(true)
  expect(errors).toEqual([])
})

test('E2E-03: tour ảnh thật — tải ảnh, điểm đi tiếp, duyệt, phát hành, Tiếp/Lùi, lead theo cảnh (item 02)', async ({ page, browser }) => {
  const errors = watch(page)
  await login(page, 'studio', ADMIN)
  const projects = (await (await page.request.get('/api/v1/projects')).json()).items
  const proj = projects.find((p: { slug: string }) => p.slug === 'sunrise-garden')
  const slug = `tour-e2e-${Date.now().toString(36).slice(-4)}`
  const h = await (await page.request.post(`/api/v1/projects/${proj.id}/houses`, { headers: { 'X-Requested-With': 'fetch' }, data: { name: 'Nhà thật E2E', slug, houseType: 'townhouse', declaredArea: 60 } })).json()
  await page.goto(`/studio/houses/${h.house.id}/edit`)
  await page.click('button:has-text("Ảnh thật")')
  // 3 ảnh tạo trong trình duyệt, chọn ngược thứ tự
  const shots = await page.evaluate(async () => {
    const mk = async (color: string) => {
      const c = document.createElement('canvas')
      c.width = 1800
      c.height = 1200
      const g = c.getContext('2d')!
      g.fillStyle = color
      g.fillRect(0, 0, 1800, 1200)
      return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.8))).arrayBuffer()))
    }
    return [await mk('#a86'), await mk('#6a8'), await mk('#68a')]
  })
  await page.setInputFiles('.tour-drop input[type=file]', [
    { name: '03-bep.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(shots[2]) },
    { name: '02-phong-khach.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(shots[1]) },
    { name: '01-mat-tien.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(shots[0]) },
  ])
  await expect(page.locator('.tour-thumb')).toHaveCount(3, { timeout: 30_000 })
  expect(await page.locator('.tour-thumb').evaluateAll((els) => els.map((e) => e.getAttribute('title')))).toEqual(['Mặt tiền', 'Phòng khách', 'Bếp'])
  for (const i of [0, 1]) {
    await page.locator('.tour-thumb').nth(i).click()
    const box = (await page.locator('.tour-pick-img').boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  }
  await page.click('button:has-text("Dùng ảnh cảnh 1 làm ảnh đại diện")')
  await expect(page.locator('.ed-checks')).toContainText(/Đủ điều kiện|Không còn lỗi chặn/, { timeout: 10_000 })

  await page.goto(`/studio/houses/${h.house.id}/versions`)
  await page.click('button:has-text("Gửi khách duyệt")')
  await expect(page.locator('.ver').first()).toContainText('Chờ khách duyệt')
  const portal = await (await browser.newContext()).newPage()
  await login(portal, 'portal', APPROVER)
  await portal.click(`a[href="/portal/review/${h.version.id}"]`)
  await expect(portal.locator('.tour-img').first()).toBeVisible()
  await portal.click('button:has-text("Duyệt phiên bản này")')
  await portal.click('button:has-text("Xác nhận duyệt")')
  await page.reload()
  await page.click('.ver-head button:has-text("Phát hành")')
  await page.click('.am-foot button:has-text("Phát hành")')
  await expect(page.locator('.ver').first()).toContainText('Đã phát hành')

  const viewer = await (await browser.newContext()).newPage()
  const vErrors = watch(viewer)
  await viewer.goto(`/v/sunrise-garden/${slug}`)
  await expect(viewer.locator('.tour-step')).toHaveText('Cảnh 1 / 3')
  await viewer.click('.tour-nav.next')
  await expect(viewer.locator('.tour-step')).toHaveText('Cảnh 2 / 3')
  await viewer.keyboard.press('ArrowRight')
  await expect(viewer.locator('.tour-step')).toHaveText('Cảnh 3 / 3')
  await viewer.keyboard.press('ArrowLeft')
  await expect(viewer.locator('.tour-step')).toHaveText('Cảnh 2 / 3')
  await viewer.click('button:has-text("Liên hệ tư vấn")')
  await viewer.click('button:has-text("Để lại SĐT")')
  await viewer.fill('.lead-form input[inputmode=tel]', '0944 555 666')
  await viewer.check('.lead-form .consent input')
  await viewer.waitForTimeout(3000)
  await viewer.click('.lead-form button.primary')
  await expect(viewer.locator('.lead-done')).toBeVisible()
  await portal.goto('/portal/leads')
  await expect(portal.locator('.tbl.leads tr', { hasText: '0944555666' })).toContainText('Ảnh thật · Phòng khách')
  expect([...errors, ...vErrors]).toEqual([])
})
