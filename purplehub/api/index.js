'use strict';
// Vercel runs the API as this one function; vercel.json sends every /api/ request here.
module.exports = require('../server/app').handle;
