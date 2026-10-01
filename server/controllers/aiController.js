// ===== AI CONTROLLER — Asha AI with Context Awareness =====
import OpenAI from 'openai';
import * as db from '../supabase.js';
import { getDB } from '../db.js';

const llmBaseUrl = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: llmBaseUrl
});

function getLastUserMessage(history = []) {
  if (!Array.isArray(history)) return '';
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user' && typeof message?.content === 'string');
  return lastUserMessage?.content?.trim() || '';
}

// Build rich context from the database for Asha AI
async function buildContextData() {
  try {
    const dbData = getDB();
    const courses = dbData.courses || [];
    const counselors = dbData.counselors || [];
    const leads = dbData.leads || [];
    const settings = dbData.settings || {};
    const campaigns = dbData.communicationCampaigns || [];
    const tasks = dbData.tasks || [];

    const totalLeads = leads.length;
    const admissions = leads.filter(l => l.stage === 'admitted' || l.stage === 'enrolled').length;
    const active = leads.filter(l => !['admitted', 'enrolled'].includes(l.stage)).length;
    const conversionRate = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : '0';

    const stageBreakdown = {};
    leads.forEach(l => { stageBreakdown[l.stage] = (stageBreakdown[l.stage] || 0) + 1; });

    const courseNames = courses.map(c => `${c.name} (${c.fee || 'Contact for fee'})`).join(', ');
    const topCourses = courses.slice(0, 5).map(c => `${c.name}: ${c.fee || 'N/A'}`).join('\n');

    return {
      institute: settings.institute_name || 'RBMI',
      totalLeads,
      activeLeads: active,
      admissions,
      conversionRate: conversionRate + '%',
      stageBreakdown,
      courses: courseNames,
      topCourses,
      counselorCount: counselors.length,
      campaignCount: campaigns.length,
      pendingTasks: tasks.filter(t => t.status !== 'completed').length
    };
  } catch (e) {
    console.warn('Failed to build context data:', e.message);
    return null;
  }
}

// Data-aware fallback reply
async function contextAwareReply(history = []) {
  const text = getLastUserMessage(history).toLowerCase();
  const ctx = await buildContextData();

  if (!ctx) {
    return 'Hello! I am Asha AI, your admission assistant. I am having trouble accessing the database right now, but I can still help with general queries.';
  }

  // SQI / Analytics
  if (text.includes('analyze') || text.includes('quality index') || text.includes('sqi') || text.includes('insight')) {
    const stageInfo = Object.entries(ctx.stageBreakdown)
      .map(([stage, count]) => `${stage}: ${count} students`)
      .join('\n');
    return `📊 **Real-Time RBMI Analytics**\n\n` +
      `Institution: ${ctx.institute}\n` +
      `Total Leads: ${ctx.totalLeads}\n` +
      `Active Leads: ${ctx.activeLeads}\n` +
      `Confirmed Admissions: ${ctx.admissions}\n` +
      `Conversion Rate: ${ctx.conversionRate}\n\n` +
      `**Stage Breakdown:**\n${stageInfo}\n\n` +
      `💡 **Actionable Insights:**\n` +
      `1. Your conversion rate is ${ctx.conversionRate}. Focus on leads in "counseling_done" stage to push them to application.\n` +
      `2. You have ${ctx.pendingTasks} pending follow-up tasks. Automate WhatsApp reminders for faster closure.\n` +
      `3. You have ${ctx.counselorCount} counselors managing ${ctx.activeLeads} active leads.`
      ;
  }

  // Course/fee related
  if (text.includes('course') || text.includes('program') || text.includes('fee') || text.includes('fees') || text.includes('cost') || text.includes('price')) {
    return `🎓 **Available Programs at ${ctx.institute}**\n\n` +
      `Here are our top programs:\n${ctx.topCourses}\n\n` +
      `We offer ${ctx.courses.split(',').length} programs across Management, Engineering, Commerce, Computer Science, and Sciences.\n\n` +
      `Need specific details about a program? Just ask!`;
  }

  // General stats
  if (text.includes('stat') || text.includes('overview') || text.includes('summary') || text.includes('dashboard') || text.includes('report')) {
    return `📈 **${ctx.institute} — Live Overview**\n\n` +
      `Total Leads: ${ctx.totalLeads}\n` +
      `Active Leads in Pipeline: ${ctx.activeLeads}\n` +
      `Confirmed Admissions: ${ctx.admissions}\n` +
      `Conversion Rate: ${ctx.conversionRate}\n` +
      `Counselors: ${ctx.counselorCount}\n` +
      `Active Campaigns: ${ctx.campaignCount}\n` +
      `Pending Tasks: ${ctx.pendingTasks}\n\n` +
      `Want to drill down into any specific metric? I can help!`;
  }

  // Campaign/marketing
  if (text.includes('campaign') || text.includes('marketing') || text.includes('broadcast')) {
    return `📣 **Marketing Overview**\n\n` +
      `You have ${ctx.campaignCount} marketing campaigns configured.\n` +
      `With ${ctx.totalLeads} leads in the system and ${ctx.activeLeads} actively being nurtured, ` +
      `you can target campaigns based on course interest, source, city, or stage.\n\n` +
      `💡 **Recommendation:** Create a drip campaign for leads stuck in "enquiry" stage to improve conversion.`;
  }

  // Counselor / team queries
  if (text.includes('counselor') || text.includes('team') || text.includes('staff')) {
    return `👥 **Team Overview**\n\n` +
      `You have ${ctx.counselorCount} counselors on the team.\n` +
      `They are managing ${ctx.activeLeads} active leads with ${ctx.pendingTasks} pending follow-up tasks.\n\n` +
      `Visit the Counselors page to see individual performance metrics including conversions and lead assignments.`;
  }

  // Documents
  if (text.includes('document') || text.includes('required') || text.includes('need')) {
    return '📋 **Required Documents for Admission**\n\nFor a complete application, please keep ready:\n' +
      '1. **Class 10 Marksheet** (verified copy)\n' +
      '2. **Class 12 Marksheet** (verified copy)\n' +
      '3. **ID Proof** (Aadhaar, Passport, or Voter ID)\n' +
      '4. **Entrance Scorecard** (if applicable)\n' +
      '5. **Passport-size Photograph**\n\n' +
      'Upload these through your Student Portal or share with your assigned counselor.';
  }

  // Follow-ups / tasks
  if (text.includes('task') || text.includes('follow') || text.includes('pending') || text.includes('todo') || text.includes('overdue')) {
    return `✅ **Task Overview**\n\n` +
      `You have ${ctx.pendingTasks} pending follow-up tasks in the system.\n` +
      `With ${ctx.activeLeads} active leads, consistent follow-ups are key to improving your ${ctx.conversionRate} conversion rate.\n\n` +
      `💡 **Tip:** Use the Calendar page to view tasks by day and never miss a follow-up again!`;
  }

  // Default context-aware greeting
  return `Hello! I am Asha AI, your admission assistant at **${ctx.institute}**.\n\n` +
    `Here's your current snapshot:\n` +
    `• ${ctx.totalLeads} total leads (${ctx.activeLeads} active)\n` +
    `• ${ctx.admissions} confirmed admissions\n` +
    `• ${ctx.conversionRate} conversion rate\n\n` +
    `I can help with:\n` +
    `• 📊 Real-time analytics & insights\n` +
    `• 🎓 Program & fee details\n` +
    `• 📋 Document requirements\n` +
    `• 📈 Dashboard summaries\n` +
    `• ✅ Task & follow-up tracking\n\n` +
    `What would you like to explore?`;
}

