import express from 'express';
import {
  getApplications, exportApplicationsCSV, createApplication, updateApplication,
  getQueries, createQuery, updateQuery,
  getPayments, exportPaymentsCSV, createPayment, updatePayment,
  getLetterTemplates, createLetterTemplate, updateLetterTemplate,
  getOfferLetters, generateOfferLetter
} from '../controllers/applicationController.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

router.get('/applications', requireAuth, getApplications);
router.get('/applications/export/csv', requireAuth, exportApplicationsCSV);
router.post('/applications', requireAuth, createApplication);
router.put('/applications/:id', requireAuth, updateApplication);

router.get('/queries', requireAuth, getQueries);
router.post('/queries', requireAuth, createQuery);
router.put('/queries/:id', requireAuth, updateQuery);

router.get('/payments', requireAuth, getPayments);
router.get('/payments/export/csv', requireAuth, exportPaymentsCSV);
router.post('/payments', requireAuth, createPayment);
router.put('/payments/:id', requireAuth, updatePayment);

router.get('/letter-templates', requireAuth, getLetterTemplates);
router.post('/letter-templates', requireAuth, createLetterTemplate);
router.put('/letter-templates/:id', requireAuth, updateLetterTemplate);

router.get('/offer-letters', requireAuth, getOfferLetters);
router.post('/offer-letters/generate', requireAuth, generateOfferLetter);

export default router;

