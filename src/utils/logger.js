/**
 * Logger utility
 * ใช้สำหรับ print log เป็นชั้น
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.INFO;

const formatLog = (level, message, data = '') => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] ${level}`;
  return `${prefix} - ${message} ${data}`;
};

const logger = {
  debug: (message, data = '') => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(formatLog('DEBUG', message, data));
    }
  },

  info: (message, data = '') => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(formatLog('INFO', message, data));
    }
  },

  warn: (message, data = '') => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(formatLog('WARN', message, data));
    }
  },

  error: (message, data = '') => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(formatLog('ERROR', message, data));
    }
  },
};

module.exports = logger;
