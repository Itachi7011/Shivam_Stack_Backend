const cron = require("node-cron");
const User = require("../models/users/User"); // your User model path

class KeepAlive {
  startScheduler() {
    console.log("Keep-alive scheduler started (every 1 minute)");

    const job = cron.schedule("* * * * *", async () => {
      try {
        // Determine backend URL based on environment
        const backendURL =
          process.env.NODE_ENV === "production"
            ? process.env.PRODUCTION_BASE_BACKEND_URL
            : process.env.DEVELOPMENT_BASE_BACKEND_URL;

        if (!backendURL) {
          console.warn(
            "[KeepAlive] Backend URL not set in environment variables"
          );
          return;
        }

        // Fetch system health
        const res = await fetch(`${backendURL}/api/public/system-health`);
        const data = await res.json();

        console.log(
          `[KeepAlive] Ping at ${new Date().toISOString()} - status:`,
          data?.success ? "OK" : "FAIL"
        );

        // Count total users
        const totalUsers = await User.countDocuments().catch(() => 0);
        console.log(`[KeepAlive] Total Users: ${totalUsers}`);
      } catch (err) {
        console.error(
          `[KeepAlive] Error at ${new Date().toISOString()}:`,
          err.message
        );
      }
    });

    return job;
  }
}

module.exports = new KeepAlive();