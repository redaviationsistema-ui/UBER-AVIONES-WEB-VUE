const FACE_DETECTOR_OPTIONS = {
  fastMode: false,
  maxDetectedFaces: 1,
}

const NORMALIZED_FACE_SIZE = 96
const FACE_PADDING_RATIO = 0.42
const LIVENESS_MIN_HORIZONTAL_SHIFT = 0.12
const LIVENESS_MAX_FACE_AREA_DELTA = 0.38
const DEFAULT_TIMEOUT_MS = 7000
const DETECTION_INTERVAL_MS = 180
const MATCH_THRESHOLD = 62

let faceDetectorPromise = null

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function getFaceDetector() {
  if (typeof window === 'undefined' || !('FaceDetector' in window)) {
    return null
  }

  if (!faceDetectorPromise) {
    faceDetectorPromise = Promise.resolve().then(() => new window.FaceDetector(FACE_DETECTOR_OPTIONS))
  }

  try {
    return await faceDetectorPromise
  } catch {
    faceDetectorPromise = null
    return null
  }
}

async function detectLargestFace(source) {
  const detector = await getFaceDetector()
  if (!detector) {
    throw new Error(
      'Tu navegador no soporta deteccion facial nativa. Usa Chrome o Edge reciente para completar la validacion.',
    )
  }

  const faces = await detector.detect(source)
  if (!Array.isArray(faces) || !faces.length) {
    return null
  }

  return faces
    .slice()
    .sort((faceA, faceB) => faceB.boundingBox.width * faceB.boundingBox.height - faceA.boundingBox.width * faceA.boundingBox.height)[0]
}

function normalizeFaceBox(sourceWidth, sourceHeight, boundingBox) {
  const paddedWidth = boundingBox.width * (1 + FACE_PADDING_RATIO)
  const paddedHeight = boundingBox.height * (1 + FACE_PADDING_RATIO)
  const centerX = boundingBox.x + boundingBox.width / 2
  const centerY = boundingBox.y + boundingBox.height / 2
  const size = Math.max(paddedWidth, paddedHeight)

  return {
    x: clamp(centerX - size / 2, 0, sourceWidth),
    y: clamp(centerY - size / 2, 0, sourceHeight),
    width: clamp(size, 1, sourceWidth),
    height: clamp(size, 1, sourceHeight),
  }
}

function cropFaceToCanvas(source, boundingBox) {
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height
  const normalizedBox = normalizeFaceBox(sourceWidth, sourceHeight, boundingBox)
  const safeWidth = Math.min(normalizedBox.width, sourceWidth - normalizedBox.x)
  const safeHeight = Math.min(normalizedBox.height, sourceHeight - normalizedBox.y)
  const canvas = document.createElement('canvas')

  canvas.width = NORMALIZED_FACE_SIZE
  canvas.height = NORMALIZED_FACE_SIZE

  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(
    source,
    normalizedBox.x,
    normalizedBox.y,
    safeWidth,
    safeHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return canvas
}

function buildAverageHash(canvas, hashSize = 12) {
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = hashSize
  sampleCanvas.height = hashSize

  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
  sampleContext.drawImage(canvas, 0, 0, hashSize, hashSize)

  const { data } = sampleContext.getImageData(0, 0, hashSize, hashSize)
  const grayscale = []
  let total = 0

  for (let index = 0; index < data.length; index += 4) {
    const value = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    grayscale.push(value)
    total += value
  }

  const average = total / grayscale.length
  return grayscale.map((value) => (value >= average ? '1' : '0')).join('')
}

function buildHistogram(canvas, bins = 16) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const histogram = new Array(bins).fill(0)

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const bucket = Math.min(bins - 1, Math.floor((grayscale / 256) * bins))
    histogram[bucket] += 1
  }

  const total = histogram.reduce((sum, value) => sum + value, 0) || 1
  return histogram.map((value) => value / total)
}

function hammingSimilarity(hashA = '', hashB = '') {
  if (!hashA || !hashB || hashA.length !== hashB.length) return 0

  let matches = 0
  for (let index = 0; index < hashA.length; index += 1) {
    if (hashA[index] === hashB[index]) matches += 1
  }

  return matches / hashA.length
}

function histogramSimilarity(histogramA = [], histogramB = []) {
  if (!histogramA.length || histogramA.length !== histogramB.length) return 0

  const distance = histogramA.reduce(
    (sum, value, index) => sum + Math.abs(value - histogramB[index]),
    0,
  )

  return 1 - distance / 2
}

function scoreFaceMatch(faceCanvasA, faceCanvasB) {
  const hashSimilarity = hammingSimilarity(buildAverageHash(faceCanvasA), buildAverageHash(faceCanvasB))
  const toneSimilarity = histogramSimilarity(buildHistogram(faceCanvasA), buildHistogram(faceCanvasB))
  return Math.round((hashSimilarity * 0.72 + toneSimilarity * 0.28) * 100)
}

async function createImageBitmapFromFile(file) {
  return createImageBitmap(file)
}

async function findFaceOrThrow(source, errorMessage) {
  const face = await detectLargestFace(source)
  if (!face?.boundingBox) {
    throw new Error(errorMessage)
  }

  return face
}

