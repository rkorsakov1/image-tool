const toPng = async (blob: Blob): Promise<Blob> => {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available.');
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('PNG conversion failed.'))), 'image/png'),
    );
  } finally {
    bitmap.close();
  }
};

export const canCopyImages = (): boolean => typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);

/**
 * Copies the image as PNG — the only image type browsers reliably accept in ClipboardItem.
 * The ClipboardItem gets a promise so Safari still sees the write as part of the click.
 */
export const copyImageToClipboard = async (blob: Blob): Promise<void> => {
  if (!canCopyImages()) throw new Error("This browser can't copy images to the clipboard.");
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(blob) })]);
};
