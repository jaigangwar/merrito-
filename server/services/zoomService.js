// ===== ZOOM SERVICE - Video Counseling Integration =====
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ZOOM_API_KEY = process.env.ZOOM_API_KEY;
const ZOOM_API_SECRET = process.env.ZOOM_API_SECRET;
const ZOOM_SDK_KEY = process.env.ZOOM_SDK_KEY;
const ZOOM_SDK_SECRET = process.env.ZOOM_SDK_SECRET;

// Generate Zoom JWT token
function generateZoomToken() {
  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    return null;
  }

  const payload = {
    iss: ZOOM_API_KEY,
    exp: Date.now() + 5000
  };

  return jwt.sign(payload, ZOOM_API_SECRET);
}

// Create Zoom meeting
export async function createZoomMeeting(options) {
  const {
    topic,
    start_time,
    duration = 30,
    timezone = 'Asia/Kolkata',
    agenda,
    host_email
  } = options;

  // Mock mode if no credentials
  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    console.log(`[MOCK ZOOM] Creating meeting: ${topic}`);
    return {
      success: true,
      mock: true,
      meeting: {
        id: `MOCK_${Date.now()}`,
        topic,
        start_time,
        duration,
        join_url: `https://zoom.us/j/mock${Date.now()}`,
        password: '123456',
        host_email: host_email || 'host@rbmi.edu.in'
      }
    };
  }

  try {
    const token = generateZoomToken();
    
    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic,
        type: 2, // Scheduled meeting
        start_time,
        duration,
        timezone,
        agenda,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: true,
          waiting_room: true,
          audio: 'both',
          auto_recording: 'cloud'
        }
      })
    });

    const meeting = await response.json();

    return {
      success: true,
      mock: false,
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        start_time: meeting.start_time,
        duration: meeting.duration,
        join_url: meeting.join_url,
        password: meeting.password,
        host_email: meeting.host_email
      }
    };
  } catch (error) {
    console.error('Zoom Error:', error.message);
    throw new Error(`Failed to create Zoom meeting: ${error.message}`);
  }
}

// Get meeting details
export async function getZoomMeeting(meetingId) {
  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    return {
      success: true,
      mock: true,
      meeting: {
        id: meetingId,
        status: 'waiting'
      }
    };
  }

  try {
    const token = generateZoomToken();
    
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const meeting = await response.json();
    return {
      success: true,
      mock: false,
      meeting
    };
  } catch (error) {
    throw new Error(`Failed to get Zoom meeting: ${error.message}`);
  }
}

// Delete Zoom meeting
export async function deleteZoomMeeting(meetingId) {
  if (!ZOOM_API_KEY || !ZOOM_API_SECRET) {
    console.log(`[MOCK ZOOM] Deleting meeting: ${meetingId}`);
    return { success: true, mock: true };
  }

  try {
    const token = generateZoomToken();
    
    await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return { success: true, mock: false };
  } catch (error) {
    throw new Error(`Failed to delete Zoom meeting: ${error.message}`);
  }
}

// Generate Zoom SDK signature for client
export function generateZoomSDKSignature(meetingNumber, role = 0) {
  if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
    return null;
  }

  const timestamp = Date.now();
  const msg = Buffer.from(ZOOM_SDK_KEY + meetingNumber + timestamp + role).toString('base64');
  const hash = crypto
    .createHmac('sha256', ZOOM_SDK_SECRET)
    .update(msg)
    .digest('base64');

  return Buffer.from(`${ZOOM_SDK_KEY}.${meetingNumber}.${timestamp}.${role}.${hash}`).toString('base64');
}

// Check Zoom service status
export function isZoomConfigured() {
  return !!(ZOOM_API_KEY && ZOOM_API_SECRET);
}