export const chatWithAsha = async (req, res) => {
  const history = req.body?.history || [];
  
  try {
    if (!Array.isArray(history)) {
      return res.status(200).json({ message: 'Hello! I am Asha AI. How can I help you with admissions today?' });
    }

    // If API key configured, use OpenAI with enhanced context
    if (apiKey && apiKey.length >= 15) {
      const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const ctx = await buildContextData();
      
      let systemContext = 'You are Asha AI, an intelligent admission assistant for Rakshpal Bahadur Management Institute (RBMI). ' +
        'Be helpful, concise, and data-driven. Provide specific information when available. ' +
        'If you cannot answer a specific question, guide the user to the right feature or page in the RBMI CRM.';

      if (ctx) {
        systemContext += `\n\nCURRENT INSTITUTE DATA:\n` +
          `Institute: ${ctx.institute}\n` +
          `Total Leads: ${ctx.totalLeads}\n` +
          `Active Leads: ${ctx.activeLeads}\n` +
          `Admissions: ${ctx.admissions}\n` +
          `Conversion Rate: ${ctx.conversionRate}\n` +
          `Counselors: ${ctx.counselorCount}\n` +
          `Pending Tasks: ${ctx.pendingTasks}\n` +
          `Available Programs: ${ctx.courses}\n` +
          `Active Campaigns: ${ctx.campaignCount}`;
      }

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemContext },
            ...history
          ],
          timeout: 10000
        });
        const aiMessage = response.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";
        return res.status(200).json({ message: aiMessage });
      } catch (apiError) {
        console.warn('OpenAI API Error (falling back to context-aware logic):', apiError.message);
        const reply = await contextAwareReply(history);
        return res.status(200).json({ message: reply });
      }
    }

    // Use context-aware fallback
    const reply = await contextAwareReply(history);
    return res.status(200).json({ message: reply });

  } catch (error) {
    console.error('Critical AI Controller Error:', error);
    return res.status(200).json({
      message: 'Hello! I am Asha AI. I am having a brief connectivity issue, but you can always check your Dashboard for real-time stats and analytics.'
    });
  }
};
