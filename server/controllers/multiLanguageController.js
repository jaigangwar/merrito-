// ===== MULTI-LANGUAGE CONTROLLER - i18n Support =====
import { generateId, getDB, saveDB } from '../db.js';

// Supported languages
const SUPPORTED_LANGUAGES = {
  en: 'English',
  hi: 'हिंदी (Hindi)',
  mr: 'मराठी (Marathi)',
  gu: 'ગુજરાતી (Gujarati)',
  ta: 'தமிழ் (Tamil)',
  te: 'తెలుగు (Telugu)',
  kn: 'ಕನ್ನಡ (Kannada)',
  ml: 'മലയാളം (Malayalam)',
  bn: 'বাংলা (Bengali)',
  pa: 'ਪੰਜਾਬੀ (Punjabi)'
};

// Default translations
const DEFAULT_TRANSLATIONS = {
  en: {
    welcome: 'Welcome to RBMI',
    login: 'Login',
    signup: 'Sign Up',
    dashboard: 'Dashboard',
    leads: 'Leads',
    applications: 'Applications',
    courses: 'Courses',
    counselors: 'Counselors',
    reports: 'Reports',
    settings: 'Settings',
    logout: 'Logout',
    submit: 'Submit',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    search: 'Search',
    filter: 'Filter',
    export: 'Export',
    import: 'Import',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    status: 'Status',
    actions: 'Actions'
  },
  hi: {
    welcome: 'RBMI में आपका स्वागत है',
    login: 'लॉगिन',
    signup: 'साइन अप',
    dashboard: 'डैशबोर्ड',
    leads: 'लीड्स',
    applications: 'आवेदन',
    courses: 'पाठ्यक्रम',
    counselors: 'परामर्शदाता',
    reports: 'रिपोर्ट',
    settings: 'सेटिंग्स',
    logout: 'लॉगआउट',
    submit: 'जमा करें',
    cancel: 'रद्द करें',
    save: 'सहेजें',
    delete: 'हटाएं',
    edit: 'संपादित करें',
    search: 'खोजें',
    filter: 'फ़िल्टर',
    export: 'निर्यात',
    import: 'आयात',
    name: 'नाम',
    email: 'ईमेल',
    phone: 'फोन',
    status: 'स्थिति',
    actions: 'कार्रवाई'
  }
};

// Get supported languages
export async function getSupportedLanguages(req, res) {
  try {
    const languages = Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({
      code,
      name
    }));

    res.json({ data: languages, total: languages.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get translations for language
export async function getTranslations(req, res) {
  try {
    const { lang = 'en' } = req.query;

    if (!SUPPORTED_LANGUAGES[lang]) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const dbData = getDB();
    const customTranslations = dbData.translations?.[lang] || {};
    const defaultTranslations = DEFAULT_TRANSLATIONS[lang] || DEFAULT_TRANSLATIONS.en;

    const translations = {
      ...defaultTranslations,
      ...customTranslations
    };

    res.json({
      language: lang,
      language_name: SUPPORTED_LANGUAGES[lang],
      translations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Update translations (Admin only)
export async function updateTranslations(req, res) {
  try {
    const { lang, translations } = req.body;

    if (!lang || !translations) {
      return res.status(400).json({ error: 'lang and translations are required' });
    }

    if (!SUPPORTED_LANGUAGES[lang]) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const dbData = getDB();
    if (!dbData.translations) dbData.translations = {};
    if (!dbData.translations[lang]) dbData.translations[lang] = {};

    // Merge with existing translations
    dbData.translations[lang] = {
      ...dbData.translations[lang],
      ...translations
    };

    saveDB(dbData);

    res.json({
      success: true,
      language: lang,
      updated_keys: Object.keys(translations).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Get user language preference
export async function getUserLanguage(req, res) {
  try {
    const userId = req.user.id;
    const dbData = getDB();
    const userPrefs = dbData.user_preferences?.[userId] || {};

    res.json({
      language: userPrefs.language || 'en',
      language_name: SUPPORTED_LANGUAGES[userPrefs.language || 'en']
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Set user language preference
export async function setUserLanguage(req, res) {
  try {
    const { language } = req.body;
    const userId = req.user.id;

    if (!language) {
      return res.status(400).json({ error: 'language is required' });
    }

    if (!SUPPORTED_LANGUAGES[language]) {
      return res.status(400).json({ error: 'Unsupported language' });
    }

    const dbData = getDB();
    if (!dbData.user_preferences) dbData.user_preferences = {};
    if (!dbData.user_preferences[userId]) dbData.user_preferences[userId] = {};

    dbData.user_preferences[userId].language = language;
    saveDB(dbData);

    res.json({
      success: true,
      language,
      language_name: SUPPORTED_LANGUAGES[language]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Translate text (using external API or local)
export async function translateText(req, res) {
  try {
    const { text, from = 'en', to } = req.body;

    if (!text || !to) {
      return res.status(400).json({ error: 'text and to language are required' });
    }

    // Mock translation for now
    // In production, integrate with Google Translate API or similar
    const translated = `[${to.toUpperCase()}] ${text}`;

    res.json({
      success: true,
      original: text,
      translated,
      from,
      to
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
