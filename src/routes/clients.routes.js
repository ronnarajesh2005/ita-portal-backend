const express = require('express');
const router = express.Router();
const { getAllClients, getClientById, createClient, updateClient, deleteClient } = require('../controllers/clients.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const auditLogger = require('../middleware/auditLogger.middleware');

router.get('/', authenticate, getAllClients);
router.get('/:id', authenticate, getClientById);
router.post('/', authenticate, authorize('admin'), auditLogger('Client'), createClient);
router.put('/:id', authenticate, authorize('admin'), auditLogger('Client'), updateClient);
router.delete('/:id', authenticate, authorize('admin'), auditLogger('Client'), deleteClient);

module.exports = router;