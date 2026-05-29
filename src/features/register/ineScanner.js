let zxingReader = null

export function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

export function birthDateFromCurp(curp = '') {
  const match = curp.match(/^[A-Z][AEIOUX][A-Z]{2}(\d{2})(\d{2})(\d{2})/)
  if (!match) return ''

  const currentYear = new Date().getFullYear() % 100
  const shortYear = Number(match[1])
  const century = shortYear > currentYear ? '19' : '20'
  return `${century}${match[1]}-${match[2]}-${match[3]}`
}

export function parseIneData(rawText = '') {
  const text = normalizeText(rawText).toUpperCase()
  const curp = extractCurp(rawText)
  const clave =
    text.match(/CLAVE(?: DE)? ELECTOR[:\s-]*([A-Z0-9]{12,20})/)?.[1] ||
    text.match(/\b[A-Z]{6}\d{8}[A-Z0-9]{3,4}\b/)?.[0] ||
    ''
  const cic = text.match(/(?:CIC|IDCIC)[:\s-]*(\d{8,12})/)?.[1] || ''
  const ocr = text.match(/(?:OCR|IDENTIFICADOR)[:\s-]*(\d{10,14})/)?.[1] || ''
  const expirationDate = extractExpirationDate(text)
  const mrzName = rawText.match(/([A-ZÑ]+(?:<[A-ZÑ]+)+)<<([A-ZÑ]+(?:<[A-ZÑ]+)*)/i)
  const name = mrzName
    ? normalizeText(`${mrzName[2].replaceAll('<', ' ')} ${mrzName[1].replaceAll('<', ' ')}`)
    : extractVisibleName(rawText)

  return {
    curp,
    clave,
    cic,
    ocr,
    name,
    birthDate: birthDateFromCurp(curp) || birthDateFromDocumentNumber(clave),
    expirationDate,
    raw: rawText,
  }
}

function hasUsefulParsedData(data = {}) {
  return Boolean(
    data.curp ||
      data.clave ||
      data.cic ||
      data.ocr ||
      data.name ||
      data.birthDate ||
      data.expirationDate,
  )
}

function mergeParsedIneData(primary = {}, secondary = {}) {
  return {
    curp: primary.curp || secondary.curp || '',
    clave: primary.clave || secondary.clave || '',
    cic: primary.cic || secondary.cic || '',
    ocr: primary.ocr || secondary.ocr || '',
    name: primary.name || secondary.name || '',
    birthDate: primary.birthDate || secondary.birthDate || '',
    expirationDate: primary.expirationDate || secondary.expirationDate || '',
    raw: [primary.raw, secondary.raw].filter(Boolean).join('\n\n'),
  }
}

function extractCurp(rawText = '') {
  const normalizedText = normalizeText(rawText).toUpperCase()
  const directMatch = normalizedText.match(/[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/)
  if (directMatch) return directMatch[0]

  const compactText = normalizedText.replace(/[^A-Z0-9]/g, '')
  const curpKeywordIndex = compactText.indexOf('CURP')

  if (curpKeywordIndex >= 0) {
    const nearCurpMatch = findCurpInCompactText(compactText.slice(curpKeywordIndex, curpKeywordIndex + 80))
    if (nearCurpMatch) return nearCurpMatch
  }

  const compactMatch = findCurpInCompactText(compactText)
  if (compactMatch) return compactMatch

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line).toUpperCase())
    .filter(Boolean)
  const curpIndex = lines.findIndex((line) => /CURP|C U R P|C\.?U\.?R\.?P/.test(line))

  if (curpIndex < 0) return ''

  const compactLine = lines
    .slice(curpIndex, curpIndex + 3)
    .join(' ')
    .replace(/CURP|C U R P|C\.?U\.?R\.?P/gi, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()

  return normalizeCurpCandidate(compactLine)
}

function findCurpInCompactText(text = '') {
  for (let index = 0; index <= text.length - 18; index += 1) {
    const candidate = normalizeCurpCandidate(text.slice(index, index + 18))
    if (candidate) return candidate
  }

  return ''
}

