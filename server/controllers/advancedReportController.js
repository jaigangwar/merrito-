// ===== ADVANCED REPORT CONTROLLER - Custom Reports & Analytics =====
import * as db from '../supabase.js';
import { generateId, getDB, saveDB } from '../db.js';

// Generate custom report
export async function generateCustomReport(req, res) {
  try {
    const {
      report_type,
      date_from,
      date_to,
      filters
    } = req.body;

    const leads = await db.getLeads({});
    const counselors = await db.getCounselors();
    const courses = await db.getCourses();

    let reportData = {};

    switch (report_type) {
      case 'conversion_funnel':
        reportData = generateConversionFunnel(leads, date_from, date_to);
        break;
      
      case 'source_effectiveness':
        reportData = generateSourceEffectiveness(leads, date_from, date_to);
        break;
      
      case 'counselor_performance':
        reportData = generateCounselorPerformance(leads, counselors, date_from, date_to);
        break;
      
      case 'revenue_forecast':
        reportData = generateRevenueForecast(leads, courses, date_from, date_to);
        break;
      
      case 'cohort_analysis':
        reportData = generateCohortAnalysis(leads, date_from, date_to);
        break;
      
      case 'lead_quality':
        reportData = generateLeadQualityReport(leads, date_from, date_to);
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    res.json({
      report_type,
      date_from,
      date_to,
      generated_at: new Date().toISOString(),
      data: reportData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function generateConversionFunnel(leads, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  
  const stages = {
    enquiry: filtered.filter(l => l.stage === 'enquiry').length,
    counseling_scheduled: filtered.filter(l => ['counseling_scheduled', 'counseling_done', 'application_submitted', 'documents_verified', 'admitted', 'enrolled'].includes(l.stage)).length,
    counseling_done: filtered.filter(l => ['counseling_done', 'application_submitted', 'documents_verified', 'admitted', 'enrolled'].includes(l.stage)).length,
    application_submitted: filtered.filter(l => ['application_submitted', 'documents_verified', 'admitted', 'enrolled'].includes(l.stage)).length,
    documents_verified: filtered.filter(l => ['documents_verified', 'admitted', 'enrolled'].includes(l.stage)).length,
    admitted: filtered.filter(l => ['admitted', 'enrolled'].includes(l.stage)).length,
    enrolled: filtered.filter(l => l.stage === 'enrolled').length
  };

  const conversionRates = {
    enquiry_to_counseling: stages.enquiry > 0 ? ((stages.counseling_scheduled / stages.enquiry) * 100).toFixed(2) : 0,
    counseling_to_application: stages.counseling_scheduled > 0 ? ((stages.application_submitted / stages.counseling_scheduled) * 100).toFixed(2) : 0,
    application_to_admission: stages.application_submitted > 0 ? ((stages.admitted / stages.application_submitted) * 100).toFixed(2) : 0,
    admission_to_enrollment: stages.admitted > 0 ? ((stages.enrolled / stages.admitted) * 100).toFixed(2) : 0,
    overall: stages.enquiry > 0 ? ((stages.enrolled / stages.enquiry) * 100).toFixed(2) : 0
  };

  return { stages, conversion_rates: conversionRates };
}

function generateSourceEffectiveness(leads, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  
  const sources = {};
  filtered.forEach(lead => {
    if (!sources[lead.source]) {
      sources[lead.source] = {
        total: 0,
        enquiry: 0,
        admitted: 0,
        enrolled: 0,
        conversion_rate: 0
      };
    }
    sources[lead.source].total++;
    if (lead.stage === 'enquiry') sources[lead.source].enquiry++;
    if (lead.stage === 'admitted') sources[lead.source].admitted++;
    if (lead.stage === 'enrolled') sources[lead.source].enrolled++;
  });

  Object.keys(sources).forEach(source => {
    sources[source].conversion_rate = sources[source].total > 0 
      ? ((sources[source].enrolled / sources[source].total) * 100).toFixed(2)
      : 0;
  });

  return sources;
}

function generateCounselorPerformance(leads, counselors, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  
  const performance = counselors.map(counselor => {
    const counselorLeads = filtered.filter(l => l.counselor_id === counselor.id);
    const admitted = counselorLeads.filter(l => l.stage === 'admitted' || l.stage === 'enrolled').length;
    const enrolled = counselorLeads.filter(l => l.stage === 'enrolled').length;
    
    return {
      counselor_id: counselor.id,
      counselor_name: counselor.name,
      total_leads: counselorLeads.length,
      admitted: admitted,
      enrolled: enrolled,
      conversion_rate: counselorLeads.length > 0 ? ((enrolled / counselorLeads.length) * 100).toFixed(2) : 0,
      avg_lead_score: counselorLeads.length > 0 
        ? (counselorLeads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / counselorLeads.length).toFixed(2)
        : 0
    };
  });

  return performance.sort((a, b) => b.conversion_rate - a.conversion_rate);
}

function generateRevenueForecast(leads, courses, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
  
  let totalRevenue = 0;
  let projectedRevenue = 0;
  
  filtered.forEach(lead => {
    const course = courseMap[lead.course_id];
    if (!course) return;
    
    const fee = parseInt(course.fee.replace(/[^0-9]/g, '')) || 0;
    
    if (lead.stage === 'enrolled') {
      totalRevenue += fee;
    } else if (['admitted', 'documents_verified', 'application_submitted'].includes(lead.stage)) {
      projectedRevenue += fee * 0.7; // 70% probability
    }
  });

  return {
    confirmed_revenue: totalRevenue,
    projected_revenue: projectedRevenue,
    total_forecast: totalRevenue + projectedRevenue,
    enrolled_students: filtered.filter(l => l.stage === 'enrolled').length,
    pipeline_students: filtered.filter(l => ['admitted', 'documents_verified', 'application_submitted'].includes(l.stage)).length
  };
}

function generateCohortAnalysis(leads, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  
  const cohorts = {};
  filtered.forEach(lead => {
    const month = new Date(lead.created_at).toISOString().slice(0, 7); // YYYY-MM
    if (!cohorts[month]) {
      cohorts[month] = {
        total: 0,
        enrolled: 0,
        retention_rate: 0
      };
    }
    cohorts[month].total++;
    if (lead.stage === 'enrolled') cohorts[month].enrolled++;
  });

  Object.keys(cohorts).forEach(month => {
    cohorts[month].retention_rate = cohorts[month].total > 0
      ? ((cohorts[month].enrolled / cohorts[month].total) * 100).toFixed(2)
      : 0;
  });

  return cohorts;
}

function generateLeadQualityReport(leads, dateFrom, dateTo) {
  const filtered = filterByDate(leads, dateFrom, dateTo);
  
  const avgScore = filtered.length > 0
    ? (filtered.reduce((sum, l) => sum + (l.lead_score || 0), 0) / filtered.length).toFixed(2)
    : 0;

  const scoreDistribution = {
    high: filtered.filter(l => (l.lead_score || 0) >= 70).length,
    medium: filtered.filter(l => (l.lead_score || 0) >= 40 && (l.lead_score || 0) < 70).length,
    low: filtered.filter(l => (l.lead_score || 0) < 40).length
  };

  const priorityDistribution = {
    high: filtered.filter(l => l.priority === 'high').length,
    medium: filtered.filter(l => l.priority === 'medium').length,
    low: filtered.filter(l => l.priority === 'low').length
  };

  return {
    average_score: avgScore,
    score_distribution: scoreDistribution,
    priority_distribution: priorityDistribution,
    total_leads: filtered.length
  };
}

function filterByDate(leads, dateFrom, dateTo) {
  let filtered = leads;
  
  if (dateFrom) {
    filtered = filtered.filter(l => new Date(l.created_at) >= new Date(dateFrom));
  }
  if (dateTo) {
    filtered = filtered.filter(l => new Date(l.created_at) <= new Date(dateTo));
  }
  
  return filtered;
}

// Schedule report
export async function scheduleReport(req, res) {
  try {
    const { report_type, frequency, recipients, filters } = req.body;

    if (!report_type || !frequency || !recipients) {
      return res.status(400).json({ error: 'report_type, frequency, and recipients are required' });
    }

    const dbData = getDB();
    if (!dbData.scheduled_reports) dbData.scheduled_reports = [];

    const schedule = {
      id: generateId(),
      report_type,
      frequency, // daily, weekly, monthly
      recipients: recipients, // array of emails
      filters: filters || {},
      status: 'active',
      last_run: null,
      next_run: calculateNextRun(frequency),
      created_at: new Date().toISOString()
    };

    dbData.scheduled_reports.push(schedule);
    saveDB(dbData);

    res.status(201).json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function calculateNextRun(frequency) {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      now.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      break;
    case 'monthly':
      now.setMonth(now.getMonth() + 1);
      break;
  }
  return now.toISOString();
}
