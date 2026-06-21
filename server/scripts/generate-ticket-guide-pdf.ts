import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __dirname = dirname(fileURLToPath(import.meta.url))
const htmlPath = join(__dirname, '../../docs/ticket-system-guide.html')
const pdfPath = join(__dirname, '../../docs/ticket-system-guide.pdf')

async function main(): Promise<void> {
  const browser = await puppeteer.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    })
    console.log(`[pdf] wrote ${pdfPath}`)
  } finally {
    await browser.close()
  }
}

void main().catch((err) => {
  console.error('[pdf] failed:', err)
  process.exit(1)
})
