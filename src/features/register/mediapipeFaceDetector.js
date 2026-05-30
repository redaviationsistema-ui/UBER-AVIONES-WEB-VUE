const MEDIAPIPE_VERSION = '0.10.15'
const MEDIAPIPE_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`
const MEDIAPIPE_WASM_ROOT =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MEDIAPIPE_FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

let modulePromise = null
let detectorPromise = null
let nativeDetectorPromise = null

function isInternalFrameReadError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Cannot read properties of undefined') ||
    message.includes("reading 'h'") ||
    message.includes('reading "h"') ||
    message.includes("reading 'w'") ||
    message.includes('reading "w"') ||
    message.includes("reading 'x'") ||
    message.includes('reading "x"') ||
    message.includes("reading 'y'") ||
    message.includes('reading "y"') ||
    message.includes("reading 'u'") ||
    message.includes('reading "u"')
  )
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBoundingBox(detection = {}) {
  const rawBox = detection?.boundingBox || detection?.bounding_box || detection?.box || null
  if (!rawBox || typeof rawBox !== 'object') {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const inferredWidth =
    rawBox.right != null && rawBox.left != null ? rawBox.right - rawBox.left : undefined
  const inferredHeight =
    rawBox.bottom != null && rawBox.top != null ? rawBox.bottom - rawBox.top : undefined

  const width = toFiniteNumber(
    rawBox.width ?? rawBox.w ?? inferredWidth,
  )
  const height = toFiniteNumber(
    rawBox.height ?? rawBox.h ?? inferredHeight,
  )

  return {
    x: toFiniteNumber(rawBox.x ?? rawBox.left ?? rawBox.originX),
    y: toFiniteNumber(rawBox.y ?? rawBox.top ?? rawBox.originY),
    width: Math.max(0, width),
    height: Math.max(0, height),
  }
}

export function getNormalizedBoundingBox(detection = {}) {
  return normalizeBoundingBox(detection)
}

function getDetectionArea(detection) {
  const box = normalizeBoundingBox(detection)
  return box.width * box.height
}

async function getNativeFaceDetector() {
  if (typeof window === 'undefined' || !('FaceDetector' in window)) {
    return null
  }

  if (!nativeDetectorPromise) {
    nativeDetectorPromise = Promise.resolve().then(
      () =>
        new window.FaceDetector({
          fastMode: true,
          maxDetectedFaces: 1,
        }),
    )
  }

  try {
    return await nativeDetectorPromise
  } catch {
    nativeDetectorPromise = null
    return null
  }
}

async function detectWithNative(source) {
  const nativeDetector = await getNativeFaceDetector()
  if (!nativeDetector) return null

  try {
    const faces = await nativeDetector.detect(source)
    const detections = Array.isArray(faces) ? faces.filter(Boolean) : []
    return (
      detections
        .slice()
        .sort((left, right) => getDetectionArea(right) - getDetectionArea(left))[0] || null
    )
  } catch {
    return null
  }
}

async function loadMediaPipeModule() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ MEDIAPIPE_MODULE_URL)
      .then((module) => {
        const FilesetResolver = module.FilesetResolver
        const FaceLandmarker = module.FaceLandmarker

        if (!FilesetResolver || !FaceLandmarker) {
          throw new Error('MediaPipe cargo, pero no expuso las APIs de deteccion facial esperadas.')
        }

        return { FilesetResolver, FaceLandmarker }
      })
      .catch((error) => {
        modulePromise = null
        throw new Error(error?.message || 'No fue posible cargar MediaPipe.')
      })
  }

  return modulePromise
}

export async function getMediaPipeFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await loadMediaPipeModule()
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT)

      const detector = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_FACE_MODEL_URL,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.35,
        minFacePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      })

      await detector.setOptions({ runningMode: 'VIDEO' })
      return detector
    })().catch((error) => {
      detectorPromise = null
      throw error
    })
  }

  return detectorPromise
}

function buildDetectionFromLandmarks(result, width, height) {
  const firstFace = Array.isArray(result?.faceLandmarks) ? result.faceLandmarks[0] : null
  if (!Array.isArray(firstFace) || !firstFace.length) {
    return null
  }

  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0

  for (const point of firstFace) {
    if (!point) continue
    minX = Math.min(minX, Number(point.x ?? 1))
    minY = Math.min(minY, Number(point.y ?? 1))
    maxX = Math.max(maxX, Number(point.x ?? 0))
    maxY = Math.max(maxY, Number(point.y ?? 0))
  }

  const normalizedWidth = Math.max(0, maxX - minX)
  const normalizedHeight = Math.max(0, maxY - minY)
  if (!normalizedWidth || !normalizedHeight) {
    return null
  }

  return {
    confidence: 0.9,
    score: 0.9,
    boundingBox: {
      x: minX * width,
      y: minY * height,
      width: normalizedWidth * width,
      height: normalizedHeight * height,
    },
  }
}

export async function detectFaceInVideo(videoElement, detector, timestamp = performance.now()) {
  if (
    !videoElement ||
    videoElement.readyState < 2 ||
    !videoElement.videoWidth ||
    !videoElement.videoHeight
  ) {
    return null
  }

  const nativeDetection = await detectWithNative(videoElement)
  if (nativeDetection) {
    return {
      ...nativeDetection,
      confidence: 0.99,
      score: 0.99,
    }
  }

  let result

  try {
    result = detector.detectForVideo(videoElement, timestamp)
  } catch (error) {
    if (String(error?.message || '').includes("runningMode")) {
      await detector.setOptions({ runningMode: 'VIDEO' })
      result = detector.detectForVideo(videoElement, timestamp)
    } else if (isInternalFrameReadError(error)) {
      return null
    } else {
      throw error
    }
  }

  return buildDetectionFromLandmarks(result, videoElement.videoWidth, videoElement.videoHeight)
}

export async function detectFaceInImage(imageSource, detector) {
  if (!imageSource) {
    return null
  }

  const nativeDetection = await detectWithNative(imageSource)
  if (nativeDetection) {
    return {
      ...nativeDetection,
      confidence: 0.99,
      score: 0.99,
    }
  }

  let result

  try {
    await detector.setOptions({ runningMode: 'IMAGE' })
    result = detector.detect(imageSource)
  } catch (error) {
    if (isInternalFrameReadError(error)) {
      return null
    }

    throw error
  } finally {
    try {
      await detector.setOptions({ runningMode: 'VIDEO' })
    } catch {
      // Keep the detector usable even if switching back fails temporarily.
    }
  }

  const width = imageSource.width || imageSource.videoWidth || imageSource.naturalWidth || 0
  const height = imageSource.height || imageSource.videoHeight || imageSource.naturalHeight || 0
  return buildDetectionFromLandmarks(result, width, height)
}
