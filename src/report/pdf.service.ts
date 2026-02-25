import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFDict, PDFName, PDFFont, PDFString, PDFArray, cmyk, grayscale } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { inflateSync } from 'zlib';
import type { PillarScores, PillarKey, TierKey } from '../common/types/scoring';
import { pillars } from '../common/config/pillars';
import { tiers } from '../common/config/tiers';

export interface PdfData {
  businessName: string;
  city: string;
  totalScore: number;
  tier: TierKey;
  pillarScores: PillarScores;
}

/** Page width in PDF points (US Letter). */
const PAGE_WIDTH = 595.275;

/** All placeholder keys. */
const ALL_PLACEHOLDERS = [
  '{{Business_Name}}',
  '{{City_or_Service_Area}}',
  '{{Report_Date}}',
  '{{Total_Score}}',
  '{{Segment_Name}}',
  '{{Segment_One_Liner}}',
  '{{Visibility_Score}}',
  '{{Conversion_Score}}',
  '{{Reputation_Score}}',
  '{{Marketing_Score}}',
  '{{Tracking_Score}}',
  '{{Lowest_Pillar_Name}}',
  '{{Lowest_Pillar_Impact_Statement}}',
  '{{Segment_Description_Block}}',
  '{{Primary_Focus_Area}}',
];

type FontKey =
  | 'robotoRegular'
  | 'robotoBold'
  | 'robotoMedium'
  | 'archivoBold'
  | 'archivoExtraBold';

interface PlaceholderConfig {
  fontKey: FontKey;
  centered: boolean;
  multiline: boolean;
  maxWidth: number;
  lineHeight: number;
}

/**
 * Per-placeholder rendering config.
 * Font, centering, and multi-line wrapping settings.
 */
