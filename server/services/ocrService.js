// ===== OCR SERVICE - Document Text Extraction =====
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// Extract text from image
export async function extractTextFromImage(imagePath) {
  try {
    // Check if Tesseract is available
    if (!Tesseract) {
      console.warn('Tesseract not available. OCR will be mocked.');
      return {
        success: true,
        mock: true,
        text: '[MOCK OCR] Text extracted from document',
        confidence: 95
      };
    }

    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => console.log(m)
    });

    return {
      success: true,
      mock: false,
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words.length
    };
  } catch (error) {
    console.error('OCR Error:', error.message);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

// Extract specific fields from document
export async function extractDocumentFields(imagePath, documentType) {
  const result = await extractTextFromImage(imagePath);
  
  if (result.mock) {
    return {
      success: true,
      mock: true,
      fields: getMockFields(documentType)
    };
  }

  const text = result.text;
  const fields = {};

  switch (documentType) {
    case 'marksheet':
      fields.name = extractPattern(text, /Name[:\s]+([A-Za-z\s]+)/i);
      fields.roll_number = extractPattern(text, /Roll\s*No[:\s]+([A-Z0-9]+)/i);
      fields.percentage = extractPattern(text, /Percentage[:\s]+([\d.]+)/i);
      fields.grade = extractPattern(text, /Grade[:\s]+([A-Z]+)/i);
      fields.year = extractPattern(text, /Year[:\s]+([\d]{4})/i);
      break;

    case 'id_proof':
      fields.name = extractPattern(text, /Name[:\s]+([A-Za-z\s]+)/i);
      fields.id_number = extractPattern(text, /(?:Aadhaar|PAN|Passport)[:\s]+([A-Z0-9]+)/i);
      fields.dob = extractPattern(text, /(?:DOB|Date of Birth)[:\s]+([\d\/\-]+)/i);
      break;

    case 'income_certificate':
      fields.name = extractPattern(text, /Name[:\s]+([A-Za-z\s]+)/i);
      fields.annual_income = extractPattern(text, /Annual Income[:\s]+Rs\.?\s*([\d,]+)/i);
      fields.certificate_number = extractPattern(text, /Certificate No[:\s]+([A-Z0-9\/]+)/i);
      break;

    default:
      fields.raw_text = text;
  }

  return {
    success: true,
    mock: false,
    fields,
    confidence: result.confidence
  };
}

// Helper function to extract pattern
function extractPattern(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

// Mock fields for testing
function getMockFields(documentType) {
  const mockData = {
    marksheet: {
      name: 'Rahul Sharma',
      roll_number: 'ROLL2024001',
      percentage: '85.5',
      grade: 'A',
      year: '2024'
    },
    id_proof: {
      name: 'Rahul Sharma',
      id_number: 'ABCD1234E',
      dob: '15/08/2005'
    },
    income_certificate: {
      name: 'Rahul Sharma',
      annual_income: '5,00,000',
      certificate_number: 'IC/2024/12345'
    }
  };

  return mockData[documentType] || { raw_text: 'Mock OCR text' };
}

// Verify document authenticity (basic checks)
export async function verifyDocument(imagePath, documentType) {
  const result = await extractDocumentFields(imagePath, documentType);

  const checks = {
    has_text: !!result.fields && Object.keys(result.fields).length > 0,
    has_name: !!result.fields?.name,
    confidence_ok: result.confidence > 70,
    format_valid: true // Can add more sophisticated checks
  };

  const isValid = Object.values(checks).every(check => check);

  return {
    success: true,
    is_valid: isValid,
    checks,
    fields: result.fields,
    confidence: result.confidence
  };
}

// Batch process documents
export async function batchProcessDocuments(documents) {
  const results = [];

  for (const doc of documents) {
    try {
      const result = await extractDocumentFields(doc.path, doc.type);
      results.push({
        document_id: doc.id,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        document_id: doc.id,
        success: false,
        error: error.message
      });
    }
  }

  return {
    total: documents.length,
    processed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

// Check OCR service status
export function isOCRConfigured() {
  return !!Tesseract;
}
