// MongoDB initialization script for Maestro Energy Management System

// Create database and collections
db = db.getSiblingDB('maestro');

// Create users collection with indexes
db.createCollection('users');
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "tuyaUserId": 1 }, { unique: true });
db.users.createIndex({ "createdAt": 1 });

// Create devices collection with indexes
db.createCollection('devices');
db.devices.createIndex({ "userId": 1 });
db.devices.createIndex({ "deviceId": 1 }, { unique: true });
db.devices.createIndex({ "protocol": 1 });
db.devices.createIndex({ "deviceType": 1 });
db.devices.createIndex({ "isOnline": 1 });
db.devices.createIndex({ "lastSeenAt": 1 });

// Create device_commands collection for analytics
db.createCollection('device_commands');
db.device_commands.createIndex({ "deviceId": 1 });
db.device_commands.createIndex({ "userId": 1 });
db.device_commands.createIndex({ "executedAt": 1 });

// Create user_preferences collection
db.createCollection('user_preferences');
db.user_preferences.createIndex({ "userId": 1 }, { unique: true });

// Create sessions collection for active sessions
db.createCollection('sessions');
db.sessions.createIndex({ "userId": 1 });
db.sessions.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

// Create application user
db.createUser({
  user: 'maestro_app',
  pwd: 'maestro_app_password',
  roles: [
    {
      role: 'readWrite',
      db: 'maestro'
    }
  ]
});

print('✅ Maestro database initialized successfully');
print('📊 Collections created: users, devices, device_commands, user_preferences, sessions');
print('🔍 Indexes created for optimal query performance');
print('👤 Application user created: maestro_app');