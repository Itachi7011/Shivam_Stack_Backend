const mongoose = require("mongoose");
const keepAlive = require("../scheduler/keepAlive");

class SchedulerManager {
  constructor() {
    this.jobs = [];
  }

  async initialize() {
    // Wait for DB connection if not ready
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) =>
        mongoose.connection.once("open", resolve)
      );
    }

    // Start the keep-alive scheduler
    const keepAliveJob = keepAlive.startScheduler();
    this.jobs.push(keepAliveJob);

    console.log(
      "Scheduler initialized: Keep-Alive running every 1 minute"
    );
  }

  stopAll() {
    this.jobs.forEach((job) => job.stop());
    console.log("All schedulers stopped");
  }
}

module.exports = new SchedulerManager();