export type CoverCrop = { srcX: number; srcY: number; srcW: number; srcH: number };

/**
 * The source rectangle of a `vW x vH` video that is actually visible inside a
 * `boxW x boxH` element using `object-fit: cover` (centred).
 */
export function coverCrop(vW: number, vH: number, boxW: number, boxH: number): CoverCrop {
  const scale = Math.max(boxW / vW, boxH / vH);
  const srcW = boxW / scale;
  const srcH = boxH / scale;
  return { srcX: (vW - srcW) / 2, srcY: (vH - srcH) / 2, srcW, srcH };
}

/** Maps a normalized full-frame landmark (0..1) to pixels on an `outW x outH`
 *  canvas that shows only `crop` of the frame. */
export function makeProjection(
  crop: CoverCrop,
  vW: number,
  vH: number,
  outW: number,
  outH: number,
): (nx: number, ny: number) => [number, number] {
  return (nx, ny) => [
    ((nx * vW - crop.srcX) / crop.srcW) * outW,
    ((ny * vH - crop.srcY) / crop.srcH) * outH,
  ];
}
