export const IDENTIFICATION_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

export const IDENTIFICATION_MAX_FILE_BYTES = 10 * 1024 * 1024
export const IDENTIFICATION_MAX_PDF_BYTES = 20 * 1024 * 1024

const DOCUMENT_TYPES_WITH_OPTIONAL_EXPIRATION = new Set([
  'proof_of_address',
  'constancy',
  'invoice',
  'custom',
])

const DEFAULT_UPLOAD_ENDPOINTS = [
  '/auth/registration/identification',
  '/registro/identificacion',
  '/usuarios/identificacion',
]

let pdfLibPromise = null
let exifrPromise = null

function trimText(value = '') {
  return String(value || '').trim()
}

function isAllowedMimeType(type = '') {
  return IDENTIFICATION_ALLOWED_MIME_TYPES.includes(String(type || '').trim().toLowerCase())
}

function isPdfFile(file) {
  return String(file?.type || '').trim().toLowerCase() === 'application/pdf'
}

function createValidationError(message, field = 'file') {
  const error = new Error(message)
  error.field = field
  return error
}

function dataUriToUint8Array(dataUri = '') {
  const [, base64 = ''] = String(dataUri || '').split(',')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function fitWithinBox(sourceWidth, sourceHeight, maxWidth, maxHeight) {
  if (!sourceWidth || !sourceHeight) {
    return { width: maxWidth, height: maxHeight }
  }

  const widthRatio = maxWidth / sourceWidth
  const heightRatio = maxHeight / sourceHeight
  const scale = Math.min(widthRatio, heightRatio, 1)

  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  }
}

function createInitialCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(createValidationError('No pudimos abrir una imagen de identificación.', 'file'))
      nextImage.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function canvasToJpegBytes(canvas) {
  const dataUri = canvas.toDataURL('image/jpeg', 0.92)
  return dataUriToUint8Array(dataUri)
}

async function renderImageForPdf(file) {
  const image = await loadImageElement(file)
  const exifr = await loadExifr()
  const orientation = Number((await exifr.orientation(file).catch(() => 1)) || 1)
  const rotated = [5, 6, 7, 8].includes(orientation)
  const canvas = createInitialCanvas(
    rotated ? image.naturalHeight || image.height : image.naturalWidth || image.width,
    rotated ? image.naturalWidth || image.width : image.naturalHeight || image.height,
  )
  const context = canvas.getContext('2d')

  if (!context) {
    throw createValidationError('No pudimos preparar la imagen para el PDF.', 'file')
  }

  switch (orientation) {
    case 2:
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
      break
    case 3:
      context.translate(canvas.width, canvas.height)
      context.rotate(Math.PI)
      break
    case 4:
      context.translate(0, canvas.height)
      context.scale(1, -1)
      break
    case 5:
      context.rotate(0.5 * Math.PI)
      context.scale(1, -1)
      break
    case 6:
      context.translate(canvas.width, 0)
      context.rotate(0.5 * Math.PI)
      break
    case 7:
      context.translate(canvas.width, canvas.height)
      context.scale(-1, 1)
      context.rotate(0.5 * Math.PI)
      break
    case 8:
      context.translate(0, canvas.height)
      context.rotate(-0.5 * Math.PI)
      break
    default:
      break
  }

  context.drawImage(image, 0, 0)

  return {
    bytes: canvasToJpegBytes(canvas),
    width: canvas.width,
    height: canvas.height,
  }
}

async function loadPdfLib() {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib')
  }

  return pdfLibPromise
}

async function loadExifr() {
  if (!exifrPromise) {
    exifrPromise = import('exifr')
  }

  return exifrPromise
}

function getA4PageSize(imageWidth, imageHeight, pageSizes) {
  return imageWidth > imageHeight ? pageSizes.A4.slice().reverse() : pageSizes.A4
}

async function addFileToPdf(pdfDocument, file) {
  const { PDFDocument, PageSizes } = await loadPdfLib()

  if (isPdfFile(file)) {
    const sourcePdf = await PDFDocument.load(await file.arrayBuffer())
    const pageIndex = 0
    const [copiedPage] = await pdfDocument.copyPages(sourcePdf, [pageIndex])
    pdfDocument.addPage(copiedPage)
    return
  }

  const preparedImage = await renderImageForPdf(file)
  const embeddedImage = await pdfDocument.embedJpg(preparedImage.bytes)
  const [pageWidth, pageHeight] = getA4PageSize(preparedImage.width, preparedImage.height, PageSizes)
  const page = pdfDocument.addPage([pageWidth, pageHeight])
  const margin = 28
  const maxWidth = pageWidth - margin * 2
  const maxHeight = pageHeight - margin * 2
  const fitted = fitWithinBox(preparedImage.width, preparedImage.height, maxWidth, maxHeight)
  const x = (pageWidth - fitted.width) / 2
  const y = (pageHeight - fitted.height) / 2

  page.drawImage(embeddedImage, {
    x,
    y,
    width: fitted.width,
    height: fitted.height,
  })
}

