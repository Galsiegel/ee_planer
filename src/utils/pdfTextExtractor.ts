import * as pdfjsLib from 'pdfjs-dist';
// Vite ?url import: bundles the worker as a separate chunk
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type PdfTextItem = { str: string; transform: number[] };

export async function extractLinesFromPdf(buffer: ArrayBuffer): Promise<string[]> {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const allLines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    const yMap = new Map<number, string[]>();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const textItem = item as PdfTextItem;
      const y = Math.round(textItem.transform[5]);
      const existing = yMap.get(y);
      if (existing) existing.push(textItem.str);
      else yMap.set(y, [textItem.str]);
    }

    // PDF Y-coordinates are bottom-up; sort descending = top-to-bottom reading order
    const lines = [...yMap.keys()]
      .sort((a, b) => b - a)
      .map(y => yMap.get(y)!.join(' ').trim())
      .filter(Boolean);

    allLines.push(...lines);
  }

  return allLines;
}
