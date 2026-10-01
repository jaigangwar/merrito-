// ===== INTERVIEW CONTROLLER - Interview Scheduling & Management =====
import * as db from '../supabase.js';
import { generateId, getDB, saveDB } from '../db.js';

// Get all interviews
export async function getInterviews(req, res) {
  try {
    const { lead_id, status, date_from, date_to } = req.query;
    const dbData = getDB();
    let interviews = dbData.interviews || [];

    // Filter by lead_id
    if (lead_id) {
      interviews = interviews.filter(i => i.lead_id === lead_id);
    }

    // Filter by status
    if (status) {
      interviews = interviews.filter(i => i.status === status);
    }

    // Filter by date range
    if (date_from) {
      interviews = interviews.filter(i => new Date(i.scheduled_at) >= new Date(date_from));
    }
    if (date_to) {
      interviews = interviews.filter(i => new Date(i.scheduled_at) <= new Date(date_to));
    }

    // Enrich with lead and counselor details
    const leads = await db.getLeads({});
    const counselors = await db.getCounselors();
    const leadMap = Object.fromEntries(leads.map(l => [l.id, l]));
    const counselorMap = Object.fromEntries(counselors.map(c => [c.id, c]));

    const enriched = interviews.map(i => {
      const lead = leadMap[i.lead_id];
      const interviewer = counselorMap[i.interviewer_id];
      return {
        ...i,
        lead_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
        lead_email: lead?.email || '',
        lead_phone: lead?.phone || '',
        interviewer_name: interviewer?.name || 'Unassigned'
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get single interview
export async function getInterview(req, res) {
  try {
    const dbData = getDB();
    const interviews = dbData.interviews || [];
    const interview = interviews.find(i => i.id === req.params.id);

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Enrich with details
    const lead = await db.getLead(interview.lead_id);
    const interviewer = await db.getCounselor(interview.interviewer_id);

    res.json({
      ...interview,
      lead_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
      lead_email: lead?.email || '',
      lead_phone: lead?.phone || '',
      interviewer_name: interviewer?.name || 'Unassigned'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Create interview
export async function createInterview(req, res) {
  try {
    const {
      lead_id,
      interviewer_id,
      scheduled_at,
      duration_minutes = 30,
      mode = 'in-person',
      location,
      meeting_link,
      notes
    } = req.body;

    // Validation
    if (!lead_id || !interviewer_id || !scheduled_at) {
      return res.status(400).json({ error: 'lead_id, interviewer_id, and scheduled_at are required' });
    }

    // Check if lead exists
    const lead = await db.getLead(lead_id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if interviewer exists
    const interviewer = await db.getCounselor(interviewer_id);
    if (!interviewer) {
      return res.status(404).json({ error: 'Interviewer not found' });
    }

    const dbData = getDB();
    if (!dbData.interviews) dbData.interviews = [];

    const interview = {
      id: generateId(),
      lead_id,
      interviewer_id,
      scheduled_at,
      duration_minutes,
      mode, // 'in-person', 'video', 'phone'
      location: location || '',
      meeting_link: meeting_link || '',
      status: 'scheduled', // 'scheduled', 'completed', 'cancelled', 'no-show'
      notes: notes || '',
      feedback: '',
      rating: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbData.interviews.push(interview);
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id,
      type: 'interview_scheduled',
      message: `Interview scheduled with ${interviewer.name} on ${new Date(scheduled_at).toLocaleString('en-IN')}`
    });

    res.status(201).json({
      ...interview,
      lead_name: `${lead.first_name} ${lead.last_name}`,
      interviewer_name: interviewer.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update interview
export async function updateInterview(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.interviews) dbData.interviews = [];

    const index = dbData.interviews.findIndex(i => i.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const updated = {
      ...dbData.interviews[index],
      ...req.body,
      updated_at: new Date().toISOString()
    };

    dbData.interviews[index] = updated;
    saveDB(dbData);

    // Create activity for status change
    if (req.body.status && req.body.status !== dbData.interviews[index].status) {
      const lead = await db.getLead(updated.lead_id);
      await db.createActivity({
        lead_id: updated.lead_id,
        type: 'interview_updated',
        message: `Interview status changed to ${updated.status} for ${lead.first_name} ${lead.last_name}`
      });
    }

    // Enrich response
    const lead = await db.getLead(updated.lead_id);
    const interviewer = await db.getCounselor(updated.interviewer_id);

    res.json({
      ...updated,
      lead_name: lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown',
      interviewer_name: interviewer?.name || 'Unassigned'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Delete interview
export async function deleteInterview(req, res) {
  try {
    const dbData = getDB();
    if (!dbData.interviews) dbData.interviews = [];

    const index = dbData.interviews.findIndex(i => i.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    const interview = dbData.interviews[index];
    dbData.interviews.splice(index, 1);
    saveDB(dbData);

    // Create activity
    await db.createActivity({
      lead_id: interview.lead_id,
      type: 'interview_cancelled',
      message: 'Interview cancelled'
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get available time slots for interviewer
export async function getAvailableSlots(req, res) {
  try {
    const { interviewer_id, date } = req.query;

    if (!interviewer_id || !date) {
      return res.status(400).json({ error: 'interviewer_id and date are required' });
    }

    const dbData = getDB();
    const interviews = dbData.interviews || [];

    // Get all interviews for this interviewer on this date
    const bookedSlots = interviews
      .filter(i => i.interviewer_id === interviewer_id && i.status === 'scheduled')
      .filter(i => {
        const interviewDate = new Date(i.scheduled_at).toISOString().split('T')[0];
        return interviewDate === date;
      })
      .map(i => ({
        start: new Date(i.scheduled_at),
        end: new Date(new Date(i.scheduled_at).getTime() + i.duration_minutes * 60000)
      }));

    // Generate available slots (9 AM to 6 PM, 30-minute intervals)
    const availableSlots = [];
    const targetDate = new Date(date);
    const startHour = 9;
    const endHour = 18;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotStart = new Date(targetDate);
        slotStart.setHours(hour, minute, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

        // Check if slot is available
        const isBooked = bookedSlots.some(booked => {
          return (slotStart >= booked.start && slotStart < booked.end) ||
                 (slotEnd > booked.start && slotEnd <= booked.end) ||
                 (slotStart <= booked.start && slotEnd >= booked.end);
        });

        if (!isBooked) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            label: `${slotStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${slotEnd.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
          });
        }
      }
    }

    res.json({ date, interviewer_id, slots: availableSlots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
