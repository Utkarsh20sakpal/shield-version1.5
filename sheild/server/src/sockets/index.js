import { Server } from 'socket.io';
import { sendThresholdAlertEmail, sendMaintenanceHeadNotification } from '../utils/emailService.js';
import Machine from '../models/Machine.js';

export const initializeSockets = (httpServer, logger) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = [
    process.env.CLIENT_ORIGIN,
    // Development origins (only in development)
    ...(isProduction ? [] : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ]),
  ].filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (isProduction) {
          return allowedOrigins.includes(origin)
            ? callback(null, true)
            : callback(new Error('CORS not allowed'), false);
        }
        // Dev: allow any localhost port, 127.0.0.1 port, or private network IP
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
        if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true);
        if (/^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}:\d+$/.test(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed'), false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // namespace for real-time sensors
  const sensorsNamespace = io.of('/sensors');
  sensorsNamespace.on('connection', (socket) => {
    logger.info(`Sensors namespace connected: ${socket.id}`);
  });

  // namespace for alerts
  const alertsNamespace = io.of('/alerts');
  alertsNamespace.on('connection', (socket) => {
    logger.info(`Alerts namespace connected: ${socket.id}`);
  });

  // Mock emitter for demo: broadcasts random sensor data every 2s
  const machineIds = ['M-1001', 'M-1002', 'M-1003'];
  setInterval(async () => {
    const payload = machineIds.map((id, idx) => {
      // Generate values that will ensure multiple machines trigger alerts
      // Machine 1: Moderate risk (high severity)
      // Machine 2: High risk (critical severity) 
      // Machine 3: Low risk (no alert)
      const vibration = 20 + idx * 8 + Math.random() * 5; // 20-35 range
      const temperature = 70 + idx * 5 + Math.random() * 4; // 70-85 range
      const current = 8 + idx * 2 + Math.random();
      const healthScore = Math.max(0, 100 - vibration * 1.8 - Math.max(0, temperature - 60));
      return {
        machineId: id,
        timestamp: new Date().toISOString(),
        vibration: Number(vibration.toFixed(2)),
        temperature: Number(temperature.toFixed(2)),
        current: Number(current.toFixed(2)),
        healthScore: Number(healthScore.toFixed(0)),
      };
    });
    sensorsNamespace.emit('sensor_update', payload);

    // Check thresholds for each machine and create detailed alerts
    for (const p of payload) {
      let alertTriggered = false;
      let alertData = null;

      // Check temperature threshold
      if (p.temperature > 85) {
        alertData = {
          machineId: p.machineId,
          severity: p.temperature > 95 ? 'critical' : 'high',
          message: `Temperature critical: ${p.temperature}°C`,
          timestamp: new Date().toISOString(),
          status: 'open',
          sensorReadings: {
            temperature: p.temperature,
            vibration: p.vibration,
            current: p.current,
            healthScore: p.healthScore
          },
          thresholdValue: 85,
          thresholdType: 'temperature',
          maintenanceHeadNotified: false
        };
        alertTriggered = true;
      }
      // Check vibration threshold
      else if (p.vibration > 30) {
        alertData = {
          machineId: p.machineId,
          severity: p.vibration > 40 ? 'critical' : 'high',
          message: `High vibration detected: ${p.vibration} mm/s`,
          timestamp: new Date().toISOString(),
          status: 'open',
          sensorReadings: {
            temperature: p.temperature,
            vibration: p.vibration,
            current: p.current,
            healthScore: p.healthScore
          },
          thresholdValue: 30,
          thresholdType: 'vibration',
          maintenanceHeadNotified: false
        };
        alertTriggered = true;
      }
      // Check health score threshold
      else if (p.healthScore < 40) {
        alertData = {
          machineId: p.machineId,
          severity: p.healthScore < 25 ? 'critical' : 'high',
          message: `Low health score: ${p.healthScore}`,
          timestamp: new Date().toISOString(),
          status: 'open',
          sensorReadings: {
            temperature: p.temperature,
            vibration: p.vibration,
            current: p.current,
            healthScore: p.healthScore
          },
          thresholdValue: 40,
          thresholdType: 'healthScore',
          maintenanceHeadNotified: false
        };
        alertTriggered = true;
      }

      if (alertTriggered && alertData) {
        console.log('Emitting detailed alert:', alertData);
        alertsNamespace.emit('alert', alertData);

        // Send email notification to maintenance head (async operation)
        (async () => {
          try {
            const machine = await Machine.findOne({ machineId: p.machineId });
            if (machine && machine.maintenanceHead && machine.maintenanceHead.email && machine.alertSettings?.notifyMaintenanceHead) {
              const emailResult = await sendThresholdAlertEmail(alertData, machine.maintenanceHead);
              if (emailResult.success) {
                console.log(`Email sent to maintenance head for machine ${p.machineId}: ${emailResult.messageId}`);
              } else {
                console.warn(`Failed to send email to maintenance head for machine ${p.machineId}:`, emailResult.error);
              }
            }
          } catch (emailError) {
            // Defensive: catch any unexpected errors to prevent socket crash
            console.error('Unexpected error sending email notification:', emailError.message);
          }
        })();

        // Emit maintenance notification
        alertsNamespace.emit('maintenance_alert', {
          ...alertData,
          maintenanceHeadNotified: true,
          notificationSentAt: new Date().toISOString()
        });
      }
    }
  }, 2000);

  return io;
};