function normalizeCurpCandidate(value = '') {
  const candidate = value.slice(0, 18)
  if (candidate.length < 18) return ''

  const chars = candidate.split('')
  const letterPositions = new Set([0, 1, 2, 3, 10, 11, 12, 13, 14, 15])
  const digitPositions = new Set([4, 5, 6, 7, 8, 9, 17])

  const normalized = chars
    .map((char, index) => {
      if (letterPositions.has(index)) return digitToLetter(char)
      if (digitPositions.has(index)) return letterToDigit(char)
      if (index === 16) return char === 'O' ? '0' : char
      return char
    })
    .join('')

  return /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(normalized)
    ? normalized
    : ''
}

function digitToLetter(char) {
  const replacements = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B' }
  return replacements[char] || char
}

function letterToDigit(char) {
  const replacements = { O: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' }
  return replacements[char] || char
}

function birthDateFromDocumentNumber(documentNumber = '') {
  const match = String(documentNumber || '').match(/[A-Z]{6}(\d{2})(\d{2})(\d{2})/)
  if (!match) return ''

  const currentYear = new Date().getFullYear() % 100
  const shortYear = Number(match[1])
  const century = shortYear > currentYear ? '19' : '20'
  return `${century}${match[1]}-${match[2]}-${match[3]}`
}

function extractExpirationDate(text = '') {
  const explicitDate =
    text.match(/VIGENCIA[:\s-]*(\d{4})[-/](\d{2})[-/](\d{2})/) ||
    text.match(/VIGENCIA[:\s-]*(\d{2})[-/](\d{2})[-/](\d{4})/)

  if (explicitDate) {
    return explicitDate[1].length === 4
      ? `${explicitDate[1]}-${explicitDate[2]}-${explicitDate[3]}`
      : `${explicitDate[3]}-${explicitDate[2]}-${explicitDate[1]}`
  }

  const yearRange = text.match(/VIGENCIA[:\s-]*(20\d{2})\s*[-/A ]+\s*(20\d{2})/)
  if (yearRange) return `${yearRange[2]}-12-31`

  const singleYear = text.match(/VIGENCIA[:\s-]*(20\d{2})/)
  if (singleYear) return `${singleYear[1]}-12-31`

  const looseYearRange = text.match(/\b(20\d{2})\s*[-/]\s*(20\d{2})\b/)
  if (looseYearRange) return `${looseYearRange[2]}-12-31`

  return ''
}

function extractVisibleName(rawText = '') {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line).toUpperCase())
    .filter(Boolean)
  const nameIndex = lines.findIndex((line) => /^NOMBRE\b/.test(line))
  if (nameIndex < 0) return ''

  return lines
    .slice(nameIndex + 1, nameIndex + 4)
    .filter((line) => !/DOMICILIO|CLAVE|CURP|FECHA|SEXO|VIGENCIA|INSTITUTO/.test(line))
    .join(' ')
}

export async function scanIneFiles(files = []) {
  const imageFiles = files.filter((file) => file?.type?.startsWith('image/'))
  const barcodeText = await scanBarcodes(imageFiles)

  if (barcodeText) {
    const barcodeData = parseIneData(barcodeText)

    if (hasUsefulParsedData(barcodeData)) {
      return { method: 'codigo', rawText: barcodeText, data: barcodeData }
    }

    const ocrTextFromBarcodeFallback = await scanTextWithOcr(imageFiles)
    const ocrDataFromBarcodeFallback = parseIneData(ocrTextFromBarcodeFallback)

    return {
      method: 'codigo+ocr',
      rawText: [barcodeText, ocrTextFromBarcodeFallback].filter(Boolean).join('\n\n'),
      data: mergeParsedIneData(ocrDataFromBarcodeFallback, barcodeData),
    }
  }

  const ocrText = await scanTextWithOcr(imageFiles)
  const ocrData = parseIneData(ocrText)
  return { method: 'ocr', rawText: ocrText, data: ocrData }
}

