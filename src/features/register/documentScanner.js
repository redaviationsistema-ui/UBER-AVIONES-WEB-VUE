import { requestWithCandidates } from '../../lib/backendCrud'
import {
  DOCUMENT_FIELD_MAP,
  getDocumentStage,
  normalizeDocumentType,
} from './documentScannerConfig'

const MAX_IMAGE_WIDTH = 1500
const JPEG_QUALITY = 0.9
const SCAN_TIMEOUT_MS = 90000
const LOCAL_CACHE = new Map()
const ESSENTIAL_FIELD_KEYS = ['document_type', 'document_number', 'name', 'birth_date']
const OPTIONAL_FIELD_KEYS = ['curp', 'cic', 'ocr', 'expiration_date', 'document_status']
const DEFAULT_FIELD = Object.freeze({
  value: null,
  confidence: 0,
  source: null,
  requiresReview: false,
  alternatives: [],
})
const FIELD_SOURCE_PRIORITY = {
  document_classifier: 99,
  front_ocr: 92,
  mrz: 89,
  barcode: 86,
  qr: 86,
  back_ocr: 81,
  ocr: 76,
  manual: 100,
}
const DOCUMENT_TYPE_KEYWORDS = {
  ine: ['INSTITUTO NACIONAL ELECTORAL', 'CREDENCIAL PARA VOTAR', 'CLAVE DE ELECTOR', 'CURP'],
  passport: ['PASSPORT', 'PASAPORTE', 'MEX', 'P<'],
  driver_license: ['LICENCIA', 'DRIVER LICENSE', 'PERMISO'],
  visa: ['VISA', 'CATEGORY', 'ENTRY'],
}

let zxingReader = null

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeAlphanumeric(value = '') {
  return normalizeText(value).replace(/[^A-Z0-9<]/gi, '').toUpperCase()
}

function hashFileSignature(file) {
  return [
    file?.name || 'file',
    file?.size || 0,
    file?.lastModified || 0,
    file?.type || '',
  ].join(':')
}

function createStageReporter(callback) {
  const startedAt = nowMs()
  const entries = []

  return {
    push(stageKey, extra = {}) {
      const stage = getDocumentStage(stageKey)
      const entry = {
        key: stage.key,
        label: stage.label,
        progress: stage.progress,
        elapsedMs: Math.round(nowMs() - startedAt),
        ...extra,
      }
      entries.push(entry)
      callback?.(entry)
    },
    entries,
    startedAt,
  }
}

async function readImage(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = reject
      element.src = imageUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawImageToCanvas(image) {
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

function estimateDocumentBounds(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let documentPixels = 0

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const index = (y * width + x) * 4
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
      const distanceFromWhite = 255 - luminance

      if (distanceFromWhite > 24) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        documentPixels += 1
      }
    }
  }

  if (!documentPixels || minX >= maxX || minY >= maxY) {
    return {
      detected: false,
      left: 0,
      top: 0,
      width,
      height,
      coverage: 0,
      corners: [],
    }
  }

  const paddingX = Math.round((maxX - minX) * 0.03)
  const paddingY = Math.round((maxY - minY) * 0.03)
  const boundedLeft = clamp(minX - paddingX, 0, width)
  const boundedTop = clamp(minY - paddingY, 0, height)
  const boundedRight = clamp(maxX + paddingX, 0, width)
  const boundedBottom = clamp(maxY + paddingY, 0, height)
  const boundedWidth = Math.max(1, boundedRight - boundedLeft)
  const boundedHeight = Math.max(1, boundedBottom - boundedTop)

  return {
    detected: true,
    left: boundedLeft,
    top: boundedTop,
    width: boundedWidth,
    height: boundedHeight,
    coverage: Number(((boundedWidth * boundedHeight) / Math.max(1, width * height)).toFixed(4)),
    corners: [
      { x: boundedLeft, y: boundedTop },
      { x: boundedRight, y: boundedTop },
      { x: boundedRight, y: boundedBottom },
      { x: boundedLeft, y: boundedBottom },
    ],
  }
}

function cropCanvas(sourceCanvas, bounds) {
  const canvas = createCanvas(bounds.width, bounds.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(
    sourceCanvas,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  )
  return { canvas, context }
}

function resizeCanvas(sourceCanvas, maxWidth = MAX_IMAGE_WIDTH) {
  if (sourceCanvas.width <= maxWidth) {
    return sourceCanvas
  }

  const scale = maxWidth / sourceCanvas.width
  const targetWidth = Math.round(sourceCanvas.width * scale)
  const targetHeight = Math.round(sourceCanvas.height * scale)
  const resizedCanvas = createCanvas(targetWidth, targetHeight)
  const context = resizedCanvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight)
  return resizedCanvas
}

