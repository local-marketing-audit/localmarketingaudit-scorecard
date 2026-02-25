/**
 * Font width tables extracted from the Dominance Playbook PDF template.
 * Each font uses WinAnsiEncoding. Widths are in 1/1000 em-units.
 */

export interface FontMetrics {
  widths: number[];
  firstChar: number;
  lastChar: number;
  defaultWidth: number;
}

/** Page width in PDF points (US Letter). */
export const PAGE_WIDTH = 595.275;

/**
 * Width tables keyed by base font name (without the subset prefix).
 * Extracted from the template PDF's font dictionaries.
 */
export const FONT_METRICS: Record<string, FontMetrics> = {
  'Roboto-Bold': {
    firstChar: 32,
    lastChar: 125,
    defaultWidth: 500,
    widths: [
      249, 0, 0, 0, 0, 0, 656, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      574, 574, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 673, 638, 654, 650, 0, 548, 0, 0, 0, 0, 0, 542, 876, 706, 690,
      645, 0, 638, 615, 619, 658, 654, 875, 0, 618, 0, 0, 0, 0, 0, 446,
      0, 536, 563, 521, 0, 541, 358, 571, 560, 265, 0, 534, 265, 866, 560, 565,
      563, 0, 365, 514, 338, 560, 505, 0, 509, 502, 0, 330, 0, 330,
    ],
  },
  'Roboto-Regular': {
    firstChar: 32,
    lastChar: 125,
    defaultWidth: 500,
    widths: [
      248, 0, 0, 0, 0, 0, 0, 174, 342, 348, 0, 0, 196, 276, 263, 412,
      562, 562, 562, 0, 0, 562, 562, 0, 0, 0, 242, 0, 0, 0, 0, 0,
      0, 652, 623, 651, 656, 0, 553, 0, 0, 272, 0, 0, 538, 873, 713, 0,
      631, 0, 0, 593, 597, 0, 0, 0, 0, 0, 265, 0, 265, 0, 451, 0,
      544, 561, 523, 564, 530, 347, 561, 551, 243, 0, 507, 243, 876, 552, 570,
      561, 0, 338, 516, 327, 551, 484, 751, 496, 473, 0, 338, 0, 338,
    ],
  },
  'Roboto-Medium': {
    firstChar: 32,
    lastChar: 125,
    defaultWidth: 500,
    widths: [
      249, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 549, 0, 0, 0, 0, 0, 0, 875, 710, 0,
      0, 0, 0, 604, 0, 652, 0, 0, 0, 0, 0, 0, 0, 0, 0, 451,
      0, 541, 0, 523, 0, 537, 0, 567, 0, 0, 0, 522, 255, 870, 556, 569,
      0, 0, 352, 0, 333, 556, 0, 0, 0, 487, 0, 335, 0, 335,
    ],
  },
  'Archivo-ExtraBold': {
    firstChar: 32,
    lastChar: 125,
    defaultWidth: 500,
    widths: [
      189, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 746, 745, 752, 755, 0, 0, 0, 787, 0, 0, 0, 623, 914, 787, 0,
      698, 0, 750, 697, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 534,
      0, 616, 0, 612, 0, 619, 0, 632, 629, 288, 0, 610, 288, 937, 629, 635,
      633, 0, 407, 579, 385, 629, 574, 859, 0, 574, 0, 391, 0, 391,
    ],
  },
  'Archivo-Bold': {
    firstChar: 32,
    lastChar: 121,
    defaultWidth: 500,
    widths: [
      196, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      595, 0, 596, 596, 0, 595, 596, 596, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 724, 722, 0, 739, 0, 622, 802, 0, 0, 0, 0, 0, 0, 0, 793,
      681, 0, 0, 679, 0, 0, 0, 0, 0, 699, 0, 0, 0, 0, 0, 0,
      580, 608, 573, 608, 584, 0, 607, 602, 267, 0, 570, 267, 891, 602, 613,
      608, 0, 380, 556, 342, 601, 547, 798, 0, 547,
    ],
  },
};

/**
 * Calculate the width of a string in PDF points for a given font and size.
 */
export function calculateTextWidth(
  text: string,
  fontName: string,
  fontSize: number,
): number {
  const metrics = FONT_METRICS[fontName];
  if (!metrics) return text.length * 0.5 * fontSize; // rough fallback

  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const idx = code - metrics.firstChar;
    const w =
      idx >= 0 && idx < metrics.widths.length && metrics.widths[idx] !== 0
        ? metrics.widths[idx]
        : metrics.defaultWidth;
    total += w;
  }
  return (total / 1000) * fontSize;
}

/**
 * Word-wrap text into lines that each fit within `maxWidthPt` points.
 * Returns an array of line strings.
 */
export function wrapText(
  text: string,
  fontName: string,
  fontSize: number,
  maxWidthPt: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const width = calculateTextWidth(candidate, fontName, fontSize);

    if (width > maxWidthPt && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
