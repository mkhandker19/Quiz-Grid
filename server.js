// Quiz App Server
// This file will be set up in the next commit

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Basic server setup - will be expanded in next commits
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

