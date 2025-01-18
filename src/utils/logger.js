const { createLogger, format, transports } = require("winston");
const fs = require("fs");
const path = require("path");

// Function to load configuration dynamically from config.json
const loadConfig = () => {
  try {
    const configPath = path.resolve(__dirname, "../../config.json"); // Adjust path as needed
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config.logger || { level: "info", isFileLogging: false }; // Default logger settings
  } catch (err) {
    console.error(`Error loading logger config: ${err.message}`);
    return { level: "info", isFileLogging: false }; // Fallback defaults
  }
};

// Load logger configuration
const { level, isFileLogging } = loadConfig();

// Define custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
};

// Configure the logger instance
const logger = createLogger({
  levels: customLevels.levels,
  level, // Use log level from config
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Inject timestamp into log info
    format.printf((info) => {
      const { timestamp, level, message } = info;
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new transports.Console(), // Always log to console
    ...(isFileLogging
      ? [
          new transports.File({ filename: "logs/error.log", level: "error" }), // Log errors to file
          new transports.File({ filename: "logs/combined.log" }), // Log all messages to file
        ]
      : []), // Add file transports only if file logging is enabled
  ],
});

module.exports = logger;