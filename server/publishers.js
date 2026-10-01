const publisherAdapters = {
  'Shiksha': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || '',
    phone: data.mobile || data.phone || '',
    course_id: null,
    course: data.course || data.course_name || '',
    source: 'Shiksha',
    city: data.city || '',
    notes: data.notes || data.message || data.query || ''
  }),

  'CollegeDekho': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || '',
    phone: data.mobile_no || data.phone || '',
    course_id: null,
    course: data.course || data.course_name || data.course_interested || '',
    source: 'CollegeDekho',
    city: data.city || '',
    notes: data.notes || data.remarks || ''
  }),

  'Facebook Ads': (data) => ({
    first_name: data.first_name || data.fb_name?.split(' ')[0] || data.leadgen_name?.split(' ')[0] || '',
    last_name: data.last_name || data.fb_name?.split(' ').slice(1).join(' ') || data.leadgen_name?.split(' ').slice(1).join(' ') || '',
    email: data.email || data.fb_email || '',
    phone: data.phone || data.fb_phone || data.mobile || '',
    course_id: null,
    course: data.course || '',
    source: 'Facebook Ads',
    city: data.city || '',
    notes: data.notes || data.fb_form_name ? `Via form: ${data.fb_form_name}` : ''
  }),

  'Google Ads': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || data.google_email || '',
    phone: data.phone || data.google_phone || '',
    course_id: null,
    course: data.course || data.course_name || '',
    source: 'Google Ads',
    city: data.city || '',
    notes: data.notes || data.gclid ? `Campaign: ${data.campaign || 'N/A'}` : ''
  }),

  'Website': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || '',
    phone: data.phone || data.mobile || '',
    course_id: null,
    course: data.course || data.course_name || '',
    source: 'Website',
    city: data.city || '',
    notes: data.notes || ''
  }),

  'JustDial': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || '',
    phone: data.phone || data.mobile || '',
    course_id: null,
    course: data.course || '',
    source: 'JustDial',
    city: data.city || '',
    notes: data.notes || data.remarks || ''
  }),

  'Referral': (data) => ({
    first_name: data.first_name || data.name?.split(' ')[0] || '',
    last_name: data.last_name || data.name?.split(' ').slice(1).join(' ') || '',
    email: data.email || '',
    phone: data.phone || '',
    course_id: null,
    course: data.course || '',
    source: 'Referral',
    city: data.city || '',
    notes: data.notes ? `Referred by: ${data.notes}` : ''
  })
};

const VALID_PUBLISHERS = Object.keys(publisherAdapters);

export function getPublisher(publisherName) {
  return publisherAdapters[publisherName] || null;
}

export function getValidPublishers() {
  return [...VALID_PUBLISHERS];
}

export function normalizeLeadFromPublisher(publisher, data) {
  const adapter = publisherAdapters[publisher];
  if (!adapter) return null;
  return adapter(data);
}

export function detectPublisher(source) {
  if (!source) return null;
  const match = VALID_PUBLISHERS.find(p => p.toLowerCase() === source.toLowerCase());
  if (match) return match;
  const fuzzy = VALID_PUBLISHERS.find(p => source.toLowerCase().includes(p.toLowerCase()));
  return fuzzy || null;
}
