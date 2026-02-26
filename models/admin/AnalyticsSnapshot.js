const mongoose = require("mongoose");

const AnalyticSnapshotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    metrics: {
      totalUsers: { type: Number, default: 0 },
      activeUsers: { type: Number, default: 0 },
      totalOrders: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 },
      [String]: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  `${process.env.APP_NAME}_AnalyticSnapshot`,
  AnalyticSnapshotSchema,
);
