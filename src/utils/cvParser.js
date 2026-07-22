const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(buffer, originalName) {
  const ext = (originalName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === 'doc') {
    throw new Error('Legacy .doc files are not supported — please upload .docx or .pdf');
  }

  if (ext === 'txt') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

module.exports = { extractText };