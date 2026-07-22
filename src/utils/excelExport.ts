import * as ExcelJS from 'exceljs';

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  numFmt?: string;
}

export interface ExportExcelOptions {
  filename: string;
  sheetName?: string;
  columns: ExcelColumnDef[];
  rows: Record<string, any>[];
  totalRow?: Record<string, any>;
}

/**
 * Creates and downloads a beautifully formatted Excel (.xlsx) file
 * with dark headers, auto-calculated column widths, borders, and proper text alignment.
 */
export async function exportToExcel({
  filename,
  sheetName = 'Sheet1',
  columns,
  rows,
  totalRow,
}: ExportExcelOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  const FONT_NORMAL = { name: 'Cambria', size: 11 };
  const FONT_HEADER = { name: 'Cambria', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  const FONT_TOTAL = { name: 'Cambria', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

  const FILL_HEADER: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate-800
  };

  const FILL_TOTAL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' }, // Slate-700
  };

  const BORDER_THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // Define Worksheet Columns
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    style: col.numFmt ? { numFmt: col.numFmt } : undefined,
  }));

  // Add Data Rows
  rows.forEach(r => worksheet.addRow(r));

  // Add Total Row if present
  let totalRowIndex = -1;
  if (totalRow) {
    const addedRow = worksheet.addRow(totalRow);
    totalRowIndex = addedRow.number;
  }

  // Format Header Row (Row 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = BORDER_THIN;
  });

  // Format Data Rows & Total Row
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Header handled above

    const isTotal = rowNumber === totalRowIndex;
    row.height = isTotal ? 22 : 20;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = columns[colNumber - 1];
      const align = colDef?.align || 'center';

      let cellValue = cell.value;
      let cellFillColor = '';
      let cellTextColor = '';

      if (cellValue && typeof cellValue === 'object' && 'value' in cellValue) {
        const obj = cellValue as any;
        cellValue = obj.value;
        cellFillColor = obj.fillColor;
        cellTextColor = obj.textColor;
        cell.value = cellValue;
      }

      cell.font = isTotal ? FONT_TOTAL : FONT_NORMAL;
      
      if (cellFillColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: cellFillColor },
        };
      } else if (isTotal) {
        cell.fill = FILL_TOTAL;
      }

      if (cellTextColor) {
        cell.font = {
          name: 'Cambria',
          size: 11,
          bold: isTotal ? true : undefined,
          color: { argb: cellTextColor },
        };
      }

      cell.alignment = { vertical: 'middle', horizontal: align };
      cell.border = BORDER_THIN;
    });
  });

  // Auto-fit Column Widths with buffer
  worksheet.columns.forEach((column, i) => {
    const colDef = columns[i];
    let maxLen = colDef?.header ? String(colDef.header).length : 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const val = cell.value;
      let len = 0;
      if (val instanceof Date) {
        len = 10;
      } else if (val != null) {
        len = String(val).length;
      }
      if (len > maxLen) maxLen = len;
    });

    const calculatedWidth = maxLen + 8; // Padding of +8 to ensure bold headers/wide characters don't crop
    column.width = colDef?.width ? Math.max(calculatedWidth, colDef.width) : Math.max(calculatedWidth, 12);
  });

  // Export to Blob and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const EXCEL_COLORS: Record<string, { fillColor: string; textColor: string }> = {
  // Duty Shifts
  A: { fillColor: 'FFE0F2FE', textColor: 'FF0369A1' },  // Sky
  B: { fillColor: 'FFD1FAE5', textColor: 'FF065F46' },  // Emerald
  C: { fillColor: 'FFFEF3C7', textColor: 'FF92400E' },  // Amber
  M: { fillColor: 'FFF3E8FF', textColor: 'FF5B21B6' },  // Violet
  H: { fillColor: 'FFFFF1F2', textColor: 'FFBE123C' },  // Rose (Holiday/Friday)
  
  // Leaves
  SL: { fillColor: 'FFE0E7FF', textColor: 'FF3730A3' }, // Indigo
  PL: { fillColor: 'FFF7FEE7', textColor: 'FF3F6212' }, // Lime
  LFA: { fillColor: 'FFFCE7F3', textColor: 'FF9D174D' }, // Pink
  ADJ: { fillColor: 'FFFFEDD5', textColor: 'FF9A3412' }, // Orange
  ABSENT: { fillColor: 'FFEF4444', textColor: 'FFFFFFFF' }, // Red (Absent 'A' in leave context)

  // Overtime and Short Leave
  OT: { fillColor: 'FF0F766E', textColor: 'FFFFFFFF' }, // Teal-700
  SHORT_LEAVE: { fillColor: 'FF5B21B6', textColor: 'FFFFFFFF' }, // Violet-800
};

export function formatExcelCell(val: any, context?: 'duty' | 'leave' | 'ot' | 'sl') {
  if (val == null || val === '' || val === '-') {
    return { value: '-' };
  }
  
  const key = String(val).toUpperCase();
  
  if (context === 'leave' && key === 'A') {
    return { value: val, ...EXCEL_COLORS.ABSENT };
  }

  if (context === 'ot') {
    return { value: val, ...EXCEL_COLORS.OT };
  }

  if (context === 'sl') {
    return { value: val, ...EXCEL_COLORS.SHORT_LEAVE };
  }

  if (context === 'duty') {
    if (key.includes('+')) {
      return { value: val, ...EXCEL_COLORS.OT };
    }
    if (key.includes('-') && /\d/.test(key)) {
      return { value: val, ...EXCEL_COLORS.SHORT_LEAVE };
    }
  }
  
  if (EXCEL_COLORS[key]) {
    return { value: val, ...EXCEL_COLORS[key] };
  }
  
  return { value: val };
}

export function to12HourFormat(timeStr: string): string {
  if (!timeStr || !timeStr.includes(':')) return timeStr;
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  if (isNaN(hour)) return timeStr;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12).padStart(2, '0')}:${minStr} ${ampm}`;
}
