const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { clientUrls } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const jobRoutes = require('./routes/jobRoutes');
const matchRoutes = require('./routes/matchRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Railway (and any real host) puts this behind a reverse proxy — without
// this, req.ip is the proxy's own address for every request, which breaks
// per-client rate limiting (see middleware/rateLimiters.js) and anything
// else that needs to tell real clients apart.
app.set('trust proxy', 1);

// Standard security headers (X-Content-Type-Options, X-Frame-Options, etc.).
// CSP is left at helmet's default (off unless configured) — this API serves
// JSON, not HTML, so a content-security-policy header has no real target
// here; the frontend is a separate Next.js deployment with its own headers.
app.use(helmet());

// Whitelist, not a single origin — two separate Vercel deployments (web +
// admin) both need to call this API. `!origin` stays allowed: the KoraPay
// webhook and any other server-to-server call has no browser Origin header
// at all, and rejecting those would break real, non-browser traffic.
app.use(cors({
  origin(origin, callback) {
    if (!origin || clientUrls.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

module.exports = app;