// ===== WHATSAPP SERVICE - Twilio WhatsApp Integration =====
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio Sandbox

let twilioClient = null;

// Initialize Twilio client
function getTwilioClient() {
  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not configured. WhatsApp will be mocked.');
    return null;
  }
  
  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }
  
  return twilioClient;
}

// Send WhatsApp message
export async function sendWhatsApp(to, message) {
  const client = getTwilioClient();
  
  // Ensure phone number has whatsapp: prefix
  const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  
  // Mock mode if no credentials
  if (!client) {
    console.log(`[MOCK WHATSAPP] To: ${whatsappTo}, Message: ${message}`);
    return {
      success: true,
      mock: true,
      sid: `MOCK_WA_${Date.now()}`,
      to: whatsappTo,
      message
    };
  }
  
  try {
    const result = await client.messages.create({
      body: message,
      from: whatsappNumber,
      to: whatsappTo
    });
    
    return {
      success: true,
      mock: false,
      sid: result.sid,
      status: result.status,
      to: result.to
    };
  } catch (error) {
    console.error('WhatsApp Error:', error.message);
    throw new Error(`Failed to send WhatsApp: ${error.message}`);
  }
}

// Send WhatsApp with template
export async function sendWhatsAppTemplate(to, templateName, variables) {
  const client = getTwilioClient();
  
  const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  
  // Mock mode
  if (!client) {
    console.log(`[MOCK WHATSAPP TEMPLATE] To: ${whatsappTo}, Template: ${templateName}`);
    return {
      success: true,
      mock: true,
      sid: `MOCK_WA_TPL_${Date.now()}`,
      to: whatsappTo,
      template: templateName
    };
  }
  
  try {
    const result = await client.messages.create({
      from: whatsappNumber,
      to: whatsappTo,
      contentSid: templateName,
      contentVariables: JSON.stringify(variables)
    });
    
    return {
      success: true,
      mock: false,
      sid: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error('WhatsApp Template Error:', error.message);
    throw new Error(`Failed to send WhatsApp template: ${error.message}`);
  }
}

// Send bulk WhatsApp
export async function sendBulkWhatsApp(recipients, message) {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const result = await sendWhatsApp(recipient.phone, message);
      results.push({
        phone: recipient.phone,
        success: true,
        ...result
      });
    } catch (error) {
      results.push({
        phone: recipient.phone,
        success: false,
        error: error.message
      });
    }
  }
  
  return {
    total: recipients.length,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };
}

// Send welcome WhatsApp
export async function sendWelcomeWhatsApp(lead) {
  const message = `🎓 Welcome to RBMI, ${lead.first_name}!\n\nThank you for your interest. Our counselor will reach out to you soon.\n\n📞 Need help? Call: ${process.env.ADMISSION_HELPLINE || '1800-XXX-XXXX'}\n🌐 Visit: ${process.env.INSTITUTE_WEBSITE || 'www.rbmi.edu.in'}`;
  return sendWhatsApp(lead.phone, message);
}

// Send document reminder
export async function sendDocumentReminder(lead, missingDocs) {
  const docList = missingDocs.join('\n• ');
  const message = `Hi ${lead.first_name},\n\nPlease upload the following documents to complete your application:\n\n• ${docList}\n\nUpload at: ${process.env.INSTITUTE_WEBSITE || 'www.rbmi.edu.in'}/portal`;
  return sendWhatsApp(lead.phone, message);
}

// Check WhatsApp service status
export function isWhatsAppConfigured() {
  return !!(accountSid && authToken);
}
