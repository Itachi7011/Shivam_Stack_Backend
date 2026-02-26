// services/tokenService.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

class TokenService {
  generateAuthTokens(userId) {
    const accessToken = jwt.sign(
      { userId, type: "access" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: process.env.JWT_ACCESS_EXPIRE || "7d" },
    );

    const refreshToken = jwt.sign(
      { userId, type: "refresh" },
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
      { expiresIn: process.env.JWT_REFRESH_EXPIRE || "30d" },
    );

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
  }

  verifyRefreshToken(token) {
    return jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
    );
  }

  generateRandomToken() {
    return crypto.randomBytes(32).toString("hex");
  }


  generateAdminTokens(adminId) {
    const accessToken = jwt.sign(
      { adminId, type: "admin_access" },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: process.env.JWT_ADMIN_ACCESS_EXPIRE || "4h" },
    );

    const refreshToken = jwt.sign(
      { adminId, type: "admin_refresh" },
      process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key",
      { expiresIn: process.env.JWT_ADMIN_REFRESH_EXPIRE || "7d" },
    );

    return { accessToken, refreshToken };
  }
}

module.exports = new TokenService();