const PLACEHOLDER_CONFIG: Record<string, PlaceholderConfig> = {
  '{{Business_Name}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{City_or_Service_Area}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Report_Date}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Total_Score}}': { fontKey: 'robotoBold', centered: true, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_Name}}': { fontKey: 'robotoMedium', centered: true, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Segment_One_Liner}}': { fontKey: 'robotoBold', centered: true, multiline: true, maxWidth: 450, lineHeight: 1.2 },
  '{{Visibility_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Conversion_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Reputation_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Marketing_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Tracking_Score}}': { fontKey: 'robotoBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Lowest_Pillar_Name}}': { fontKey: 'archivoExtraBold', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
  '{{Lowest_Pillar_Impact_Statement}}': { fontKey: 'robotoRegular', centered: true, multiline: true, maxWidth: 450, lineHeight: 1.3 },
  '{{Segment_Description_Block}}': { fontKey: 'robotoRegular', centered: false, multiline: true, maxWidth: 380, lineHeight: 1.35 },
  '{{Primary_Focus_Area}}': { fontKey: 'robotoRegular', centered: false, multiline: false, maxWidth: 0, lineHeight: 0 },
};

/** Recorded position of a placeholder found in a content stream. */
interface PlaceholderPosition {
  key: string;
  pageIndex: number;
  x: number;
  y: number;
  fontSize: number;
  fontKey: FontKey;
  color: { c: number; m: number; y: number; k: number } | { gray: number };
  suffix: string;
}

/** Map a BaseFont name (with subset prefix) to a FontKey. */
function baseFontToKey(name: string): FontKey | null {
  if (name.includes('Roboto-Medium')) return 'robotoMedium';
  if (name.includes('Roboto-Bold')) return 'robotoBold';
  if (name.includes('Roboto-Regular')) return 'robotoRegular';
  if (name.includes('Archivo-ExtraBold')) return 'archivoExtraBold';
  if (name.includes('Archivo-Bold')) return 'archivoBold';
  return null;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private templateCache: Buffer | null = null;
  private fontCache: Record<string, Buffer> | null = null;

  constructor() {}

  private async getTemplate(): Promise<Buffer> {
    if (!this.templateCache) {
      const templatePath = join(__dirname, 'templates/dominance-playbook.pdf');
      this.templateCache = await readFile(templatePath);
      this.logger.log(`PDF template cached (${(this.templateCache.length / 1024 / 1024).toFixed(2)} MB)`);
    }
    return this.templateCache;
  }

  private async getFontBuffers(): Promise<Record<string, Buffer>> {
    if (!this.fontCache) {
      const fontsDir = join(__dirname, 'fonts');
      const [robotoRegular, robotoBold, robotoMedium, archivoBold, archivoExtraBold] =
        await Promise.all([
          readFile(join(fontsDir, 'Roboto-Regular.ttf')),
          readFile(join(fontsDir, 'Roboto-Bold.ttf')),
          readFile(join(fontsDir, 'Roboto-Medium.ttf')),
          readFile(join(fontsDir, 'Archivo-Bold.ttf')),
          readFile(join(fontsDir, 'Archivo-ExtraBold.ttf')),
        ]);
      this.fontCache = { robotoRegular, robotoBold, robotoMedium, archivoBold, archivoExtraBold };
      this.logger.log('Font files cached');
    }
    return this.fontCache;
  }

  /**
   * Generate a Dominance Playbook PDF by:
   * 1. Blanking all placeholder text in the template's content streams
   * 2. Drawing replacement text on each page using embedded full fonts
   */
  async generatePdfBuffer(data: PdfData): Promise<Buffer> {
    const templateBytes = await this.getTemplate();
    const fontBuffers = await this.getFontBuffers();

    const tierData = tiers[data.tier];
    const lowestPillar = this.getLowestPillar(data.pillarScores);

    const replacements: Record<string, string> = {
      '{{Business_Name}}': data.businessName,
      '{{City_or_Service_Area}}': data.city,
      '{{Report_Date}}': this.formatDate(new Date()),
      '{{Total_Score}}': String(data.totalScore),
      '{{Segment_Name}}': tierData.name,
      '{{Segment_One_Liner}}': tierData.summary,
      '{{Visibility_Score}}': `${data.pillarScores.visibility}/20`,
      '{{Conversion_Score}}': `${data.pillarScores.conversion}/20`,
      '{{Reputation_Score}}': `${data.pillarScores.reputation}/20`,
      '{{Marketing_Score}}': `${data.pillarScores.marketing}/20`,
      '{{Tracking_Score}}': `${data.pillarScores.tracking}/20`,
      '{{Lowest_Pillar_Name}}': pillars[lowestPillar].name,
      '{{Lowest_Pillar_Impact_Statement}}': pillars[lowestPillar].impactStatement,
      '{{Segment_Description_Block}}': tierData.descriptionBlock,
      '{{Primary_Focus_Area}}': pillars[lowestPillar].name,
    };

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    // Embed full fonts
    const fonts: Record<FontKey, PDFFont> = {
      robotoRegular: await pdfDoc.embedFont(fontBuffers.robotoRegular),
      robotoBold: await pdfDoc.embedFont(fontBuffers.robotoBold),
      robotoMedium: await pdfDoc.embedFont(fontBuffers.robotoMedium),
      archivoBold: await pdfDoc.embedFont(fontBuffers.archivoBold),
      archivoExtraBold: await pdfDoc.embedFont(fontBuffers.archivoExtraBold),
    };

    // Build content-stream-ref → page-index map
    const pages = pdfDoc.getPages();
    const refToPageIdx = new Map<string, number>();
    for (let i = 0; i < pages.length; i++) {
      const contentsRef = pages[i].node.get(PDFName.of('Contents'));
      if (contentsRef) refToPageIdx.set(contentsRef.toString(), i);
    }

    // Build per-page TT-name → FontKey mappings from resource dictionaries
    const pageFontMaps: Map<number, Record<string, FontKey>> = new Map();
    for (let i = 0; i < pages.length; i++) {
      const mapping: Record<string, FontKey> = {};
      const resources = pages[i].node.get(PDFName.of('Resources'));
      if (resources) {
        const resDict = pdfDoc.context.lookupMaybe(resources, PDFDict);
        if (resDict) {
          const fontRef = resDict.get(PDFName.of('Font'));
          if (fontRef) {
            const fontDict = pdfDoc.context.lookupMaybe(fontRef, PDFDict);
            if (fontDict) {
              for (const [name, fRef] of fontDict.entries()) {
                const fontObj = pdfDoc.context.lookupMaybe(fRef, PDFDict);
                if (!fontObj) continue;
                const bf = fontObj.get(PDFName.of('BaseFont'));
                if (!bf) continue;
                const key = baseFontToKey(bf.toString());
                if (key) mapping[name.toString().replace('/', '')] = key;
              }
            }
          }
        }
      }
      pageFontMaps.set(i, mapping);
    }

    // Phase A: Blank placeholders in streams and record their positions
    const positions: PlaceholderPosition[] = [];

    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (!('contents' in obj)) continue;

      const pageIndex = refToPageIdx.get(ref.toString());
      if (pageIndex === undefined) continue;

      let text: string;
      try {
        text = inflateSync(
          Buffer.from((obj as { contents: Uint8Array }).contents),
        ).toString('latin1');
      } catch {
        text = Buffer.from(
          (obj as { contents: Uint8Array }).contents,
        ).toString('latin1');
      }

      if (!text.includes('{{') && !text.includes('Developer Note')) continue;

      let modified = text;

      // Blank developer note
      modified = this.blankDeveloperNote(modified);

      // Page 2 (index 1): remove blue card background + blank "out of 100"
      if (pageIndex === 1) {
        modified = this.blankPage2Background(modified);
        modified = this.blankPage2OutOf100(modified);
      }

      // Page 4 (index 3): blank static heading for vertical re-centering
      if (pageIndex === 3) {
        modified = this.blankPage4Heading(modified);
      }

      // Page 3 (index 2): blank "/ 20" fractions and existing dots
      if (pageIndex === 2) {
        modified = this.blankPage3Fractions(modified);
        modified = this.blankPage3Dots(modified);
      }

      // Page 5 (index 4): blank inner card (X36) and accent line for dynamic redraw
      if (pageIndex === 4) {
        modified = this.blankPage5InnerCard(modified);
      }

      // On page 7 (index 6), blank the entire inline sentence block
      if (pageIndex === 6) {
        modified = this.blankInlinePlaceholders(modified);
      }

      const fontMap = pageFontMaps.get(pageIndex) ?? {};

      // Blank all placeholders and record positions
      modified = this.blankAndRecordPositions(modified, pageIndex, fontMap, positions);

      if (modified !== text) {
        const newStream = pdfDoc.context.flateStream(modified);
        if ('dict' in obj && (obj as { dict: unknown }).dict instanceof PDFDict) {
          const oldDict = (obj as { dict: PDFDict }).dict;
          for (const [dk, dv] of oldDict.entries()) {
            const key = dk.toString();
            if (key !== '/Length' && key !== '/Filter') {
              newStream.dict.set(dk, dv);
            }
          }
        }
        pdfDoc.context.assign(ref, newStream);
      }
    }

    // Phase B: Draw replacement text on pages using embedded fonts
    for (const pos of positions) {
      // Skip page 7 inline placeholders — handled separately below
      if (pos.pageIndex === 6 && (pos.key === '{{Business_Name}}' || pos.key === '{{Primary_Focus_Area}}')) {
        continue;
      }

      // Skip page 4 placeholders — handled by drawPage4Content()
      if (pos.pageIndex === 3 && (pos.key === '{{Lowest_Pillar_Name}}' || pos.key === '{{Lowest_Pillar_Impact_Statement}}')) {
        continue;
      }

      const rawValue = replacements[pos.key];
      if (rawValue === undefined) continue;
      const value = rawValue + pos.suffix;

      const config = PLACEHOLDER_CONFIG[pos.key];
      if (!config) continue;

      const font = fonts[pos.fontKey];
      const page = pages[pos.pageIndex];
      const color = 'gray' in pos.color
        ? grayscale(pos.color.gray)
        : cmyk(pos.color.c, pos.color.m, pos.color.y, pos.color.k);

      // Skip Total_Score on page 2 — handled by drawPage2Score()
      if (pos.key === '{{Total_Score}}' && pos.pageIndex === 1) {
        continue;
      }

      // Fix 2: Right-align score placeholders on page 3
      if (pos.key.endsWith('_Score}}')) {
        const textWidth = font.widthOfTextAtSize(value, pos.fontSize);
        const x = 530 - textWidth;
        page.drawText(value, { x, y: pos.y, size: pos.fontSize, font, color });
        continue;
      }

      // Page 5: Draw dynamic inner card (replaces blanked X36) + reposition description
      if (pos.key === '{{Segment_Description_Block}}' && pos.pageIndex === 4) {
        // Calculate text dimensions
        const descLines = this.wrapText(rawValue, font, pos.fontSize, config.maxWidth);
        const lineSpacing = pos.fontSize * config.lineHeight;
        const textHeight = (descLines.length - 1) * lineSpacing + pos.fontSize;

        // Inner card bounds (matching original X36 left/right, extended vertically)
        const innerLeft = 84.7;
        const innerRight = 510.6;
        const innerWidth = innerRight - innerLeft;
        const innerTop = 597.4;  // original X36 top
        const textStartY = innerTop - 25;  // padding from inner card top
        const innerBottom = textStartY - textHeight - 20;  // padding below text
        const innerHeight = innerTop - innerBottom;

        // Draw inner card background (blue with transparency, matching X36)
        page.drawRectangle({
          x: innerLeft,
          y: innerBottom,
          width: innerWidth,
          height: innerHeight,
          color: cmyk(0.874, 0.526, 0, 0),
          opacity: 0.12,
        });

        // Draw blue accent line on left (matching template accent: x≈96, w≈2)
        page.drawRectangle({
          x: 95.9,
          y: innerBottom + 10,
          width: 1.548,
          height: innerHeight - 20,
          color: cmyk(0.877, 0.533, 0, 0),
          opacity: 1,
        });

        // Position text inside the inner card
        pos.x = 115;
        pos.y = textStartY;
      }

      if (config.multiline) {
        this.drawMultiline(page, value, font, pos.fontSize, pos.x, pos.y, color, config);
      } else if (config.centered) {
        const w = font.widthOfTextAtSize(value, pos.fontSize);
        const cx = (PAGE_WIDTH / 2) - (w / 2);
        page.drawText(value, { x: cx, y: pos.y, size: pos.fontSize, font, color });
      } else {
        page.drawText(value, { x: pos.x, y: pos.y, size: pos.fontSize, font, color });
      }
    }

    // Draw page 2 score + "out of 100" centered in ring
    this.drawPage2Score(pages[1], fonts, replacements['{{Total_Score}}']);

    // Draw page 3 dots with dynamic opacity
    this.drawPage3Dots(pages[2], data.pillarScores);

    // Draw page 4 content with vertical centering
    this.drawPage4Content(
      pages[3],
      fonts,
      replacements['{{Lowest_Pillar_Name}}'],
      replacements['{{Lowest_Pillar_Impact_Statement}}'],
    );

    // Draw page 7 inline sentence with mixed fonts
    this.drawPage7Sentence(
      pages[6],
      fonts,
      replacements['{{Business_Name}}'],
      replacements['{{Primary_Focus_Area}}'],
    );

    // Add clickable link on page 7 button
    this.addPage7Link(pdfDoc, pages[6]);

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  // ---------------------------------------------------------------------------
  // Phase A helpers — blanking and position recording
  // ---------------------------------------------------------------------------

  /** Blank developer note TJ arrays. */
  private blankDeveloperNote(stream: string): string {
    // Regex handles ] inside parenthesized strings: match (…) or any non-bracket char
    return stream.replace(/\[((?:\([^)]*\)|[^\[\]])*)\]\s*TJ/g, (fullMatch, arrayContent: string) => {
      const concatenated = this.extractTJText(arrayContent);
      if (concatenated.includes('Developer Note') || concatenated.includes('specific segment')) {
        return '() Tj';
      }
      return fullMatch;
    });
  }

  /**
   * Scan stream line-by-line, tracking Tm/Td/Tf/color state.
   * When a placeholder is found in a TJ/Tj operator:
   *  - Record its position + resolved font
   *  - Replace it with `() Tj` (blank)
   */
  private blankAndRecordPositions(
    stream: string,
    pageIndex: number,
    fontMap: Record<string, FontKey>,
    positions: PlaceholderPosition[],
  ): string {
    if (!stream.includes('{{')) return stream;

    const lines = stream.split('\n');
    const output: string[] = [];

    // State tracking
    let tmA = 0;
    let tmD = 0;
    let tmX = 0;
    let tmY = 0;
    let currentFontKey: FontKey = 'robotoRegular';
    let fillColor: PlaceholderPosition['color'] = { gray: 0 };

    for (const line of lines) {
      const trimmed = line.trim();

      // Track Tf (font selection): /TT0 1 Tf
      const tfMatch = trimmed.match(/^\/(TT\d+)\s+[\d.]+\s+Tf$/);
      if (tfMatch) {
        const resolved = fontMap[tfMatch[1]];
        if (resolved) currentFontKey = resolved;
      }

      // Track CMYK fill color
      const cmykMatch = trimmed.match(
        /^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k$/,
      );
      if (cmykMatch) {
        fillColor = {
          c: parseFloat(cmykMatch[1]),
          m: parseFloat(cmykMatch[2]),
          y: parseFloat(cmykMatch[3]),
          k: parseFloat(cmykMatch[4]),
        };
      }

      // Track grayscale fill color
      const grayMatch = trimmed.match(/^([\d.]+)\s+g$/);
      if (grayMatch) {
        fillColor = { gray: parseFloat(grayMatch[1]) };
      }

      // Track Tm: a b c d tx ty Tm
      const tmMatch = trimmed.match(
        /^(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+Tm$/,
      );
      if (tmMatch) {
        tmA = parseFloat(tmMatch[1]);
        tmD = parseFloat(tmMatch[4]);
        tmX = parseFloat(tmMatch[5]);
        tmY = parseFloat(tmMatch[6]);
        output.push(line);
        continue;
      }

      // Track Td / TD (relative move)
      const tdMatch = trimmed.match(/^(-?[\d.]+)\s+(-?[\d.]+)\s+T[dD]$/);
      if (tdMatch) {
        const dx = parseFloat(tdMatch[1]);
        const dy = parseFloat(tdMatch[2]);
        tmX += dx * tmA;
        tmY += dy * tmD;
        output.push(line);
        continue;
      }

      // Check TJ array for placeholder
      const tjArrayMatch = trimmed.match(/^\[((?:\([^)]*\)|[^\[\]])*)\]\s*TJ$/);
      if (tjArrayMatch) {
        const concatenated = this.extractTJText(tjArrayMatch[1]);
        const foundKey = this.findPlaceholder(concatenated);
        if (foundKey) {
          const suffix = concatenated.substring(concatenated.indexOf(foundKey) + foundKey.length);
          positions.push({
            key: foundKey,
            pageIndex,
            x: tmX,
            y: tmY,
            fontSize: tmA || tmD,
            fontKey: currentFontKey,
            color: { ...fillColor } as PlaceholderPosition['color'],
            suffix,
          });
          output.push('() Tj');
          continue;
        }
      }

      // Check Tj for placeholder
      const tjMatch = trimmed.match(/^\(([^)]*)\)\s*Tj$/);
      if (tjMatch) {
        const foundKey = this.findPlaceholder(tjMatch[1]);
        if (foundKey) {
          const suffix = tjMatch[1].substring(tjMatch[1].indexOf(foundKey) + foundKey.length);
          positions.push({
            key: foundKey,
            pageIndex,
            x: tmX,
            y: tmY,
            fontSize: tmA || tmD,
            fontKey: currentFontKey,
            color: { ...fillColor } as PlaceholderPosition['color'],
            suffix,
          });
          output.push('() Tj');
          continue;
        }
      }

      output.push(line);
    }

    return output.join('\n');
  }

  /**
   * Blank ALL TJ/Tj operators in the BT...ET block containing inline placeholders
   * on page 7. This prevents subset-font template text from overlapping with drawText.
   */
  private blankInlinePlaceholders(stream: string): string {
    if (!stream.includes('Businesses lik')) return stream;

    const lines = stream.split('\n');
    const output: string[] = [];

    // Find which BT block contains the inline sentence
    let targetBlockStart = -1;
    let lastBt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === 'BT') lastBt = i;
      if (lines[i].includes('Businesses lik')) { targetBlockStart = lastBt; break; }
    }

    if (targetBlockStart === -1) return stream;

    let inTargetBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (i === targetBlockStart && trimmed === 'BT') {
        inTargetBlock = true;
        output.push(lines[i]);
        continue;
      }

      if (inTargetBlock && trimmed === 'ET') {
        inTargetBlock = false;
        output.push(lines[i]);
        continue;
      }

      if (inTargetBlock) {
        // Blank any TJ array or Tj operator
        if (/\]\s*TJ$/.test(trimmed) || /\)\s*Tj$/.test(trimmed)) {
          output.push('() Tj');
          continue;
        }
      }

      output.push(lines[i]);
    }

    return output.join('\n');
  }

  /** Remove blue card background XObject (X10) from page 2 stream. Keep X11 (ring). */
  private blankPage2Background(stream: string): string {
    return stream.replace(/\/X10\s+Do/g, '');
  }

  /** Blank "out of 100" template text on page 2 (we redraw it in drawPage2Score). */
  private blankPage2OutOf100(stream: string): string {
    return stream.replace(/\(out of 100\)\s*Tj/g, '() Tj');
  }

  /** Blank "/ 20" fraction text on page 3 so scores render as "15/20". */
  private blankPage3Fractions(stream: string): string {
    // Blank TJ arrays containing only "/ 20"
    let result = stream.replace(/\[((?:\([^)]*\)|[^\[\]])*)\]\s*TJ/g, (fullMatch, arrayContent: string) => {
      const text = this.extractTJText(arrayContent);
      if (text.trim() === '/ 20') return '() Tj';
      return fullMatch;
    });
    // Blank simple Tj operators containing "/ 20"
    result = result.replace(/\(\/ 20\)\s*Tj/g, '() Tj');
    return result;
  }

  /** Blank "Your Biggest Growth Opportunity" heading on page 4 for vertical re-centering. */
  private blankPage4Heading(stream: string): string {
    return stream.replace(/\[((?:\([^)]*\)|[^\[\]])*)\]\s*TJ/g, (fullMatch, arrayContent: string) => {
      const text = this.extractTJText(arrayContent);
      if (text.includes('Biggest Growth Opportunity')) return '() Tj';
      return fullMatch;
    });
  }

  /** Blank inner card (X36) and accent line on page 5 for dynamic-height redraw. */
  private blankPage5InnerCard(stream: string): string {
    // Remove X36 (small inner card ~50pt tall)
    let result = stream.replace(/\/X36\s+Do/g, '');
    // Remove the inline accent line rectangle (97.437 556.683 -1.548 31.587 re\nf)
    result = result.replace(/97\.437\s+556\.683\s+-1\.548\s+31\.587\s+re\s*\nf/g, '');
    return result;
  }

  /** Blank existing dots on page 3 (vector dot + XObject dots X19-X22). */
  private blankPage3Dots(stream: string): string {
    // Blank the vector-drawn dot (bezier circle at 95.4604, 545.954)
    let result = stream.replace(
      /q\s*\n\s*1 0 0 1 95\.4604 545\.954 cm[\s\S]*?f\s*\n\s*Q/,
      '',
    );
    // Blank XObject dots X19-X22
    result = result.replace(/\/X(19|20|21|22)\s+Do/g, '');
    return result;
  }

  // ---------------------------------------------------------------------------
  // Phase B helpers — drawing text
  // ---------------------------------------------------------------------------

  /**
   * Draw the page 7 inline sentence with mixed regular/bold fonts:
   * "Businesses like [Name] typically grow fastest by"
   * "fixing [Focus] first."
   */
  private drawPage7Sentence(
    page: ReturnType<PDFDocument['getPages']>[0],
    fonts: Record<FontKey, PDFFont>,
    businessName: string,
    primaryFocus: string,
  ): void {
    const fontSize = 16;
    const color = cmyk(0.732, 0.672, 0.657, 0.82);
    const regular = fonts.robotoRegular;
    const bold = fonts.robotoBold;
    const y1 = 565.681;
    const y2 = 549.681;

    const line1 = [
      { text: 'Businesses like ', font: regular },
      { text: businessName, font: bold },
      { text: ' typically grow fastest by', font: regular },
    ];

    const line2 = [
      { text: 'fixing ', font: regular },
      { text: primaryFocus, font: bold },
      { text: ' first.', font: regular },
    ];

    // Center each line on the page
    for (const { parts, y } of [{ parts: line1, y: y1 }, { parts: line2, y: y2 }]) {
      const totalWidth = parts.reduce((w, p) => w + p.font.widthOfTextAtSize(p.text, fontSize), 0);
      let x = (PAGE_WIDTH / 2) - (totalWidth / 2);
      for (const part of parts) {
        page.drawText(part.text, { x, y, size: fontSize, font: part.font, color });
        x += part.font.widthOfTextAtSize(part.text, fontSize);
      }
    }
  }

  /**
   * Draw score number + "out of 100" label centered as a pair in the ring on page 2.
   */
  private drawPage2Score(
    page: ReturnType<PDFDocument['getPages']>[0],
    fonts: Record<FontKey, PDFFont>,
    totalScore: string,
  ): void {
    const ringCenterX = 297.637;
    const ringCenterY = 475.138;

    // Score: Roboto Bold, 52pt, dark color (from template)
    const scoreFont = fonts.robotoBold;
    const scoreSize = 52;
    const scoreColor = cmyk(0.732, 0.672, 0.657, 0.82);

    // "out of 100": Roboto Bold, 20pt, blue (from template color)
    const labelFont = fonts.robotoBold;
    const labelSize = 20;
    const labelText = 'out of 100';
    const labelColor = cmyk(0.874, 0.526, 0, 0);

    // Vertical centering of the pair within the ring
    const scoreCapHeight = scoreSize * 0.71;   // ~36.9pt
    const labelCapHeight = labelSize * 0.71;   // ~14.2pt
    const gap = 5; // visual gap between score bottom and label top
    const totalHeight = scoreCapHeight + gap + labelCapHeight; // ~56.1pt

    const scoreBaseline = ringCenterY + totalHeight / 2 - scoreCapHeight;
    const labelBaseline = scoreBaseline - gap - labelCapHeight;

    // Draw score (centered horizontally)
    const scoreWidth = scoreFont.widthOfTextAtSize(totalScore, scoreSize);
    page.drawText(totalScore, {
      x: ringCenterX - scoreWidth / 2,
      y: scoreBaseline,
      size: scoreSize,
      font: scoreFont,
      color: scoreColor,
    });

    // Draw "out of 100" (centered horizontally)
    const labelWidth = labelFont.widthOfTextAtSize(labelText, labelSize);
    page.drawText(labelText, {
      x: ringCenterX - labelWidth / 2,
      y: labelBaseline,
      size: labelSize,
      font: labelFont,
      color: labelColor,
    });
  }

  /** Draw pillar dots on page 3 with opacity based on score ranges. */
  private drawPage3Dots(
    page: ReturnType<PDFDocument['getPages']>[0],
    pillarScores: PillarScores,
  ): void {
    const dotColor = cmyk(0.874, 0.526, 0, 0);
    const radius = 4.645;
    const centerX = 90.815;

    const dotPositions: { pillar: PillarKey; y: number }[] = [
      { pillar: 'visibility', y: 545.954 },
      { pillar: 'conversion', y: 480.546 },
      { pillar: 'reputation', y: 415.137 },
      { pillar: 'marketing', y: 349.729 },
      { pillar: 'tracking', y: 284.321 },
    ];

    for (const { pillar, y } of dotPositions) {
      const score = pillarScores[pillar];
      const opacity = this.getScoreOpacity(score);
      page.drawCircle({
        x: centerX,
        y,
        size: radius,
        color: dotColor,
        opacity,
        borderWidth: 0,
      });
    }
  }

  /** Map a pillar score to dot opacity. */
  private getScoreOpacity(score: number): number {
    if (score >= 16) return 1.0;
    if (score >= 11) return 0.75;
    return 0.5;
  }

  /**
   * Draw page 4 content with vertical centering:
   * "Your Biggest Growth Opportunity" heading + pillar name + impact statement.
   */
  private drawPage4Content(
    page: ReturnType<PDFDocument['getPages']>[0],
    fonts: Record<FontKey, PDFFont>,
    pillarName: string,
    impactStatement: string,
  ): void {
    const headingFont = fonts.archivoExtraBold;
    const pillarFont = fonts.archivoExtraBold;
    const impactFont = fonts.robotoRegular;

    const headingSize = 30;
    const headingText = 'Your Biggest Growth Opportunity';
    const headingColor = cmyk(0, 0, 0, 0);

    // Auto-size pillar name
    const maxPillarWidth = PAGE_WIDTH - 54;
    let pillarSize = 50;
    if (pillarFont.widthOfTextAtSize(pillarName, pillarSize) > maxPillarWidth) {
      pillarSize = pillarSize * (maxPillarWidth / pillarFont.widthOfTextAtSize(pillarName, pillarSize));
    }
    const pillarColor = cmyk(0.011, 0.17, 0.981, 0);

    // Wrap impact text
    const impactSize = 22;
    const impactLineHeight = 1.3;
    const impactMaxWidth = 450;
    const impactLines = this.wrapText(impactStatement, impactFont, impactSize, impactMaxWidth);
    const impactHeight = (impactLines.length - 1) * impactSize * impactLineHeight;
    const impactColor = cmyk(0, 0, 0, 0);

    // Calculate total content height
    const gap1 = 20; // heading to pillar name
    const gap2 = 10; // pillar name to impact
    const totalHeight = headingSize + gap1 + pillarSize + gap2 + impactHeight;

    // Center vertically in available area (y=60 to y=740)
    const areaTop = 740;
    const areaBottom = 60;
    const startY = areaBottom + (areaTop - areaBottom + totalHeight) / 2;

    // Draw heading (centered)
    const headingY = startY;
    const headingW = headingFont.widthOfTextAtSize(headingText, headingSize);
    page.drawText(headingText, {
      x: (PAGE_WIDTH / 2) - (headingW / 2),
      y: headingY,
      size: headingSize,
      font: headingFont,
      color: headingColor,
    });

    // Draw pillar name (centered, below heading)
    const pillarY = headingY - headingSize - gap1;
    const pillarW = pillarFont.widthOfTextAtSize(pillarName, pillarSize);
    page.drawText(pillarName, {
      x: (PAGE_WIDTH / 2) - (pillarW / 2),
      y: pillarY,
      size: pillarSize,
      font: pillarFont,
      color: pillarColor,
    });

    // Draw impact statement (centered text, below pillar name)
    const impactY = pillarY - pillarSize - gap2;
    const impactLineSpacing = impactSize * impactLineHeight;
    for (let i = 0; i < impactLines.length; i++) {
      const lineText = impactLines[i];
      const lineY = impactY - i * impactLineSpacing;
      const lineW = impactFont.widthOfTextAtSize(lineText, impactSize);
      page.drawText(lineText, {
        x: (PAGE_WIDTH / 2) - (lineW / 2),
        y: lineY,
        size: impactSize,
        font: impactFont,
        color: impactColor,
      });
    }
  }

  /** Add a clickable link annotation on the page 7 CTA button. */
  private addPage7Link(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['getPages']>[0],
  ): void {
    const context = pdfDoc.context;

    // Create URI action
    const action = context.obj({
      S: 'URI',
      URI: PDFString.of('https://localmarketingaudit.com'),
    });

    // Create link annotation over the button area
    const annot = context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [146.653, 426.676, 448.588, 480.87],
      A: action,
      Border: [0, 0, 0],
    });

    const annotRef = context.register(annot);

    // Add to page's Annots array
    const existingAnnots = page.node.get(PDFName.of('Annots'));
    if (existingAnnots) {
      const annotsArray = context.lookupMaybe(existingAnnots, PDFArray);
      if (annotsArray) {
        annotsArray.push(annotRef);
      }
    } else {
      const annotsArray = context.obj([annotRef]);
      page.node.set(PDFName.of('Annots'), annotsArray);
    }
  }

  /** Word-wrap and draw multi-line text. */
  private drawMultiline(
    page: ReturnType<PDFDocument['getPages']>[0],
    text: string,
    font: PDFFont,
    fontSize: number,
    x: number,
    y: number,
    color: ReturnType<typeof cmyk> | ReturnType<typeof grayscale>,
    config: PlaceholderConfig,
  ): void {
    const wrappedLines = this.wrapText(text, font, fontSize, config.maxWidth);
    const lineSpacing = fontSize * config.lineHeight;

    for (let i = 0; i < wrappedLines.length; i++) {
      const lineText = wrappedLines[i];
      const lineY = y - i * lineSpacing;

      if (config.centered) {
        const w = font.widthOfTextAtSize(lineText, fontSize);
        const cx = (PAGE_WIDTH / 2) - (w / 2);
        page.drawText(lineText, { x: cx, y: lineY, size: fontSize, font, color });
      } else {
        page.drawText(lineText, { x, y: lineY, size: fontSize, font, color });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Concatenate string parts inside a TJ array, stripping kerning values. */
  private extractTJText(arrayContent: string): string {
    const parts: string[] = [];
    const partRegex = /\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = partRegex.exec(arrayContent)) !== null) {
      parts.push(match[1]);
    }
    return parts.join('');
  }

  /** Return the placeholder key if text contains one. */
  private findPlaceholder(text: string): string | null {
    for (const key of ALL_PLACEHOLDERS) {
      if (text.includes(key)) return key;
    }
    return null;
  }

  /** Word-wrap text to fit within maxWidth points. */
  private wrapText(
    text: string,
    font: PDFFont,
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private getLowestPillar(scores: PillarScores): PillarKey {
    const entries = Object.entries(scores) as [PillarKey, number][];
    entries.sort((a, b) => a[1] - b[1]);
    return entries[0][0];
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
}
