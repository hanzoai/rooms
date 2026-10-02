// A picked image, turned into the thing IAM stores.
//
// The server states the contract and states that this side exists:
// `pkg/schema/avatar.go` accepts an `https` link or an inline `data:` URL of a
// raster format, bounded at 96 KiB — "which is what a crop performed in a
// browser produces". Nothing performed it. The profile page drew an upload
// button with no handler, so the sentence described a step no code took.
//
// SQUARE, BECAUSE EVERY READER DRAWS IT ROUND. A portrait handed over whole is
// cropped by whichever avatar happens to render it, and the person who chose
// the picture is not the one choosing what survives. Cropping here means the
// centre they framed is the centre stored.
//
// The bound is met by LOWERING QUALITY, not by refusing. A 4 MB photograph is
// the normal thing to pick, and answering it with "too large" hands somebody an
// image editor as homework; 256px at falling quality reaches the limit in two
// or three steps and looks like what they chose.

/** Longest reference IAM stores — `schema.AvatarLimit`, restated because it is
 *  the far side of a wire. A write over it is refused there, so it is checked
 *  here where a smaller encode is still possible. */
export const LIMIT = 96 << 10

/** Side of the stored square. The limit was sized for this. */
const SIDE = 256

/** Tried in order until one fits. Below the last, the picture is not worth keeping. */
const QUALITY = [0.9, 0.75, 0.6, 0.45, 0.3]

/** JPEG: every browser encodes it, and a photograph is what this holds. PNG at
 *  256² is routinely over the limit for the same picture. */
const KIND = 'image/jpeg'

/**
 * A file the reader picked, as a data URL ready to store.
 *
 * Throws where the file is not an image the browser can decode, or where even
 * the lowest quality is over the limit — both are things the caller must say
 * out loud rather than swallow, because the alternative is a picture that
 * silently did not change.
 */
export async function mark(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file.')
  }

  const source = await decode(file)
  const canvas = document.createElement('canvas')
  canvas.width = SIDE
  canvas.height = SIDE

  const ink = canvas.getContext('2d')
  if (!ink) throw new Error('This browser cannot crop images.')

  // The centre square of whatever was handed over, scaled to fill.
  const edge = Math.min(source.width, source.height)
  ink.drawImage(
    source,
    (source.width - edge) / 2,
    (source.height - edge) / 2,
    edge,
    edge,
    0,
    0,
    SIDE,
    SIDE,
  )
  if ('close' in source) source.close()

  for (const quality of QUALITY) {
    const url = canvas.toDataURL(KIND, quality)
    if (url.length <= LIMIT) return url
  }
  throw new Error('That image will not fit. Try a simpler one.')
}

/** `createImageBitmap` where it exists — it decodes off the main thread and
 *  honours EXIF orientation, so a photo taken sideways is stored upright. The
 *  `<img>` path is the fallback, and Safari below 17 is why there is one. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through: a decoder that refuses the bytes may still be an image
      // the element can read.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((ok, no) => {
      const img = new Image()
      img.onload = () => ok(img)
      img.onerror = () => no(new Error('That file is not an image this browser reads.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
