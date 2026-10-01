// ===== MULTI-LANGUAGE ROUTES =====
import express from 'express';
import { requireAuth, requireAdmin } from '../auth.js';
import {
  getSupportedLanguages,
  getTranslations,
  updateTranslations,
  getUserLanguage,
  setUserLanguage,
  translateText
} from '../controllers/multiLanguageController.js';

const router = express.Router();

router.get('/languages', getSupportedLanguages);
router.get('/translations', getTranslations);
router.put('/translations', requireAdmin, updateTranslations);
router.get('/user/language', requireAuth, getUserLanguage);
router.put('/user/language', requireAuth, setUserLanguage);
router.post('/translate', requireAuth, translateText);

export default router;
