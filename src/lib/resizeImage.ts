/** Max dimension (width or height) after resize — enough for sharp display, smaller payloads for DB. */
const DEFAULT_MAX_EDGE = 1200
const DEFAULT_JPEG_QUALITY = 0.88
/** Reject huge originals before decode to avoid browser memory issues. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not decode image'))
    }
    img.src = url
  })
}

/**
 * Downscale a photo to fit inside a square of `maxEdge` px, then encode as JPEG.
 * Preserves aspect ratio. Use for merchandise uploads so cards and storage stay reasonable.
 */
export async function resizeImageFileToJpegDataUrl(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image file')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image is too large before resizing (max 25MB).')
  }

  const maxEdge = opts?.maxEdge ?? DEFAULT_MAX_EDGE
  const quality = opts?.quality ?? DEFAULT_JPEG_QUALITY

  const img = await loadImageFromFile(file)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w === 0 || h === 0) {
    throw new Error('Invalid image dimensions')
  }

  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const dw = Math.round(w * scale)
  const dh = Math.round(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas not available')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, dw, dh)
  ctx.drawImage(img, 0, 0, dw, dh)

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  if (!dataUrl.startsWith('data:image/jpeg')) {
    throw new Error('Could not encode image')
  }
  return dataUrl
}
