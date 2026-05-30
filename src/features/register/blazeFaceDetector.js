import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import * as blazeface from '@tensorflow-models/blazeface'

let detectorPromise = null
let backendPromise = null

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readPoint(value) {
  if (Array.isArray(value)) {
    return [toFiniteNumber(value[0]), toFiniteNumber(value[1])]
  }

  if (value && typeof value === 'object') {
    return [toFiniteNumber(value.x), toFiniteNumber(value.y)]
  }

  return [0, 0]
}

function normalizePrediction(prediction) {
  if (!prediction) return null

  const [left, top] = readPoint(prediction.topLeft)
  const [right, bottom] = readPoint(prediction.bottomRight)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)
  const probability = Array.isArray(prediction.probability)
    ? toFiniteNumber(prediction.probability[0], 0.9)
    : toFiniteNumber(prediction.probability, 0.9)

  if (!width || !height) return null

  return {
    confidence: probability,
    score: probability,
    landmarks: Array.isArray(prediction.landmarks) ? prediction.landmarks : [],
    boundingBox: {
      x: left,
      y: top,
      width,
      height,
    },
  }
}

function getDetectionArea(detection = {}) {
  const box = detection?.boundingBox
  if (!box) return 0
  return toFiniteNumber(box.width) * toFiniteNumber(box.height)
}

async function ensureTfBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const currentBackend = typeof tf.getBackend === 'function' ? tf.getBackend() : ''
      if (currentBackend) {
        await tf.ready()
        return currentBackend
      }

      try {
        await tf.setBackend('webgl')
      } catch {
        await tf.setBackend('cpu')
      }

      await tf.ready()
      return tf.getBackend()
    })().catch((error) => {
      backendPromise = null
      throw new Error(error?.message || 'No fue posible preparar el backend de TensorFlow.js.')
    })
  }

  return backendPromise
}

export async function getBlazeFaceDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await ensureTfBackend()

      return blazeface.load({
        maxFaces: 1,
        inputWidth: 128,
        inputHeight: 128,
        iouThreshold: 0.3,
        scoreThreshold: 0.3,
      })
    })().catch((error) => {
      detectorPromise = null
      throw new Error(error?.message || 'No fue posible cargar BlazeFace.')
    })
  }

  return detectorPromise
}

async function estimateFace(source, detector) {
  if (!source || !detector) return null

  const predictions = await detector.estimateFaces(source, false)
  const normalized = Array.isArray(predictions)
    ? predictions.map(normalizePrediction).filter(Boolean)
    : []

  return normalized.sort((left, right) => getDetectionArea(right) - getDetectionArea(left))[0] || null
}

export async function detectFaceInVideo(videoElement, detector) {
  if (
    !videoElement ||
    videoElement.readyState < 2 ||
    !videoElement.videoWidth ||
    !videoElement.videoHeight
  ) {
    return null
  }

  return estimateFace(videoElement, detector)
}

export async function detectFaceInImage(imageSource, detector) {
  if (!imageSource) return null
  return estimateFace(imageSource, detector)
}

export function getNormalizedBoundingBox(detection = {}) {
  const box = detection?.boundingBox || {}

  return {
    x: toFiniteNumber(box.x),
    y: toFiniteNumber(box.y),
    width: Math.max(0, toFiniteNumber(box.width)),
    height: Math.max(0, toFiniteNumber(box.height)),
  }
}
