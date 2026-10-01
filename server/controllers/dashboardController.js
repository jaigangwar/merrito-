import * as db from '../supabase.js';

export const getStats = async (req, res) => {
  try {
    const filterCounselorId = req.user.role === 'counselor' ? req.user.counselor_id : req.query.counselor_id;
    let leads;
    if (filterCounselorId) {
      leads = await db.getLeads({ counselor_id: filterCounselorId });
    } else {
      leads = await db.getLeads({});
    }
    const counselors = await db.getCounselors();

    const totalLeads = leads.length;
    const activeApplications = leads.filter(l => ['application_submitted', 'documents_verified'].includes(l.stage)).length;
    const admissions = leads.filter(l => l.stage === 'admitted' || l.stage === 'enrolled').length;
    const conversionRate = totalLeads > 0 ? ((admissions / totalLeads) * 100).toFixed(1) : '0';

    const stageDistribution = {};
    leads.forEach(l => { stageDistribution[l.stage] = (stageDistribution[l.stage] || 0) + 1; });

    const sourceDistribution = {};
    leads.forEach(l => { sourceDistribution[l.source] = (sourceDistribution[l.source] || 0) + 1; });

    const priorityDistribution = { high: 0, medium: 0, low: 0 };
    leads.forEach(l => { if (priorityDistribution[l.priority] !== undefined) priorityDistribution[l.priority]++; });

    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), year: d.getFullYear(), month: d.getMonth() });
    }

    const monthlyEnquiries = months.map(m => leads.filter(l => { const d = new Date(l.created_at); return d.getFullYear() === m.year && d.getMonth() === m.month; }).length);
    const monthlyAdmissions = months.map(m => leads.filter(l => { const d = new Date(l.updated_at); return d.getFullYear() === m.year && d.getMonth() === m.month && (l.stage === 'admitted' || l.stage === 'enrolled'); }).length);
    const monthlyEnrollments = months.map(m => leads.filter(l => { const d = new Date(l.updated_at); return d.getFullYear() === m.year && d.getMonth() === m.month && l.stage === 'enrolled'; }).length);

    const globalLeads = req.user.role === 'counselor' ? await db.getLeads({}) : leads;
    const counselorStats = counselors.map(c => {
      const assigned = globalLeads.filter(l => l.counselor_id === c.id).length;
      const converted = globalLeads.filter(l => l.counselor_id === c.id && (l.stage === 'admitted' || l.stage === 'enrolled')).length;
      return { ...c, leads_assigned: assigned, conversions: converted, active_leads: globalLeads.filter(l => l.counselor_id === c.id && !['admitted', 'enrolled'].includes(l.stage)).length };
    });

    res.json({
      scope: 'global',
      requestRole: req.user.role,
      requestCounselorId: req.user.counselor_id || null,
      totalLeads, activeApplications, admissions,
      conversionRate: parseFloat(conversionRate),
      stageDistribution, sourceDistribution, priorityDistribution,
      monthly: { labels: months.map(m => m.label), enquiries: monthlyEnquiries, admissions: monthlyAdmissions, enrollments: monthlyEnrollments },
      counselorStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
