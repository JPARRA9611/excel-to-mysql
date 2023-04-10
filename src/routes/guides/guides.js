const express = require('express');
const router = express.Router();
const Controller = require('./controller');

router.route("/").get(Controller.getImportGuides);

router.route('/').post(Controller.importGuides);

router.route('/excel').post(Controller.exportDataToExcel);

module.exports = router;