import { Router } from 'express';
import { generateDocument, getDocuments } from '../controllers/documents.controller.js';

const router = Router();

router.post('/generate', generateDocument);
router.get('/', getDocuments);

export default router;
