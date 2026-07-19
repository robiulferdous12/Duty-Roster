import html2canvas from 'html2canvas-pro';

/**
 * Captures a DOM element exactly as rendered (colors, cell sizes, text sizes)
 * and downloads it as a PNG image.
 *
 * Uses html2canvas-pro (not the base html2canvas) because Tailwind CSS v4
 * renders colors using the modern oklch()/color-mix() CSS functions, which
 * the original html2canvas cannot parse and throws on.
 */
export async function exportElementAsImage(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2, // retina-quality output
    useCORS: true,
  });

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate image blob.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}