function extractFaceMetrics(face) {
  const area = face.boundingBox.width * face.boundingBox.height
  return {
    area,
    centerX: face.boundingBox.x + face.boundingBox.width / 2,
  }
}

async function waitForChallengeFace(videoElement, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const face = await detectLargestFace(videoElement)

    if (face?.boundingBox && predicate(face)) {
      return face
    }

    await sleep(DETECTION_INTERVAL_MS)
  }

  return null
}

export async function isFaceDetectionSupported() {
  return Boolean(await getFaceDetector())
}

export async function runLivenessCheck(videoElement) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    throw new Error('La camara aun no esta lista. Espera un momento y vuelve a intentar.')
  }

  const frontalFace = await waitForChallengeFace(
    videoElement,
    (face) => {
      const { centerX } = extractFaceMetrics(face)
      const relativeCenterX = centerX / videoElement.videoWidth
      return relativeCenterX > 0.35 && relativeCenterX < 0.65
    },
    DEFAULT_TIMEOUT_MS,
  )

  if (!frontalFace) {
    throw new Error('No detectamos tu rostro de frente. Mejora la luz y coloca tu cara al centro.')
  }

  const frontalMetrics = extractFaceMetrics(frontalFace)
  const movementFace = await waitForChallengeFace(
    videoElement,
    (face) => {
      const metrics = extractFaceMetrics(face)
      const horizontalShift = Math.abs(metrics.centerX - frontalMetrics.centerX) / videoElement.videoWidth
      const faceAreaDelta = Math.abs(metrics.area - frontalMetrics.area) / frontalMetrics.area

      return (
        horizontalShift >= LIVENESS_MIN_HORIZONTAL_SHIFT &&
        faceAreaDelta <= LIVENESS_MAX_FACE_AREA_DELTA
      )
    },
    DEFAULT_TIMEOUT_MS,
  )

  if (!movementFace) {
    throw new Error(
      'No vimos el movimiento de validacion. Gira ligeramente el rostro a un lado y mantente dentro del encuadre.',
    )
  }

  const movementMetrics = extractFaceMetrics(movementFace)
  const livenessScore = Math.round(
    clamp(
      (Math.abs(movementMetrics.centerX - frontalMetrics.centerX) / videoElement.videoWidth) * 380,
      0,
      100,
    ),
  )

  return {
    livenessScore: Math.max(livenessScore, 65),
    frontalFace,
    movementFace,
  }
}

export function captureVideoFrame(videoElement) {
  const canvas = document.createElement('canvas')
  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
  return canvas
}

export async function canvasToFile(canvas, fileName = 'selfie-validacion.jpg') {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) {
    throw new Error('No pudimos capturar la selfie desde la camara.')
  }

  return new File([blob], fileName, { type: 'image/jpeg' })
}

async function blobToImageBitmap(blob) {
  return createImageBitmap(blob)
}

async function blobToCanvas(blob) {
  const bitmap = await blobToImageBitmap(blob)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bitmap.close?.()
  }
}

export async function captureBestSelfie({ videoElement, stream, fileName = 'selfie-validacion.jpg' }) {
  const videoTrack = stream?.getVideoTracks?.()?.[0] || null

  if (videoTrack && typeof window !== 'undefined' && 'ImageCapture' in window) {
    try {
      const imageCapture = new window.ImageCapture(videoTrack)
      const photoBlob = await imageCapture.takePhoto()
      const canvas = await blobToCanvas(photoBlob)
      return {
        canvas,
        file: new File([photoBlob], fileName, { type: photoBlob.type || 'image/jpeg' }),
        previewUrl: URL.createObjectURL(photoBlob),
        previewKind: 'object-url',
      }
    } catch {
      // Fallback to the current video frame if the device/browser rejects still capture.
    }
  }

  const canvas = captureVideoFrame(videoElement)
  const file = await canvasToFile(canvas, fileName)
  return {
    canvas,
    file,
    previewUrl: canvas.toDataURL('image/jpeg', 0.92),
    previewKind: 'data-url',
  }
}

export async function compareDocumentAgainstSelfie({ documentFile, selfieFile }) {
  const [documentBitmap, selfieBitmap] = await Promise.all([
    createImageBitmapFromFile(documentFile),
    createImageBitmapFromFile(selfieFile),
  ])

  try {
    const documentFace = await findFaceOrThrow(
      documentBitmap,
      'No encontramos un rostro claro en la foto frontal de la identificacion. Sube una imagen mas nitida.',
    )
    const selfieFace = await findFaceOrThrow(
      selfieBitmap,
      'No encontramos un rostro claro en la selfie. Intenta otra captura con mejor luz.',
    )

    const documentFaceCanvas = cropFaceToCanvas(documentBitmap, documentFace.boundingBox)
    const selfieFaceCanvas = cropFaceToCanvas(selfieBitmap, selfieFace.boundingBox)
    const similarityScore = scoreFaceMatch(documentFaceCanvas, selfieFaceCanvas)

    return {
      matched: similarityScore >= MATCH_THRESHOLD,
      similarityScore,
    }
  } finally {
    documentBitmap.close?.()
    selfieBitmap.close?.()
  }
}