export function identificationDocumentNeedsExpiration(documentType = '') {
  return !DOCUMENT_TYPES_WITH_OPTIONAL_EXPIRATION.has(String(documentType || '').trim())
}

export function validateIdentificationFile(file, label = 'archivo') {
  if (!(file instanceof File)) {
    throw createValidationError(`Falta el ${label}.`, 'file')
  }

  if (!isAllowedMimeType(file.type)) {
    throw createValidationError(
      `El ${label} debe ser JPG, PNG, WEBP o PDF.`,
      'file',
    )
  }

  if (!file.size) {
    throw createValidationError(`El ${label} esta vacio.`, 'file')
  }

  if (file.size > IDENTIFICATION_MAX_FILE_BYTES) {
    throw createValidationError(`El ${label} supera los 10 MB permitidos.`, 'file')
  }
}

export async function validateIdentificationFiles({ frontFile, backFile }) {
  validateIdentificationFile(frontFile, 'frente de la identificación')
  validateIdentificationFile(backFile, 'reverso de la identificación')

  await Promise.all([frontFile.arrayBuffer(), backFile.arrayBuffer()])
}

export function validateIdentificationForm(form = {}) {
  const documentType = trimText(form.documentType || form.identificationType || 'ine')
  const requiredFields = [
    ['name', 'Completa el nombre completo.'],
    ['phone', 'Completa el telefono.'],
    ['birthDate', 'Completa la fecha de nacimiento.'],
    ['documentNumber', 'Completa el numero de documento.'],
    ['nationality', 'Completa la nacionalidad.'],
    ['ineCurp', 'Completa la CURP.'],
  ]

  for (const [field, message] of requiredFields) {
    if (!trimText(form[field])) {
      throw createValidationError(message, field)
    }
  }

  if (!documentType) {
    throw createValidationError('Selecciona un tipo de identificación.', 'documentType')
  }

  if (identificationDocumentNeedsExpiration(documentType) && !trimText(form.documentExpiration)) {
    throw createValidationError('Completa la vigencia del documento.', 'documentExpiration')
  }
}

export async function generateIdentificationPdf({
  frontFile,
  backFile,
  fileName = `identificacion-${Date.now()}.pdf`,
}) {
  await validateIdentificationFiles({ frontFile, backFile })

  const { PDFDocument } = await loadPdfLib()
  const pdfDocument = await PDFDocument.create()
  await addFileToPdf(pdfDocument, frontFile)
  await addFileToPdf(pdfDocument, backFile)
  const bytes = await pdfDocument.save()

  if (bytes.byteLength > IDENTIFICATION_MAX_PDF_BYTES) {
    throw createValidationError('El PDF final supera los 20 MB permitidos.', 'pdf')
  }

  return new File([bytes], fileName, { type: 'application/pdf' })
}

export function buildIdentificationUploadFormData(form = {}, pdfFile, replaceDocumentId = '') {
  const formData = new FormData()
  const normalizedDocumentType = trimText(form.documentType || form.identificationType || 'ine')

  formData.append('file', pdfFile)
  formData.append('document_name', 'Identificación oficial')
  formData.append('document_type', normalizedDocumentType)
  formData.append('document_category', 'user_identification')
  formData.append('document_slot', 'official_identification')
  formData.append('full_name', trimText(form.name))
  formData.append('phone', trimText(form.phone))
  formData.append('birth_date', trimText(form.birthDate))
  formData.append('document_number', trimText(form.documentNumber))
  formData.append('nationality', trimText(form.nationality))
  formData.append('curp', trimText(form.ineCurp))
  formData.append(
    'requires_identity_validation',
    form.identityValidationRequired === false ? '0' : '1',
  )

  if (trimText(form.documentExpiration)) {
    formData.append('expires_at', trimText(form.documentExpiration))
  }

  if (trimText(replaceDocumentId)) {
    formData.append('replace_document_id', trimText(replaceDocumentId))
  }

  return formData
}

export function normalizeIdentificationUploadResponse(response = {}) {
  const document = response?.document && typeof response.document === 'object' ? response.document : response

  return {
    documentId: document.id || document.document_id || '',
    storageDisk: document.storage_disk || document.storageDisk || '',
    storagePath: document.storage_path || document.storagePath || '',
    fileUrl: document.file_url || document.fileUrl || document.url || '',
    documentUrl: document.document_url || document.documentUrl || document.url || '',
    status: 'saved',
    error: '',
  }
}

export async function uploadIdentificationDocument(apiClient, formData, endpoints = DEFAULT_UPLOAD_ENDPOINTS) {
  let lastError = null

  for (const endpoint of endpoints) {
    try {
      return normalizeIdentificationUploadResponse(await apiClient.postForm(endpoint, formData))
    } catch (error) {
      lastError = error
      if (Number(error?.status || 0) !== 404) {
        throw error
      }
    }
  }

  throw lastError || createValidationError('No encontramos un endpoint para guardar la identificación.')
}