function buildGrayCanvas(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(sourceCanvas, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    data[index] = gray
    data[index + 1] = gray
    data[index + 2] = gray
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function applyAdaptiveContrast(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(sourceCanvas, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  let sum = 0
  let count = 0
  for (let index = 0; index < data.length; index += 4) {
    sum += data[index]
    count += 1
  }

  const average = sum / Math.max(1, count)
  const contrastBoost = average < 115 ? 1.16 : average > 180 ? 1.05 : 1.1

  for (let index = 0; index < data.length; index += 4) {
    const value = clamp((data[index] - average) * contrastBoost + average + 4, 0, 255)
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function applySoftNoiseReduction(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.filter = 'blur(0.35px)'
  context.drawImage(sourceCanvas, 0, 0)
  context.filter = 'none'
  return canvas
}

function buildBinarizedCanvas(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(sourceCanvas, 0, 0)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  let total = 0
  let count = 0
  for (let index = 0; index < data.length; index += 4) {
    total += data[index]
    count += 1
  }
  const threshold = total / Math.max(1, count)

  for (let index = 0; index < data.length; index += 4) {
    const value = data[index] >= threshold ? 255 : 0
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function buildMrzCanvas(sourceCanvas) {
  const height = Math.max(64, Math.round(sourceCanvas.height * 0.22))
  const top = Math.max(0, sourceCanvas.height - height)
  const region = cropCanvas(sourceCanvas, {
    left: 0,
    top,
    width: sourceCanvas.width,
    height,
  }).canvas

  return buildBinarizedCanvas(applyAdaptiveContrast(applySoftNoiseReduction(buildGrayCanvas(region))))
}

function computeBlurScore(context, width, height) {
  const { data } = context.getImageData(0, 0, width, height)
  let totalDifference = 0
  let samples = 0

  for (let y = 0; y < height - 1; y += 3) {
    for (let x = 0; x < width - 1; x += 3) {
      const currentIndex = (y * width + x) * 4
      const rightIndex = (y * width + x + 1) * 4
      const bottomIndex = ((y + 1) * width + x) * 4
      const current = data[currentIndex]
      const right = data[rightIndex]
      const bottom = data[bottomIndex]

      totalDifference += Math.abs(current - right) + Math.abs(current - bottom)
      samples += 2
    }
  }

  return samples ? Number((totalDifference / samples).toFixed(2)) : 0
}

function analyzeQuality(canvas, bounds) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let brightnessSum = 0
  let glarePixels = 0
  let darkPixels = 0
  let exposedPixels = 0
  const brightnessBuckets = { low: 0, mid: 0, high: 0 }

  for (let index = 0; index < data.length; index += 16) {
    const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    brightnessSum += luminance
    if (luminance >= 242) glarePixels += 1
    if (luminance <= 45) darkPixels += 1
    if (luminance >= 225) exposedPixels += 1
    if (luminance < 90) brightnessBuckets.low += 1
    else if (luminance > 215) brightnessBuckets.high += 1
    else brightnessBuckets.mid += 1
  }

  const sampledPixels = Math.max(1, Math.floor(data.length / 16))
  const brightness = Number((brightnessSum / sampledPixels).toFixed(2))
  const glareCoverage = Number((glarePixels / sampledPixels).toFixed(3))
  const glare = Number((glareCoverage * 100).toFixed(2))
  const blur = computeBlurScore(context, canvas.width, canvas.height)
  const darkRatio = Number(((darkPixels / sampledPixels) * 100).toFixed(2))
  const exposedRatio = Number(((exposedPixels / sampledPixels) * 100).toFixed(2))
  const dynamicRange = brightnessBuckets.mid / Math.max(1, sampledPixels)
  let glareLevel = 'acceptable'
  if (glareCoverage >= 0.35 || (glareCoverage >= 0.2 && dynamicRange < 0.45)) glareLevel = 'excessive'
  else if (glareCoverage >= 0.2 || exposedRatio > 24) glareLevel = 'moderate'

  const warnings = []
  if (!bounds.detected || bounds.coverage < 0.18) warnings.push('document_not_detected')
  if (bounds.coverage > 0.96) warnings.push('document_out_of_frame')
  if (blur < 10) warnings.push('image_blurry')
  if (brightness < 80 || darkRatio > 35) warnings.push('image_too_dark')
  if (brightness > 218 || exposedRatio > 45) warnings.push('image_overexposed')
  if (glareLevel === 'excessive') warnings.push('excessive_glare')
  if (glareLevel === 'moderate') warnings.push('moderate_glare')

  return {
    blur,
    brightness,
    glare,
    glareCoverage,
    glareLevel,
    darkRatio,
    exposedRatio,
    documentDetected: bounds.detected,
    cropped: bounds.detected,
    perspectiveCorrected: bounds.detected,
    frontReadable: blur >= 10 && brightness >= 70 && glareLevel !== 'excessive',
    backReadable: blur >= 10 && brightness >= 70 && glareLevel !== 'excessive',
    warnings,
  }
}

async function canvasToFile(canvas, fileName) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('No fue posible preparar la imagen del documento.')
  return new File([blob], fileName, { type: 'image/jpeg' })
}

async function detectWithNativeBarcodeDetector(file) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return []

  try {
    const detector = new window.BarcodeDetector({
      formats: ['qr_code', 'pdf417', 'aztec', 'data_matrix', 'code_128', 'code_39'],
    })
    const image = await readImage(file)
    const results = await detector.detect(image)
    return (results || [])
      .filter((item) => item?.rawValue)
      .map((item) => ({
        value: item.rawValue,
        format: String(item.format || '').toLowerCase(),
        source: String(item.format || '').toLowerCase().includes('qr') ? 'qr' : 'barcode',
      }))
  } catch {
    return []
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
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)
  zxingReader = new BrowserMultiFormatReader(hints)
  return zxingReader
}

async function detectWithZxing(file) {
  const imageUrl = URL.createObjectURL(file)

  try {
    const reader = await getZxingReader()
    const result = await reader.decodeFromImageUrl(imageUrl)
    const text = result?.getText?.() || result?.text || ''
    if (!text) return []

    const format = String(result?.getBarcodeFormat?.()?.toString?.() || '').toLowerCase()
    return [
      {
        value: text,
        format,
        source: format.includes('qr') ? 'qr' : 'barcode',
      },
    ]
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

async function detectMachineReadableSignals(file) {
  const nativeSignals = await detectWithNativeBarcodeDetector(file)
  if (nativeSignals.length) return nativeSignals
  return detectWithZxing(file)
}

function dataUrlFromCanvas(canvas) {
  return canvas.toDataURL('image/jpeg', 0.78)
}

async function preprocessDocumentFile(file, side, reportStage) {
  const cacheKey = `${side}:${hashFileSignature(file)}`
  if (LOCAL_CACHE.has(cacheKey)) {
    return LOCAL_CACHE.get(cacheKey)
  }

  const pending = (async () => {
    const timings = {
      imagePreparationMs: 0,
      documentDetectionMs: 0,
      barcodeMs: 0,
    }

    reportStage('preparing-image', { side })
    const startedAt = nowMs()
    const image = await readImage(file)
    const { canvas, context } = drawImageToCanvas(image)

    reportStage('verifying-quality', { side })
    const detectionStartedAt = nowMs()
    const bounds = estimateDocumentBounds(context, canvas.width, canvas.height)
    const initialQuality = analyzeQuality(canvas, bounds)
    timings.documentDetectionMs = Math.round(nowMs() - detectionStartedAt)

    reportStage('detecting-document', { side })
    if (!bounds.detected) {
      const error = new Error('No detectamos el documento dentro de la imagen.')
      error.code = 'document_not_detected'
      throw error
    }

    reportStage('correcting-perspective', { side })
    const originalCropped = resizeCanvas(cropCanvas(canvas, bounds).canvas)
    const barcodeImage = originalCropped
    const ocrEnhanced = applySoftNoiseReduction(applyAdaptiveContrast(buildGrayCanvas(originalCropped)))
    const textOnlyCanvas = buildBinarizedCanvas(ocrEnhanced)
    const mrzEnhanced = buildMrzCanvas(originalCropped)
    const finalQuality = analyzeQuality(ocrEnhanced, {
      detected: true,
      coverage: 1,
    })
    timings.imagePreparationMs = Math.round(nowMs() - startedAt)

    const processedFile = await canvasToFile(
      textOnlyCanvas,
      `${side}-${String(file.name || 'documento').replace(/\.[^.]+$/, '')}.jpg`,
    )
    const barcodeStartedAt = nowMs()
    const signals = await detectMachineReadableSignals(await canvasToFile(barcodeImage, `${side}-barcode.jpg`))
    timings.barcodeMs = Math.round(nowMs() - barcodeStartedAt)

    return {
      originalFile: file,
      processedFile,
      side,
      signals,
      timings,
      variants: {
        originalCropped: dataUrlFromCanvas(originalCropped),
        ocrEnhanced: dataUrlFromCanvas(ocrEnhanced),
        barcodeImage: dataUrlFromCanvas(barcodeImage),
        mrzEnhanced: dataUrlFromCanvas(mrzEnhanced),
      },
      quality: finalQuality,
      previewUrl: dataUrlFromCanvas(ocrEnhanced),
      bounds,
      warnings: [...new Set([...initialQuality.warnings, ...finalQuality.warnings])],
    }
  })()

  LOCAL_CACHE.set(cacheKey, pending)

  try {
    return await pending
  } catch (error) {
    LOCAL_CACHE.delete(cacheKey)
    throw error
  }
}

function safeJsonParse(value, fallback) {
  if (typeof value !== 'string') return fallback

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeFieldShape(field) {
  if (field && typeof field === 'object' && !Array.isArray(field) && ('value' in field || 'confidence' in field)) {
    return {
      value: field.value ?? null,
      confidence: Number(field.confidence || 0),
      source: field.source || null,
      requiresReview: Boolean(field.requiresReview),
      alternatives: Array.isArray(field.alternatives) ? field.alternatives : [],
      displayValue: field.displayValue || null,
    }
  }

  return {
    ...DEFAULT_FIELD,
    value: field ?? null,
  }
}

function normalizeFieldKey(key = '') {
  const normalized = String(key || '').trim()
  const aliases = {
    birthDate: 'birth_date',
    birth_date: 'birth_date',
    expirationDate: 'expiration_date',
    expiration_date: 'expiration_date',
    issueDate: 'issue_date',
    issue_date: 'issue_date',
    documentNumber: 'document_number',
    passport_number: 'document_number',
    holder_name: 'name',
    nationality: 'nationality',
    issuingCountry: 'issuing_country',
    issuing_country: 'issuing_country',
    documentStatus: 'document_status',
    document_status: 'document_status',
    ineCurp: 'curp',
    ineCic: 'cic',
    ineOcr: 'ocr',
    clave: 'elector_key',
    clave_elector: 'elector_key',
    ocr_number: 'ocr',
    rfc: 'rfc',
  }

  return aliases[normalized] || normalized
}

function normalizePersonName(value = '', source = 'ocr', documentType = 'custom') {
  let normalized = String(value || '')
    .toUpperCase()
    .replace(/[|`~!@#$%^&*_=+[\]{}\\/"?;:.,()]/g, ' ')
    .replace(/</g, (match, offset, full) => {
      const next = full[offset + 1]
      return next === '<' ? ' << ' : ' '
    })
    .replace(/\s*<<\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim()

  if (source === 'mrz') {
    const parts = normalized
      .split('|')
      .map((part) => normalizeText(part.replace(/[^A-ZÑ ]/g, ' ')))
      .filter(Boolean)
    if (parts.length >= 2) {
      normalized = `${parts[0]} ${parts.slice(1).join(' ')}`
    } else {
      normalized = parts.join(' ')
    }
  }

  normalized = normalized.replace(/[^A-ZÑ ]/g, ' ').replace(/\s+/g, ' ').trim()

  if (documentType === 'ine' && normalized.split(' ').length >= 3) {
    return normalized
  }

  return normalized
}

function normalizeOcrLine(value = '') {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9Ñ< ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasRepeatedSequence(value = '') {
  const normalized = normalizeText(value)
  return /([A-Z]{2,})\1{2,}/.test(normalized) || /(\b[A-Z]\b(?:\s+\b[A-Z]\b){3,})/.test(normalized)
}

function hasAbnormalLetterDistribution(value = '') {
  const letters = String(value || '').replace(/[^A-ZÑ]/gi, '').toUpperCase()
  if (letters.length < 6) return false

  const vowels = (letters.match(/[AEIOUÁÉÍÓÚÜ]/g) || []).length
  const consonants = letters.length - vowels
  const vowelRatio = vowels / Math.max(1, letters.length)
  const consonantRatio = consonants / Math.max(1, letters.length)

  return vowelRatio < 0.15 || vowelRatio > 0.8 || consonantRatio < 0.2
}

function isValidPersonName(value = '') {
  if (!value || typeof value !== 'string') return false

  const normalized = String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-ZÑ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized || normalized.length < 5 || normalized.length > 80) return false
  if (/\d/.test(value)) return false

  const words = normalized.split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 8) return false

  const forbidden = [
    'MEXICO',
    'INSTITUTO',
    'NACIONAL',
    'ELECTORAL',
    'CREDENCIAL',
    'VOTAR',
    'DOMICILIO',
    'CLAVE',
    'ELECTOR',
    'FECHA',
    'NACIMIENTO',
    'VIGENCIA',
    'SECCION',
    'REGISTRO',
    'SEXO',
    'HTTP',
    'QR',
    'INE',
    'OCR',
    'MRZ',
  ]

  if (forbidden.some((word) => words.includes(word))) return false

  const singleLetterWords = words.filter((word) => word.length === 1).length
  if (singleLetterWords / words.length > 0.2) return false

  if (hasRepeatedSequence(normalized)) return false
  if (hasAbnormalLetterDistribution(normalized)) return false

  const suspiciousJoinedTokens = words.filter((word) => word.length >= 12).length
  if (suspiciousJoinedTokens >= 2) return false

  return words.every((word) => /^[A-ZÑ]{2,}$/.test(word) || /^[A-ZÑ]$/.test(word))
}

function isValidFullName(value = '') {
  const tokens = normalizeText(value).split(' ').filter((token) => /^[A-ZÑ]{2,}$/.test(token))
  return tokens.length >= 2
}

function extractIneNameFromFront(lines = []) {
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map((line) => normalizeOcrLine(line))
    .filter(Boolean)

  const startIndex = normalizedLines.findIndex(
    (line) => line === 'NOMBRE' || line.startsWith('NOMBRE '),
  )

  if (startIndex === -1) return null

  const stopWords = [
    'DOMICILIO',
    'SEXO',
    'CLAVE DE ELECTOR',
    'CURP',
    'FECHA DE NACIMIENTO',
    'ANO DE REGISTRO',
    'AÑO DE REGISTRO',
    'SECCION',
    'SECCIÓN',
    'VIGENCIA',
  ]

  const candidates = []
  for (let index = startIndex + 1; index < normalizedLines.length && candidates.length < 4; index += 1) {
    const line = normalizedLines[index]
    if (stopWords.some((word) => line.includes(word))) break
    if (line.length < 2) continue
    candidates.push(line)
  }

  const value = normalizePersonName(candidates.join(' '), 'front_ocr', 'ine')
  return isValidPersonName(value) ? value : null
}

function parseMrzName(line = '') {
  const cleaned = String(line || '')
    .toUpperCase()
    .replace(/[^A-ZÑ<]/g, '')
    .replace(/<{3,}/g, '<<')

  if (!cleaned.includes('<<')) return null

  const parts = cleaned.split('<<').filter(Boolean)
  if (parts.length < 2) return null

  const surnames = parts[0].replace(/</g, ' ').trim()
  const givenNames = parts.slice(1).join(' ').replace(/</g, ' ').trim()
  const fullName = normalizePersonName(`${givenNames} ${surnames}`, 'mrz')

  return isValidPersonName(fullName) ? fullName : null
}

function parseMrzNameParts(line = '') {
  const cleaned = String(line || '')
    .toUpperCase()
    .replace(/[^A-ZÑ<]/g, '')
    .replace(/<{3,}/g, '<<')

  if (!cleaned.includes('<<')) return { surname: null, givenNames: null, fullName: null }

  const parts = cleaned.split('<<').filter(Boolean)
  if (parts.length < 2) return { surname: null, givenNames: null, fullName: null }

  const surname = normalizePersonName(parts[0].replace(/</g, ' '), 'mrz')
  const givenNames = normalizePersonName(parts.slice(1).join(' ').replace(/</g, ' '), 'mrz')
  const fullName = normalizePersonName(`${givenNames} ${surname}`, 'mrz')

  if (!isValidPersonName(fullName)) {
    return { surname: null, givenNames: null, fullName: null }
  }

  return { surname, givenNames, fullName }
}

function buildCandidate(value, source, confidence = 0, extra = {}) {
  return {
    value,
    source,
    confidence: Number(confidence || 0),
    requiresReview: false,
    alternatives: [],
    ...extra,
  }
}

function dedupeAlternatives(candidates = []) {
  const seen = new Set()
  return candidates.filter((candidate) => {
    const key = `${candidate.source}:${candidate.value}`
    if (!candidate.value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function resolveField(candidates = [], options = {}) {
  const {
    preferSources = [],
    minimumConfidence = 0,
    validate = () => true,
  } = options

  const prepared = dedupeAlternatives(candidates)
    .filter((candidate) => candidate?.value !== null && candidate?.value !== undefined && String(candidate.value).trim())
    .filter((candidate) => candidate.confidence >= minimumConfidence)
    .map((candidate) => ({
      ...candidate,
      sourceRank: preferSources.indexOf(candidate.source) === -1 ? 99 : preferSources.indexOf(candidate.source),
      valid: validate(candidate.value),
      lengthScore: normalizeText(candidate.value).length,
    }))
    .filter((candidate) => candidate.valid)
    .sort((candidateA, candidateB) => {
      if (candidateA.sourceRank !== candidateB.sourceRank) return candidateA.sourceRank - candidateB.sourceRank
      if (candidateA.confidence !== candidateB.confidence) return candidateB.confidence - candidateA.confidence
      return candidateB.lengthScore - candidateA.lengthScore
    })

  if (!prepared.length) return { ...DEFAULT_FIELD }

  const [best, ...rest] = prepared
  return {
    value: best.value,
    confidence: best.confidence,
    source: best.source,
    requiresReview: false,
    alternatives: rest.map(({ value, confidence, source }) => ({ value, confidence, source })),
    displayValue: best.displayValue || null,
  }
}

function resolveName({ frontName, mrzName, barcodeName, generalOcrName } = {}) {
  const candidates = [
    { ...frontName, priority: 4 },
    { ...mrzName, priority: 3 },
    { ...barcodeName, priority: 2 },
    { ...generalOcrName, priority: 1 },
  ]
    .filter((candidate) => candidate?.value)
    .map((candidate) => ({
      ...candidate,
      value: normalizePersonName(candidate.value, candidate.source || 'ocr'),
    }))
    .filter((candidate) => isValidPersonName(candidate.value))

  if (!candidates.length) {
    return {
      value: null,
      confidence: 0,
      source: null,
      requiresReview: true,
      alternatives: [],
    }
  }

  candidates.sort((candidateA, candidateB) => {
    if (candidateB.priority !== candidateA.priority) return candidateB.priority - candidateA.priority
    return Number(candidateB.confidence || 0) - Number(candidateA.confidence || 0)
  })

  const selected = candidates[0]
  return {
    value: normalizePersonName(selected.value, selected.source || 'ocr'),
    confidence: Number(selected.confidence || 0),
    source: selected.source || null,
    requiresReview: Number(selected.confidence || 0) < 75,
    alternatives: candidates.slice(1).map((item) => ({
      value: normalizePersonName(item.value, item.source || 'ocr'),
      confidence: Number(item.confidence || 0),
      source: item.source || null,
    })),
  }
}

function buildNameCandidate(value, source, confidence = 0) {
  const normalizedValue = normalizePersonName(value, source)
  if (!isValidPersonName(normalizedValue)) {
    return {
      value: null,
      confidence: 0,
      source,
      requiresReview: false,
      alternatives: [],
    }
  }

  return {
    value: normalizedValue,
    confidence: Number(confidence || 0),
    source,
    requiresReview: Number(confidence || 0) < 75,
    alternatives: [],
  }
}

function normalizeCurp(value = '') {
  const candidate = normalizeText(value).replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (!/^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/.test(candidate)) {
    return null
  }
  return candidate
}

function findCurpInText(value = '') {
  const match = String(value || '')
    .toUpperCase()
    .match(/[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])([0-2]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d/g)
  return normalizeCurp(match?.[0] || '')
}

function parseMrzDate(value = '', options = {}) {
  const raw = String(value || '').trim()
  if (!/^\d{6}$/.test(raw)) return null
  const yy = Number(raw.slice(0, 2))
  const month = raw.slice(2, 4)
  const day = raw.slice(4, 6)
  const currentYear = new Date().getFullYear() % 100
  const century = options.allowFuture ? (yy < currentYear ? 2000 : yy <= currentYear + 15 ? 2000 : 1900) : yy > currentYear + 2 ? 1900 : 2000
  return normalizeIsoDate(`${century + yy}-${month}-${day}`, options)
}

function normalizeIsoDate(value = '', { allowFuture = false } = {}) {
  const normalized = String(value || '').trim()
  if (!normalized) return null

  const isoMatch = normalized.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/)
  if (isoMatch) return validateIsoDate(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, { allowFuture })

  const latinMatch = normalized.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/)
  if (latinMatch) return validateIsoDate(`${latinMatch[3]}-${latinMatch[2]}-${latinMatch[1]}`, { allowFuture })

  return null
}

function validateIsoDate(value = '', { allowFuture = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (date.toISOString().slice(0, 10) !== value) return null
  if (!allowFuture && date.getTime() > new Date('2026-07-24T23:59:59').getTime()) return null
  return value
}

function normalizeExpirationDate(value = '', { allowYearOnly = false } = {}) {
  const date = normalizeIsoDate(value)
  if (date) return { value: date, displayValue: null }

  if (allowYearOnly) {
    const yearMatch = String(value || '').match(/\b(20\d{2})\b/)
    if (yearMatch) {
      return {
        value: `${yearMatch[1]}-12-31`,
        displayValue: yearMatch[1],
      }
    }
  }

  const rangeMatch = String(value || '').match(/\b(20\d{2})\s*-\s*(20\d{2})\b/)
  if (rangeMatch) {
    return {
      value: `${rangeMatch[2]}-12-31`,
      displayValue: `${rangeMatch[1]}-${rangeMatch[2]}`,
    }
  }

  return { value: null, displayValue: null }
}

function parseMrz(lines = []) {
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map((line) => normalizeAlphanumeric(line))
    .filter((line) => line.length >= 20)

  const result = {
    rawLines: cleaned,
    documentNumber: null,
    birthDate: null,
    sex: null,
    expirationDate: null,
    surname: null,
    givenNames: null,
    valid: false,
  }

  if (!cleaned.length) return result

  const joined = cleaned.join('\n')
  const mrzDocMatch =
    joined.match(/(?:ID[A-Z]{3}|P<[A-Z]{3})([A-Z0-9]{6,10})/) ||
    joined.match(/[A-Z0-9]{8,10}/)
  const birthMatch = joined.match(/(?:^|<|\n)(\d{6})\d([MFH<])(\d{6})/m)
  const nameLine = cleaned.find(
    (line) =>
      line.includes('<<') &&
      /^[A-Z<]+$/.test(line) &&
      /[A-Z]{2,}<<[A-Z]{2,}/.test(line) &&
      !/^ID[A-Z]{3}/.test(line) &&
      !/^P<[A-Z]{3}/.test(line),
  )

  const parsedMrzName = parseMrzNameParts(nameLine || '')
  if (parsedMrzName.fullName) {
    result.surname = parsedMrzName.surname
    result.givenNames = parsedMrzName.givenNames
  }

  if (mrzDocMatch) result.documentNumber = mrzDocMatch[1] || mrzDocMatch[0]
  if (birthMatch) {
    result.birthDate = parseMrzDate(birthMatch[1])
    result.sex = birthMatch[2] === '<' ? null : birthMatch[2]
    result.expirationDate = parseMrzDate(birthMatch[3], { allowFuture: true })
  }

  result.valid = Boolean(
    result.documentNumber &&
      result.birthDate &&
      (result.surname || result.givenNames),
  )

  return result
}

function filterRawText(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .filter((line) => {
      const usefulChars = (line.match(/[A-Z0-9]/gi) || []).length
      const ratio = usefulChars / Math.max(1, line.length)
      return usefulChars >= 3 && ratio >= 0.45
    })
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .join('\n')
}

function collectRawTexts(response = {}, parts = []) {
  const debug = response?.debug && typeof response.debug === 'object' ? response.debug : {}
  const texts = {
    frontRawText: filterRawText(response.frontRawText || response.front_raw_text || debug.frontRawText || ''),
    backRawText: filterRawText(response.backRawText || response.back_raw_text || debug.backRawText || ''),
    mrzRawText: filterRawText(response.mrzRawText || response.mrz_raw_text || debug.mrzRawText || ''),
    normalizedText: '',
  }

  texts.normalizedText = [texts.frontRawText, texts.backRawText, texts.mrzRawText]
    .filter(Boolean)
    .join('\n')

  const signalText = parts
    .flatMap((part) => part?.signals || [])
    .map((signal) => normalizeText(signal.value))
    .filter(Boolean)
    .join('\n')

  if (signalText) {
    texts.normalizedText = [texts.normalizedText, signalText].filter(Boolean).join('\n')
  }

  return texts
}

function collectNameCandidates(response = {}, rawTexts = {}, mrz = { rawLines: [] }, normalizedDocumentType = 'custom', signals = []) {
  const incomingFields = normalizeIncomingFields(response.fields || {})
  const frontLines = String(rawTexts.frontRawText || '').split(/\r?\n/)
  const frontNameCandidate = normalizedDocumentType === 'ine'
    ? extractIneNameFromFront(frontLines)
    : null
  const mrzLine = Array.isArray(mrz?.rawLines) ? mrz.rawLines.find((line) => line.includes('<<')) : ''
  const mrzNameCandidate = parseMrzName(mrzLine || '')
  const barcodeNameCandidate =
    signals
      .filter((signal) => ['barcode', 'qr'].includes(String(signal?.source || '')))
      .map((signal) => normalizePersonName(signal?.value || '', 'barcode', normalizedDocumentType))
      .find((candidate) => isValidPersonName(candidate)) || null
  const generalOcrCandidateRaw = normalizePersonName(
    fieldValue(incomingFields, 'name') || fieldValue(incomingFields, 'holder_name') || '',
    'ocr',
    normalizedDocumentType,
  )
  const generalOcrNameCandidate = isValidPersonName(generalOcrCandidateRaw) ? generalOcrCandidateRaw : null

  return {
    frontNameCandidate,
    mrzNameCandidate,
    barcodeNameCandidate,
    generalOcrNameCandidate,
  }
}

function normalizeRfc(value = '') {
  const candidate = normalizeText(value).replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (!/^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/.test(candidate)) return null
  const date = normalizeIsoDate(`19${candidate.slice(4, 6)}-${candidate.slice(6, 8)}-${candidate.slice(8, 10)}`, { allowFuture: false })
    || normalizeIsoDate(`20${candidate.slice(4, 6)}-${candidate.slice(6, 8)}-${candidate.slice(8, 10)}`, { allowFuture: false })
  return date ? candidate : null
}

function classifyDocumentType({ requestedType, fields = {}, rawTexts = {} }) {
  const normalizedRequested = normalizeDocumentType(requestedType || 'custom')
  const haystack = Object.values(rawTexts)
    .join(' ')
    .concat(` ${Object.values(fields).map((field) => field?.value || '').join(' ')}`)
    .toUpperCase()

  let bestType = normalizedRequested
  let bestScore = normalizedRequested === 'custom' ? 0 : 2

  Object.entries(DOCUMENT_TYPE_KEYWORDS).forEach(([documentType, keywords]) => {
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 2 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      bestType = documentType
    }
  })

  return bestType || 'custom'
}

function normalizeIncomingFields(fields = {}) {
  return Object.entries(fields || {}).reduce((accumulator, [key, value]) => {
    accumulator[normalizeFieldKey(key)] = normalizeFieldShape(value)
    return accumulator
  }, {})
}

function fieldValue(fields = {}, key = '') {
  return fields[key]?.value ?? null
}

function textCandidates(rawTexts = {}) {
  return [rawTexts.frontRawText, rawTexts.backRawText, rawTexts.mrzRawText, rawTexts.normalizedText]
    .filter(Boolean)
    .join('\n')
}

function buildResolvedFields(response = {}, parts = [], normalizedDocumentType = 'custom') {
  const normalizedIncomingFields = normalizeIncomingFields(response.fields || {})
  const rawTexts = collectRawTexts(response, parts)
  const mrz = parseMrz(rawTexts.mrzRawText.split(/\r?\n/))
  const signalTexts = parts.flatMap((part) => part?.signals || [])
  const allText = textCandidates(rawTexts)
  const nameCandidates = collectNameCandidates(
    response,
    rawTexts,
    mrz,
    normalizedDocumentType,
    signalTexts,
  )

  const frontNameConfidence = nameCandidates.frontNameCandidate ? clamp(Number(normalizedIncomingFields.name?.confidence || 84), 70, 95) : 0
  const mrzNameConfidence = nameCandidates.mrzNameCandidate && mrz.valid ? clamp(Number(response?.timings?.mrzConfidence || 86), 75, 95) : 0
  const barcodeSignal = signalTexts.find(
    (signal) => normalizePersonName(signal?.value || '', 'barcode', normalizedDocumentType) === nameCandidates.barcodeNameCandidate,
  )
  const barcodeNameConfidence = nameCandidates.barcodeNameCandidate
    ? clamp(Number(barcodeSignal?.confidence || 72), 55, 92)
    : 0
  const generalNameConfidence = nameCandidates.generalOcrNameCandidate ? 45 : 0

  const name = resolveName({
    frontName: buildNameCandidate(nameCandidates.frontNameCandidate, 'front_ocr', frontNameConfidence),
    mrzName: buildNameCandidate(nameCandidates.mrzNameCandidate, 'mrz', mrzNameConfidence),
    barcodeName: buildNameCandidate(nameCandidates.barcodeNameCandidate, 'barcode', barcodeNameConfidence),
    generalOcrName: buildNameCandidate(nameCandidates.generalOcrNameCandidate, 'ocr', generalNameConfidence),
  })

  const curpCandidates = [
    fieldValue(normalizedIncomingFields, 'curp'),
    findCurpInText(rawTexts.frontRawText),
    findCurpInText(rawTexts.backRawText),
    ...signalTexts.map((signal) => findCurpInText(signal.value)),
    findCurpInText(allText),
  ]
    .map((value) => normalizeCurp(value || ''))
    .filter(Boolean)

  const expirationSource = normalizeExpirationDate(
    fieldValue(normalizedIncomingFields, 'expiration_date') ||
      fieldValue(normalizedIncomingFields, 'document_expiration') ||
      allText.match(/(?:VIGENCIA|EXPIRY|VALID UNTIL|EXPIRACI[OÓ]N)[^0-9]*(20\d{2}(?:\s*-\s*20\d{2})?|\d{2}[/-]\d{2}[/-]\d{4}|\d{4}[/-]\d{2}[/-]\d{2})/i)?.[1] ||
      '',
    { allowYearOnly: normalizedDocumentType === 'ine' },
  )

  const birthDate = resolveField(
    [
      buildCandidate(normalizeIsoDate(fieldValue(normalizedIncomingFields, 'birth_date') || ''), normalizedIncomingFields.birth_date?.source || 'front_ocr', normalizedIncomingFields.birth_date?.confidence || 85),
      buildCandidate(parseMrzDate(fieldValue(normalizedIncomingFields, 'birth_date') || ''), 'mrz', 82),
      buildCandidate(mrz.birthDate, 'mrz', mrz.valid ? 84 : 0),
    ],
    {
      preferSources: ['front_ocr', 'mrz', 'barcode', 'ocr'],
      minimumConfidence: 60,
      validate: (value) => Boolean(validateIsoDate(value)),
    },
  )

  const documentNumber = resolveField(
    [
      buildCandidate(normalizeText(fieldValue(normalizedIncomingFields, 'document_number') || ''), normalizedIncomingFields.document_number?.source || 'front_ocr', normalizedIncomingFields.document_number?.confidence || 82),
      buildCandidate(normalizeText(fieldValue(normalizedIncomingFields, 'passport_number') || ''), 'mrz', 84),
      buildCandidate(mrz.documentNumber, 'mrz', mrz.valid ? 83 : 0),
    ],
    {
      preferSources: ['front_ocr', 'mrz', 'barcode', 'ocr'],
      minimumConfidence: 55,
      validate: (value) => normalizeAlphanumeric(value).length >= 5,
    },
  )

  const curp = resolveField(
    curpCandidates.map((value, index) => buildCandidate(value, index === 0 ? 'front_ocr' : index < 3 ? 'back_ocr' : 'barcode', 80)),
    {
      preferSources: ['front_ocr', 'back_ocr', 'barcode', 'qr', 'ocr'],
      minimumConfidence: 60,
      validate: (value) => Boolean(normalizeCurp(value)),
    },
  )

  const expirationDate = expirationSource.value
    ? {
        value: expirationSource.value,
        confidence: 78,
        source: normalizedIncomingFields.expiration_date?.source || 'ocr',
        requiresReview: false,
        alternatives: [],
        displayValue: expirationSource.displayValue,
      }
    : { ...DEFAULT_FIELD }

  const documentType = {
    value: normalizedDocumentType,
    confidence: normalizedDocumentType === 'custom' ? 55 : 98,
    source: 'document_classifier',
    requiresReview: false,
    alternatives: [],
  }

  const documentStatus = expirationDate.value
    ? {
        value: calculateDocumentStatus(expirationDate.value),
        confidence: 90,
        source: expirationDate.source,
        requiresReview: false,
        alternatives: [],
      }
    : { ...DEFAULT_FIELD }

  const fields = {
    document_type: documentType,
    document_number: documentNumber,
    name,
    birth_date: birthDate,
    curp,
    expiration_date: expirationDate,
    cic: normalizeFieldShape(normalizedIncomingFields.cic),
    ocr: normalizeFieldShape(normalizedIncomingFields.ocr),
    elector_key: normalizeFieldShape(normalizedIncomingFields.elector_key),
    barcode_document_number: { ...DEFAULT_FIELD },
    mrz_document_number: mrz.documentNumber
      ? buildCandidate(mrz.documentNumber, 'mrz', 82, { alternatives: [] })
      : { ...DEFAULT_FIELD },
    ocr_number: normalizeFieldShape(normalizedIncomingFields.ocr_number || normalizedIncomingFields.ocr),
    issue_date: normalizeFieldShape(normalizedIncomingFields.issue_date),
    nationality: normalizeFieldShape(normalizedIncomingFields.nationality),
    issuing_country: normalizeFieldShape(normalizedIncomingFields.issuing_country),
    rfc: normalizeRfc(fieldValue(normalizedIncomingFields, 'rfc'))
      ? buildCandidate(normalizeRfc(fieldValue(normalizedIncomingFields, 'rfc')), normalizedIncomingFields.rfc?.source || 'ocr', 70)
      : { ...DEFAULT_FIELD },
    document_status: documentStatus,
  }

  return {
    fields,
    rawTexts,
    mrz,
    nameCandidates,
  }
}

function calculateDocumentStatus(expirationDate = '') {
  if (!expirationDate) return ''

  const now = new Date('2026-07-24T00:00:00')
  const expiration = new Date(`${expirationDate}T00:00:00`)
  if (Number.isNaN(expiration.getTime())) return ''

  const diffDays = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'Vencida'
  if (diffDays <= 30) return 'Por vencer'
  return 'Vigente'
}

function aggregateLocalQuality(parts = []) {
  const validParts = parts.filter(Boolean)
  if (!validParts.length) {
    return {
      blur: 0,
      brightness: 0,
      glare: 0,
      glareLevel: 'acceptable',
      documentDetected: false,
      cropped: false,
      perspectiveCorrected: false,
      frontReadable: false,
      backReadable: false,
    }
  }

  const average = (key) =>
    Number(
      (
        validParts.reduce((sum, item) => sum + Number(item?.quality?.[key] || 0), 0) /
        validParts.length
      ).toFixed(2),
    )

  const glareLevel = validParts.some((item) => item?.quality?.glareLevel === 'excessive')
    ? 'excessive'
    : validParts.some((item) => item?.quality?.glareLevel === 'moderate')
      ? 'moderate'
      : 'acceptable'

  return {
    blur: average('blur'),
    brightness: average('brightness'),
    glare: average('glare'),
    glareLevel,
    documentDetected: validParts.every((item) => Boolean(item?.quality?.documentDetected)),
    cropped: validParts.every((item) => Boolean(item?.quality?.cropped)),
    perspectiveCorrected: validParts.every((item) => Boolean(item?.quality?.perspectiveCorrected)),
    frontReadable: Boolean(validParts[0]?.quality?.frontReadable),
    backReadable: validParts[1] ? Boolean(validParts[1]?.quality?.backReadable) : true,
  }
}

function mapFormFieldToStructuredKey(fieldKey = '') {
  const aliases = {
    name: 'name',
    birthDate: 'birth_date',
    nationality: 'nationality',
    documentNumber: 'document_number',
    documentIssueDate: 'issue_date',
    documentExpiration: 'expiration_date',
    documentStatus: 'document_status',
    issuingCountry: 'issuing_country',
    ineCurp: 'curp',
    ineCic: 'cic',
    ineOcr: 'ocr',
    licenseType: 'document_type',
    licenseCategory: 'license_category',
  }

  return aliases[fieldKey] || fieldKey
}

function ensureExpectedFields(result = {}, normalizedDocumentType) {
  const expectedFields = DOCUMENT_FIELD_MAP[normalizedDocumentType] || DOCUMENT_FIELD_MAP.custom
  const nextFields = { ...result.fields }

  expectedFields
    .map((fieldKey) => mapFormFieldToStructuredKey(fieldKey))
    .forEach((fieldKey) => {
      if (!nextFields[fieldKey]) {
        nextFields[fieldKey] = { ...DEFAULT_FIELD }
      }
    })

  ESSENTIAL_FIELD_KEYS.concat(OPTIONAL_FIELD_KEYS).forEach((fieldKey) => {
    if (!nextFields[fieldKey]) {
      nextFields[fieldKey] = { ...DEFAULT_FIELD }
    }
  })

  return {
    ...result,
    documentType: result.documentType || normalizedDocumentType,
    fields: nextFields,
  }
}

function computeReviewFields(fields = {}, warnings = []) {
  const reviewFields = []

  ESSENTIAL_FIELD_KEYS.forEach((key) => {
    const field = fields[key] || DEFAULT_FIELD
    if (!field.value || field.confidence < 70 || field.requiresReview) {
      reviewFields.push(key)
    }
  })

  if (warnings.includes('document_out_of_frame') || warnings.includes('image_blurry')) {
    reviewFields.push('document_capture')
  }

  return [...new Set(reviewFields)]
}

function buildWarnings(baseWarnings = [], fields = {}, quality = {}) {
  const warnings = [...new Set(baseWarnings.filter(Boolean))]

  if (quality.glareLevel === 'excessive' && !warnings.includes('excessive_glare')) {
    warnings.push('excessive_glare')
  }

  const reviewFields = computeReviewFields(fields, warnings)
  if (reviewFields.length && !warnings.includes('manual_review_required')) {
    warnings.push('manual_review_required')
  }

  OPTIONAL_FIELD_KEYS.forEach((key) => {
    if (!fields[key]?.value && !warnings.includes(`missing_optional_${key}`)) {
      warnings.push(`missing_optional_${key}`)
    }
  })

  return [...new Set(warnings)]
}

function buildStructuredFallback(error, normalizedDocumentType, timings, stageEntries = []) {
  const emptyFields = ensureExpectedFields(
    {
      fields: {
        document_type: {
          value: normalizedDocumentType,
          confidence: normalizedDocumentType === 'custom' ? 0 : 98,
          source: 'document_classifier',
          requiresReview: false,
          alternatives: [],
        },
      },
    },
    normalizedDocumentType,
  ).fields

  return {
    success: false,
    documentType: normalizedDocumentType,
    documentSide: 'front_back',
    fields: emptyFields,
    quality: {
      blur: 0,
      brightness: 0,
      glare: 0,
      glareLevel: 'acceptable',
      documentDetected: false,
      cropped: false,
      perspectiveCorrected: false,
      frontReadable: false,
      backReadable: false,
    },
    warnings: [error?.code || 'backend_unavailable'],
    reviewFields: ['document_capture'],
    processingTimeMs: Math.round(nowMs() - timings.startedAt),
    timings,
    stages: stageEntries,
    message: error?.message || 'No fue posible procesar el documento.',
    debug: {
      enabled: false,
    },
  }
}

function mapStructuredFieldsToLegacy(result = {}, kind = 'ine') {
  const fields = result?.fields || {}
  const valueOf = (key) => fields[key]?.value ?? ''
  const displayValueOf = (key) => fields[key]?.displayValue ?? ''
  const normalizedKind = normalizeDocumentType(kind)

  return {
    ineScanRaw: JSON.stringify(
      {
        documentType: result.documentType || normalizedKind,
        warnings: result.warnings || [],
        reviewFields: result.reviewFields || [],
        timings: result.timings || {},
        quality: result.quality || {},
        fields,
      },
      null,
      2,
    ),
    ineScanStatus: result.success ? 'scanned' : 'partial',
    name: normalizeText(valueOf('name')),
    birthDate: normalizeText(valueOf('birth_date')),
    nationality: normalizeText(valueOf('nationality')),
    documentNumber: normalizeText(valueOf('document_number')),
    documentIssueDate: normalizeText(valueOf('issue_date')),
    documentExpiration: normalizeText(displayValueOf('expiration_date') || valueOf('expiration_date')),
    documentStatus: normalizeText(valueOf('document_status')),
    issuingCountry: normalizeText(valueOf('issuing_country')),
    ineCurp: normalizeText(valueOf('curp')),
    ineCic: normalizeText(valueOf('cic')),
    ineOcr: normalizeText(valueOf('ocr')),
    licenseType:
      normalizedKind === 'driver_license'
        ? normalizeText(valueOf('document_type') || 'Licencia')
        : '',
    licenseCategory: normalizeText(valueOf('license_category') || ''),
    scanWarnings: Array.isArray(result?.warnings) ? result.warnings : [],
    scanReviewFields: Array.isArray(result?.reviewFields) ? result.reviewFields : [],
    scanDocumentType: result?.documentType || normalizedKind,
    scanQuality: result?.quality || {},
    scanProcessingTimeMs: Number(result?.processingTimeMs || 0),
    scanProgressStages: Array.isArray(result?.stages) ? result.stages : [],
  }
}

export async function scanDocumentFiles(input = {}, options = {}) {
  const requestedDocumentType = normalizeDocumentType(
    options.documentType || options.kind || input.documentType || 'ine',
  )
  const frontFile = input.frontFile || input.ineFront || input.front || null
  const backFile = input.backFile || input.ineBack || input.back || null
  const report = createStageReporter(options.onStageChange)
  const timings = {
    startedAt: report.startedAt,
    uploadMs: 0,
    imagePreparationMs: 0,
    documentDetectionMs: 0,
    frontOcrMs: 0,
    backOcrMs: 0,
    mrzMs: 0,
    barcodeMs: 0,
    fieldResolutionMs: 0,
    validationMs: 0,
    storageMs: 0,
    externalServiceMs: 0,
    totalMs: 0,
  }

  if (!frontFile) {
    throw new Error('Selecciona al menos la imagen frontal del documento.')
  }

  try {
    const parts = await Promise.all(
      [
        preprocessDocumentFile(frontFile, 'front', report.push),
        backFile ? preprocessDocumentFile(backFile, 'back', report.push) : null,
      ].filter(Boolean),
    )

    timings.imagePreparationMs = parts.reduce((sum, part) => sum + Number(part?.timings?.imagePreparationMs || 0), 0)
    timings.documentDetectionMs = parts.reduce((sum, part) => sum + Number(part?.timings?.documentDetectionMs || 0), 0)
    timings.barcodeMs = parts.reduce((sum, part) => sum + Number(part?.timings?.barcodeMs || 0), 0)

    report.push('uploading-file')
    const formData = new FormData()
    formData.append('document_front', parts[0].processedFile)
    if (parts[1]?.processedFile) formData.append('document_back', parts[1].processedFile)
    formData.append('document_type', requestedDocumentType)
    formData.append('front_signals', JSON.stringify(parts[0].signals || []))
    formData.append('back_signals', JSON.stringify(parts[1]?.signals || []))
    formData.append('quality_front', JSON.stringify(parts[0].quality || {}))
    formData.append('quality_back', JSON.stringify(parts[1]?.quality || {}))

    const uploadStartedAt = nowMs()
    const requestFactory = () =>
      requestWithCandidates(
        [
          {
            method: 'postform',
            path: '/auth/ocr/scan-document',
            formData,
            timeoutMs: SCAN_TIMEOUT_MS,
            headers: { Accept: 'application/json' },
          },
        ],
        {
          signal: options.signal,
        },
      )

    let response
    try {
      response = await requestFactory()
    } catch (error) {
      if (!options.signal?.aborted && Number(error?.status || 0) === 0) {
        response = await requestFactory()
      } else {
        throw error
      }
    }
    timings.uploadMs = Math.round(nowMs() - uploadStartedAt)
    timings.externalServiceMs = Number(response?.processingTimeMs || response?.timings?.externalServiceMs || 0)
    timings.frontOcrMs = Number(response?.timings?.frontOcrMs || 0)
    timings.backOcrMs = Number(response?.timings?.backOcrMs || 0)
    timings.mrzMs = Number(response?.timings?.mrzMs || 0)
    timings.storageMs = Number(response?.timings?.storageMs || 0)

    report.push('reading-information')
    const fieldResolutionStartedAt = nowMs()
    const aggregatedQuality = aggregateLocalQuality(parts)
    const initialFields = normalizeIncomingFields(response?.fields || {})
    const classifiedDocumentType = classifyDocumentType({
      requestedType: response?.documentType || requestedDocumentType,
      fields: initialFields,
      rawTexts: collectRawTexts(response, parts),
    })
    const resolved = buildResolvedFields(response, parts, classifiedDocumentType)
    timings.fieldResolutionMs = Math.round(nowMs() - fieldResolutionStartedAt)

    report.push('validating-data')
    const validationStartedAt = nowMs()
    const merged = ensureExpectedFields(
      {
        ...response,
        success: response?.success !== false,
        documentType: classifiedDocumentType,
        documentSide: backFile ? 'front_back' : 'front',
        fields: resolved.fields,
        quality: {
          ...aggregatedQuality,
          ...response.quality,
        },
        debug: {
          enabled: false,
        },
      },
      classifiedDocumentType,
    )

    merged.warnings = buildWarnings(
      [
        ...(Array.isArray(response?.warnings) ? response.warnings : []),
        ...parts.flatMap((part) => part?.warnings || []),
      ],
      merged.fields,
      merged.quality,
    )
    merged.reviewFields = computeReviewFields(merged.fields, merged.warnings)
    timings.validationMs = Math.round(nowMs() - validationStartedAt)

    report.push('completed')
    timings.totalMs = Math.round(nowMs() - report.startedAt)
    merged.processingTimeMs = Number(response?.processingTimeMs || timings.totalMs)
    merged.timings = {
      ...response?.timings,
      ...timings,
    }
    merged.stages = report.entries
    merged.localProcessing = {
      front: {
        previewUrl: parts[0].previewUrl,
        quality: parts[0].quality,
        variants: parts[0].variants,
      },
      back: parts[1]
        ? {
            previewUrl: parts[1].previewUrl,
            quality: parts[1].quality,
            variants: parts[1].variants,
          }
        : null,
    }
    merged.rawText = resolved.rawTexts
    merged.mrz = resolved.mrz
    merged.legacy = mapStructuredFieldsToLegacy(merged, classifiedDocumentType)

    return merged
  } catch (error) {
    const fallback = buildStructuredFallback(error, requestedDocumentType, timings, report.entries)
    report.push('completed', { progress: 100, error: true })
    fallback.stages = report.entries
    fallback.legacy = mapStructuredFieldsToLegacy(fallback, requestedDocumentType)
    throw Object.assign(error, {
      structuredResult: fallback,
    })
  }
}

export {
  filterRawText,
  extractIneNameFromFront,
  isValidPersonName,
  normalizeCurp,
  normalizeIsoDate,
  normalizePersonName,
  parseMrz,
  parseMrzName,
  resolveName,
  resolveField,
  validateIsoDate,
  normalizeText,
}
