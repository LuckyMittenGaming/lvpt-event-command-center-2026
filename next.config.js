/** @type {import('next').NextConfig} */
module.exports = {
  outputFileTracingIncludes: {
    '/api/sync/operating-picture': ['./public/v2/js/event-finance.js'],
  },
};
