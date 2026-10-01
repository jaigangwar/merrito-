// ===== SMS SERVICE - Twilio Integration =====
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;

// Initialize Twilio client
function getTwilioClient() {
  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not configured. SMS will be mocked.');
    return null;
  }
  
  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }
  
  return twilioClient;
}

// Send SMS
export async function sendSMS(to, message) {
  const client = getTwilioClient();
  
  // Mock mode if no credentials
  if (!client) {
    console.log(`[MOCK SMS] To: ${to}, Message: ${message}`);
    return {
      success: true,
      mock: true,
      sid: `MOCK_${Date.now()}`,
      to,
      message
    };
  }
  
  try {
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });
    
    return {
      success: true,
      mock: false,
      sid: result.sid,
      status: result.status,
      to: result.to
    };
  } catch (error) {
    console.error('SMS Error:', error.message);
    throw new Error(`Failed to send SMS: ${error.message}`);
  }
}

// Send bulk SMS
export async function sendBulkSMS(recipients, message) {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const result = await sendSMS(recipient.phone, message);
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

// Send OTP
export async function sendOTP(phone, otp) {
  const message = `Your RBMI verification code is: ${otp}. Valid for 10 minutes. Do not share with anyone.`;
  return sendSMS(phone, message);
}

// Send welcome SMS
export async function sendWelcomeSMS(lead) {
  const message = `Welcome ${lead.first_name}! Thank you for your interest in RBMI. Our counselor will contact you soon. Call: ${process.env.ADMISSION_HELPLINE || '1800-XXX-XXXX'}`;
  return sendSMS(lead.phone, message);
}

// Send stage change SMS
export async function sendStageChangeSMS(lead, stage) {
  const stageMessages = {
    counseling_scheduled: `Hi ${lead.first_name}, your counseling session is scheduled. Our counselor will contact you soon.`,
    application_submitted: `Hi ${lead.first_name}, your application has been received. We'll review it shortly.`,
    documents_verified: `Hi ${lead.first_name}, your documents are verified. Admission process is in progress.`,
    admitted: `Congratulations ${lead.first_name}! You've been admitted to RBMI. Check your email for details.`,
    enrolled: `Welcome to RBMI ${lead.first_name}! Your enrollment is complete. See you on campus!`
  };
  
  const message = stageMessages[stage];
  if (message) {
    return sendSMS(lead.phone, message);
  }
  
  return null;
}

// Check SMS service status
export function isSMSConfigured() {
  return !!(accountSid && authToken && fromNumber);
}
