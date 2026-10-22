const Document = require('../models/Document');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Sanitize string to prevent Excel / CSV formula injection
const sanitizeExcel = (val) => {
  if (typeof val === 'string' && /^[=+\-@\t\r]/.test(val)) {
    return `'${val}`;
  }
  return val;
};

// @desc    Export documents as PDF
// @route   GET /api/reports/pdf
// @access  Private
const exportPDF = async (req, res, next) => {
  try {
    const documents = await Document.find({ user: req.user.id }).sort('-createdAt');

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=renewal-report.pdf');
    doc.pipe(res);

    // Title
    doc.fontSize(22).fillColor('#4f46e5').text('Contract & Document Renewal Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#6b7280').text(`Generated: ${new Date().toLocaleDateString('en-IN')} | Total: ${documents.length} documents`, { align: 'center' });
    doc.moveDown(1);

    // Divider
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.8);

    // Table headers
    const tableTop = doc.y;
    doc.fontSize(9).fillColor('#1f2937').font('Helvetica-Bold');
    doc.text('Title', 40, tableTop, { width: 150 });
    doc.text('Type', 195, tableTop, { width: 80 });
    doc.text('Issuer', 280, tableTop, { width: 110 });
    doc.text('Expiry Date', 395, tableTop, { width: 90 });
    doc.text('Status', 490, tableTop, { width: 70 });

    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.4);

    // Rows
    doc.font('Helvetica').fontSize(8);
    documents.forEach((d, i) => {
      if (doc.y > 700) {
        doc.addPage();
      }
      const rowY = doc.y;
      const fillColor = i % 2 === 0 ? '#f9fafb' : '#ffffff';

      doc.rect(38, rowY - 2, 518, 16).fill(fillColor);

      const statusColor =
        d.status === 'Active' ? '#16a34a' :
        d.status === 'Expired' ? '#dc2626' :
        d.status === 'Expiring Soon' ? '#d97706' : '#6b7280';

      doc.fillColor('#374151').text((d.title || '').substring(0, 28), 40, rowY, { width: 150 });
      doc.text(d.type || '', 195, rowY, { width: 80 });
      doc.text((d.issuer || '').substring(0, 18), 280, rowY, { width: 110 });
      doc.text(new Date(d.expiryDate).toLocaleDateString('en-IN'), 395, rowY, { width: 90 });
      doc.fillColor(statusColor).text(d.status || '', 490, rowY, { width: 70 });

      doc.moveDown(0.8);
    });

    // Footer
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#9ca3af').text('© 2024 Renewal Tracker System — MERN Stack Project', { align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};

// @desc    Export documents as Excel
// @route   GET /api/reports/excel
// @access  Private
const exportExcel = async (req, res, next) => {
  try {
    const documents = await Document.find({ user: req.user.id }).sort('-createdAt');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Renewal Tracker';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Renewal Report', {
      pageSetup: { fitToPage: true, orientation: 'landscape' },
    });

    // Title row
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = 'CONTRACT & DOCUMENT RENEWAL REPORT';
    sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF4F46E5' } };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = `Generated on: ${new Date().toLocaleDateString('en-IN')} | Total: ${documents.length}`;
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF6B7280' } };

    sheet.addRow([]);

    // Headers
    const headerRow = sheet.addRow(['#', 'Title', 'Type', 'Issuer', 'Issue Date', 'Expiry Date', 'Status', 'Cost (INR)']);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } };
    });

    // Data rows
    documents.forEach((d, i) => {
      const row = sheet.addRow([
        i + 1,
        sanitizeExcel(d.title),
        sanitizeExcel(d.type),
        sanitizeExcel(d.issuer),
        new Date(d.issueDate).toLocaleDateString('en-IN'),
        new Date(d.expiryDate).toLocaleDateString('en-IN'),
        sanitizeExcel(d.status),
        Number(d.cost) || 0,
      ]);

      // Status color
      const statusCell = row.getCell(7);
      const colorMap = { Active: 'FF16A34A', Expired: 'FFDC2626', 'Expiring Soon': 'FFD97706', Renewed: 'FF2563EB' };
      statusCell.font = { color: { argb: colorMap[d.status] || 'FF6B7280' }, bold: true };

      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        });
      }
    });

    // Column widths
    sheet.columns = [
      { key: 'num', width: 5 },
      { key: 'title', width: 30 },
      { key: 'type', width: 15 },
      { key: 'issuer', width: 20 },
      { key: 'issueDate', width: 14 },
      { key: 'expiryDate', width: 14 },
      { key: 'status', width: 15 },
      { key: 'cost', width: 14 },
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=renewal-report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = { exportPDF, exportExcel };
