require('dotenv').config();
require('./src/config/db');

const app = require('./src/app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`ITA backend running on port ${PORT}`);
});