async function scanBarcodes(files) {
  const rawValues = []

  for (const file of files) {
    const rawValue = await detectBarcode(file)
    if (rawValue) rawValues.push(rawValue)
  }

  return rawValues.join('\n')
}

async function detectBarcode(file) {
  const nativeResult = await detectWithNativeBarcodeDetector(file)
  if (nativeResult) return nativeResult
  return detectWithZxing(file)
}

async function detectWithNativeBarcodeDetector(file) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return ''

  try {
    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'pdf417', 'aztec', 'data_matrix'],
    })
    const image = await readImage(file)
    const results = await detector.detect(image)
    return results.find((item) => item.rawValue)?.rawValue || ''
  } catch {
    return ''
  }
}

async function detectWithZxing(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const reader = await getZxingReader()
    const result = await reader.decodeFromImageUrl(imageUrl)
    return result?.getText?.() || result?.text || ''
  } catch {
    return ''
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

async function getZxingReader() {
  if (zxingReader) return zxingReader

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.PDF_417,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  zxingReader = new BrowserMultiFormatReader(hints)
  return zxingReader
}

async function scanTextWithOcr(files) {
  if (!files.length) return ''

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa+eng')
  const chunks = []

  try {
    for (const file of files) {
      const images = await buildOcrImages(file)

      for (const image of images) {
        const result = await worker.recognize(image)
        chunks.push(result?.data?.text || '')
      }
    }

    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      preserve_interword_spaces: '1',
    })

    for (const file of files) {
      const curpImages = await buildCurpFocusedImages(file)

      for (const image of curpImages) {
        const result = await worker.recognize(image)
        chunks.push(result?.data?.text || '')
      }
    }
  } finally {
    await worker.terminate()
  }

  return chunks.join('\n')
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })
}

async function preprocessImage(file) {
  const image = await readImage(file)
  return enhanceImage(image)
}

async function buildOcrImages(file) {
  const image = await readImage(file)

  return [
    enhanceImage(image, null, { scaleWidth: 1600, mode: 'contrast' }),
    enhanceImage(image, null, { scaleWidth: 2200, mode: 'threshold' }),
    enhanceImage(image, { top: 0.12, left: 0, width: 1, height: 0.52 }, { scaleWidth: 2200, mode: 'contrast' }),
    enhanceImage(image, { top: 0.28, left: 0, width: 1, height: 0.44 }, { scaleWidth: 2200, mode: 'threshold' }),
    enhanceImage(image, { top: 0.40, left: 0, width: 1, height: 0.36 }, { scaleWidth: 2200, mode: 'contrast' }),
  ]
}

async function buildCurpFocusedImages(file) {
  const image = await readImage(file)

  return [
    enhanceImage(image, { top: 0.16, left: 0.22, width: 0.78, height: 0.26 }, { scaleWidth: 2600, mode: 'threshold' }),
    enhanceImage(image, { top: 0.24, left: 0.18, width: 0.82, height: 0.24 }, { scaleWidth: 2600, mode: 'contrast' }),
    enhanceImage(image, { top: 0.32, left: 0.16, width: 0.84, height: 0.24 }, { scaleWidth: 2600, mode: 'threshold' }),
    enhanceImage(image, { top: 0.42, left: 0.12, width: 0.88, height: 0.24 }, { scaleWidth: 2600, mode: 'contrast' }),
  ]
}

function enhanceImage(image, crop = null, options = {}) {
  const sourceX = crop ? Math.round(image.width * crop.left) : 0
  const sourceY = crop ? Math.round(image.height * crop.top) : 0
  const sourceWidth = crop ? Math.round(image.width * crop.width) : image.width
  const sourceHeight = crop ? Math.round(image.height * crop.height) : image.height
  const targetWidth = options.scaleWidth || 1400
  const scale = Math.min(Math.max(targetWidth / sourceWidth, 1), 4)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sourceWidth * scale)
  canvas.height = Math.round(sourceHeight * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128))
    const output = options.mode === 'threshold' ? (contrasted > 145 ? 255 : 0) : contrasted
    data[index] = output
    data[index + 1] = output
    data[index + 2] = output
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}
