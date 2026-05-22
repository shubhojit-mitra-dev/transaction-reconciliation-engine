import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
  const base = `${ts} [${level}]: ${message}`;
  return stack ? `${base}\n${stack}${metaStr}` : `${base}${metaStr}`;
});

/**
 * Shared logger used across all packages.
 *
 * - Development: pretty-printed, colorized output for readability.
 * - Production:  structured JSON output, compatible with AWS CloudWatch Logs Insights.
 *
 * Log level is controlled via the LOG_LEVEL environment variable (default: 'info').
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    errors({ stack: true }), // Ensures Error objects include their stack trace
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : combine(colorize(), devFormat),
  ),
  transports: [new winston.transports.Console()],
  exitOnError: false,
});
