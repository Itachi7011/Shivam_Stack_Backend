// app.js
const express = require('express');
const app = express();
const server = require("http").createServer(app);
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require(`cookie-parser`)
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;

const { initializeSocket } = require('./services/socketService');
// const { Server } = require("socket.io");

const UserRoutes = require('./routes/user_routes');
const AdminRoutes = require('./routes/admin_routes');
const ProductRoutes = require('./routes/product_routes');
const BlogsRoutes = require('./routes/blog_routes');
const CouponsRoutes = require('./routes/coupon_routes');
const ProjectsRoutes = require('./routes/project_routes');
const PublicProductRoutes = require('./routes/public_routes');
const MessagesRoutes = require('./routes/message_routes');
const AnalyticsRoutes = require('./routes/analytics_routes');



// Trust only Render's proxy (more secure)
// app.set('trust proxy', 1); // Trust first proxy only

// Or if using multiple proxies (like Render's load balancer)
// app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// Security middleware

const corsOptions = {
  origin: [
    'http://localhost:5173',
    process.env.PRODUCTION_BASE_FRONTEND_URL
  ], // Your exact frontend URL - NO trailing slash
  credentials: true, // This allows cookies to be sent/received
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['set-cookie'] // Allow frontend to see set-cookie headers
}; 
 
app.use(cors(corsOptions));
app.use(cookieParser())
// Handle preflight requests explicitly
app.options('/{*any}', cors(corsOptions));

// Add this middleware to verify CORS headers are set correctly
// app.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
//   console.log('Origin:', req.headers.origin);
//   console.log('Cookies:', req.cookies);
//   next();
// });

app.use(helmet());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));



// Prevent parameter pollution
app.use(hpp());

// Compression
app.use(compression());

// Routes
// app.use('/api/public', PublicRoutes);
app.use('/api/users', UserRoutes);
app.use('/api/admin', AdminRoutes);
app.use('/api/admin/products', ProductRoutes);
app.use('/api/admin/blogs', BlogsRoutes);
app.use('/api/admin/coupons', CouponsRoutes);
app.use('/api/admin/projects', ProjectsRoutes);
app.use("/api/public", PublicProductRoutes);
app.use("/api/users/messages", MessagesRoutes);
app.use("/api/admin/analytics", AnalyticsRoutes);
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
// app.all('/:id', (req, res) => {
//     res.status(404).json({
//         status: 'error',
//         message: `Can't find ${req.originalUrl} on this server!`
//     });
// });



// app.use((req, res, next) => {
//   console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
//   console.log('✅ Cookies received:', req.cookies); // This should now show cookies
//   console.log('✅ Signed Cookies:', req.signedCookies);
//   console.log('Origin:', req.headers.origin);
//   next();
// });


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


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

initializeSocket(server);


module.exports = app;