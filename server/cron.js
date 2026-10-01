import { getDB, saveDB, generateId } from './db.js';
import * as db from './supabase.js';

let cronInterval = null;

// Mock Publisher APIs for Demo Mode
async function pollShiksha(apiKey) {
  // Simulating an API call to Shiksha that returns 1-3 leads
  const count = Math.floor(Math.random() * 3) + 1;
  const names = ['Aman', 'Priya', 'Rahul', 'Sneha', 'Vikram'];
  const leads = [];
  for(let i=0; i<count; i++) {
    const fn = names[Math.floor(Math.random() * names.length)];
    leads.push({
      first_name: fn,
      last_name: 'Sharma',
      email: `${fn.toLowerCase()}${Math.floor(Math.random()*1000)}@shiksha-test.com`,
      phone: `+9198${Math.floor(10000000 + Math.random()*89999999)}`,
      course: 'B.Tech',
      source: 'Shiksha API',
      campaign: 'Summer 2026',
      notes: 'Automatically pulled via background sync'
    });
  }
  return leads;
}

async function runAutoSync() {
  // Never manufacture leads in production/real-data mode. Real publishers
  // should deliver through their configured webhook integrations.
  if (db.REAL_DATA_MODE) return;
  console.log('[Cron] Running Auto-Lead Synchronization cycle...');
  const state = getDB();
  const settings = state.institute_settings || {};
  const integrations = settings.integrations || {};

  // Check if Shiksha is enabled and has an API key
  if (integrations['shiksha']?.enabled && integrations['shiksha']?.apiKey) {
    try {
      console.log('[Cron] Polling Shiksha API...');
      const leads = await pollShiksha(integrations['shiksha'].apiKey);
      console.log(`[Cron] Fetched ${leads.length} leads from Shiksha`);
      
      for (const leadData of leads) {
        // Create lead directly through database layer
        const created = await db.createLead({
          first_name: leadData.first_name,
          last_name: leadData.last_name,
          email: leadData.email,
          phone: leadData.phone,
          source: leadData.source,
          stage: 'enquiry',
          priority: 'medium',
          campaign: leadData.campaign || '',
          notes: leadData.notes || '',
          lead_score: Math.floor(Math.random() * 60) + 20
        });
        if (created) {
          const dbData = getDB();
          if (!dbData.inboundLogs) dbData.inboundLogs = [];
          dbData.inboundLogs.unshift({
            id: generateId(),
            publisher: 'Shiksha API',
            source: 'Shiksha API',
            student_name: `${leadData.first_name} ${leadData.last_name}`,
            status: 'captured',
            lead_id: created.id,
            received_at: new Date().toISOString()
          });
          if (dbData.inboundLogs.length > 200) dbData.inboundLogs = dbData.inboundLogs.slice(0, 200);
          saveDB(dbData);
        }
      }
    } catch (e) {
      console.error('[Cron] Error polling Shiksha:', e.message);
    }
  }

  // Similar polling logic can be added here for JustDial, CollegeDekho, etc.
}

export function startCronJobs() {
  if (cronInterval) return;
  // Run every 10 minutes in production, but for demo purposes let's run every 1 minute
  const INTERVAL_MS = 60 * 1000; 
  console.log(`[Cron] Background sync worker started. Interval: ${INTERVAL_MS/1000}s`);
  
  // Initial run
  setTimeout(runAutoSync, 5000);
  
  // Recurring
  cronInterval = setInterval(runAutoSync, INTERVAL_MS);
}

export function stopCronJobs() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Cron] Background sync worker stopped.');
  }
}
