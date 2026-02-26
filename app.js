// app.js
const express = require('express');
const app = express();
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');



const PORT = process.env.PORT || 5000;


const PublicRoutes = require('./routes/user_routes');
const AdminRoutes = require('./routes/admin_routes');



// Trust only Render's proxy (more secure)
// app.set('trust proxy', 1); // Trust first proxy only

// Or if using multiple proxies (like Render's load balancer)
// app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Security middleware

app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));



// Prevent parameter pollution
app.use(hpp());

// Compression
app.use(compression());

// Routes
app.use('/api/public', PublicRoutes);
app.use('/api/admin', AdminRoutes);

// Add this test route to your app.js
app.get('/api/test-cors-block', (req, res) => {
    console.log('✅ CORS TEST: Request reached the server');
    res.json({
        message: 'If you see this, CORS did NOT block the request',
        origin: req.headers.origin
    });
});


app.get('/api/test', (req, res) => {
    res.send("Successfully reaches");
})










// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// 404 handler
app.all('/:id', (req, res) => {
    res.status(404).json({
        status: 'error',
        message: `Can't find ${req.originalUrl} on this server!`
    });
});



app.use((req, res, next) => {
    console.log('Request came in:', req.method, req.url);
    next();
});


app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content
});



// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Start server

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


module.exports = app;