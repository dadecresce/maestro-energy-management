import { 
  DeviceCommand, 
  ProtocolType, 
  DeviceType, 
  CapabilityType 
} from '@maestro/shared/types';

/**
 * Validation Utilities for Protocol Adapters
 * 
 * Common validation functions used across different protocol adapters
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate device ID format for different protocols
 */
export function validateDeviceId(deviceId: string, protocol: ProtocolType): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  if (!deviceId || typeof deviceId !== 'string') {
    result.errors.push('Device ID must be a non-empty string');
    result.isValid = false;
    return result;
  }
  
  const trimmedId = deviceId.trim();
  if (trimmedId.length === 0) {
    result.errors.push('Device ID cannot be empty or whitespace only');
    result.isValid = false;
    return result;
  }
  
  switch (protocol) {
    case 'tuya':
      if (!/^[a-zA-Z0-9]+$/.test(trimmedId)) {
        result.errors.push('Tuya device ID must be alphanumeric');
        result.isValid = false;
      }
      if (trimmedId.length < 10) {
        result.errors.push('Tuya device ID must be at least 10 characters');
        result.isValid = false;
      }
      if (trimmedId.length > 50) {
        result.warnings.push('Tuya device ID is unusually long');
      }
      break;
      
    case 'modbus':
      // Modbus device IDs can be IP:port:unitId format or just numeric unit ID
      if (!/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+:\d+|\d+)$/.test(trimmedId)) {
        result.errors.push('Modbus device ID must be in format "IP:port:unitId" or just "unitId"');
        result.isValid = false;
      }
      break;
      
    case 'mqtt':
      // MQTT device IDs are typically topic-like paths
      if (!/^[a-zA-Z0-9\/_-]+$/.test(trimmedId)) {
        result.errors.push('MQTT device ID must contain only alphanumeric characters, underscores, hyphens, and forward slashes');
        result.isValid = false;
      }
      if (trimmedId.startsWith('/') || trimmedId.endsWith('/')) {
        result.warnings.push('MQTT device ID should not start or end with forward slash');
      }
      break;
      
    default:
      result.warnings.push(`Unknown protocol ${protocol}, using generic validation`);
      if (trimmedId.length > 100) {
        result.warnings.push('Device ID is very long');
      }
  }
  
  return result;
}

/**
 * Validate device command structure and parameters
 */
export function validateDeviceCommand(
  command: DeviceCommand,
  supportedCommands: string[] = [],
  deviceCapabilities: CapabilityType[] = []
): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  // Basic structure validation
  if (!command.command || typeof command.command !== 'string') {
    result.errors.push('Command must have a valid command string');
    result.isValid = false;
  }
  
  if (!command.deviceId || typeof command.deviceId !== 'string') {
    result.errors.push('Command must have a valid device ID');
    result.isValid = false;
  }
  
  if (command.parameters && typeof command.parameters !== 'object') {
    result.errors.push('Command parameters must be an object');
    result.isValid = false;
  }
  
  // If we have early validation failures, return now
  if (!result.isValid) {
    return result;
  }
  
  // Command-specific validation
  const cmd = command.command.toLowerCase();
  
  // Check if command is supported
  if (supportedCommands.length > 0 && !supportedCommands.includes(cmd)) {
    result.errors.push(`Command '${cmd}' is not supported. Supported commands: ${supportedCommands.join(', ')}`);
    result.isValid = false;
  }
  
  // Validate common commands
  switch (cmd) {
    case 'turn_on':
    case 'turn_off':
      if (!deviceCapabilities.includes('switch')) {
        result.errors.push('Device does not support switch capability for on/off commands');
        result.isValid = false;
      }
      if (command.parameters && Object.keys(command.parameters).length > 0) {
        result.warnings.push('On/off commands typically do not require parameters');
      }
      break;
      
    case 'set_brightness':
    case 'set_dimmer':
      if (!deviceCapabilities.includes('dimmer')) {
        result.errors.push('Device does not support dimmer capability');
        result.isValid = false;
      }
      
      const brightness = command.parameters?.brightness || command.parameters?.value;
      if (brightness === undefined) {
        result.errors.push('Brightness/dimmer commands require a brightness or value parameter');
        result.isValid = false;
      } else if (typeof brightness !== 'number' || brightness < 0 || brightness > 100) {
        result.errors.push('Brightness value must be a number between 0 and 100');
        result.isValid = false;
      }
      break;
      
    case 'set_temperature':
      if (!deviceCapabilities.includes('thermostat')) {
        result.errors.push('Device does not support thermostat capability');
        result.isValid = false;
      }
      
      const temperature = command.parameters?.temperature;
      if (temperature === undefined) {
        result.errors.push('Temperature commands require a temperature parameter');
        result.isValid = false;
      } else if (typeof temperature !== 'number') {
        result.errors.push('Temperature must be a number');
        result.isValid = false;
      } else if (temperature < -50 || temperature > 100) {
        result.warnings.push('Temperature value seems outside normal range (-50 to 100°C)');
      }
      break;
      
    case 'schedule':
      if (!deviceCapabilities.includes('scheduler')) {
        result.warnings.push('Device may not support scheduling capability');
      }
      
      const schedule = command.parameters?.schedule;
      if (!schedule) {
        result.errors.push('Schedule commands require schedule parameters');
        result.isValid = false;
      } else {
        const scheduleValidation = validateScheduleParameters(schedule);
        result.errors.push(...scheduleValidation.errors);
        result.warnings.push(...scheduleValidation.warnings);
        if (!scheduleValidation.isValid) {
          result.isValid = false;
        }
      }
      break;
  }
  
  return result;
}

/**
 * Validate schedule parameters
 */
function validateScheduleParameters(schedule: any): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  if (!schedule.startTime) {
    result.errors.push('Schedule must have a start time');
    result.isValid = false;
  } else if (!/^\d{2}:\d{2}$/.test(schedule.startTime)) {
    result.errors.push('Start time must be in HH:MM format');
    result.isValid = false;
  }
  
  if (schedule.endTime && !/^\d{2}:\d{2}$/.test(schedule.endTime)) {
    result.errors.push('End time must be in HH:MM format');
    result.isValid = false;
  }
  
  if (schedule.daysOfWeek) {
    if (!Array.isArray(schedule.daysOfWeek)) {
      result.errors.push('Days of week must be an array');
      result.isValid = false;
    } else {
      for (const day of schedule.daysOfWeek) {
        if (typeof day !== 'number' || day < 0 || day > 6) {
          result.errors.push('Days of week must be numbers between 0 (Sunday) and 6 (Saturday)');
          result.isValid = false;
          break;
        }
      }
    }
  }
  
  return result;
}

/**
 * Validate network configuration for different protocols
 */
export function validateNetworkConfig(config: any, protocol: ProtocolType): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  switch (protocol) {
    case 'tuya':
      if (!config.clientId) {
        result.errors.push('Tuya configuration requires clientId');
        result.isValid = false;
      }
      if (!config.clientSecret) {
        result.errors.push('Tuya configuration requires clientSecret');
        result.isValid = false;
      }
      if (config.baseUrl && !/^https?:\/\/.+/.test(config.baseUrl)) {
        result.errors.push('Tuya baseUrl must be a valid HTTP/HTTPS URL');
        result.isValid = false;
      }
      if (config.region && !['us', 'eu', 'cn', 'in'].includes(config.region)) {
        result.warnings.push('Tuya region should be one of: us, eu, cn, in');
      }
      break;
      
    case 'modbus':
      if (!config.host) {
        result.errors.push('Modbus configuration requires host');
        result.isValid = false;
      } else if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(config.host)) {
        result.warnings.push('Modbus host should be a valid IP address');
      }
      
      if (config.port && (typeof config.port !== 'number' || config.port < 1 || config.port > 65535)) {
        result.errors.push('Modbus port must be a number between 1 and 65535');
        result.isValid = false;
      }
      
      if (config.unitId && (typeof config.unitId !== 'number' || config.unitId < 1 || config.unitId > 255)) {
        result.errors.push('Modbus unit ID must be a number between 1 and 255');
        result.isValid = false;
      }
      break;
      
    case 'mqtt':
      if (!config.brokerUrl) {
        result.errors.push('MQTT configuration requires brokerUrl');
        result.isValid = false;
      } else if (!/^mqtts?:\/\/.+/.test(config.brokerUrl)) {
        result.errors.push('MQTT brokerUrl must start with mqtt:// or mqtts://');
        result.isValid = false;
      }
      
      if (config.qos && (typeof config.qos !== 'number' || config.qos < 0 || config.qos > 2)) {
        result.errors.push('MQTT QoS must be 0, 1, or 2');
        result.isValid = false;
      }
      
      if (config.keepAlive && (typeof config.keepAlive !== 'number' || config.keepAlive < 1)) {
        result.errors.push('MQTT keepAlive must be a positive number');
        result.isValid = false;
      }
      break;
  }
  
  return result;
}

/**
 * Validate device capability definition
 */
export function validateDeviceCapability(capability: any): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  if (!capability.type) {
    result.errors.push('Capability must have a type');
    result.isValid = false;
  }
  
  if (!capability.commands || !Array.isArray(capability.commands)) {
    result.errors.push('Capability must have a commands array');
    result.isValid = false;
  }
  
  if (capability.properties && typeof capability.properties !== 'object') {
    result.errors.push('Capability properties must be an object');
    result.isValid = false;
  }
  
  // Validate range if present
  if (capability.range) {
    if (typeof capability.range.min !== 'number' || typeof capability.range.max !== 'number') {
      result.errors.push('Capability range must have numeric min and max values');
      result.isValid = false;
    } else if (capability.range.min >= capability.range.max) {
      result.errors.push('Capability range min must be less than max');
      result.isValid = false;
    }
    
    if (capability.range.step && typeof capability.range.step !== 'number') {
      result.errors.push('Capability range step must be a number');
      result.isValid = false;
    }
  }
  
  return result;
}

/**
 * Validate timeout values
 */
export function validateTimeout(timeout: number, name: string = 'timeout'): ValidationResult {
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };
  
  if (typeof timeout !== 'number') {
    result.errors.push(`${name} must be a number`);
    result.isValid = false;
    return result;
  }
  
  if (timeout <= 0) {
    result.errors.push(`${name} must be positive`);
    result.isValid = false;
  } else if (timeout < 1000) {
    result.warnings.push(`${name} is very short (< 1 second)`);
  } else if (timeout > 300000) {
    result.warnings.push(`${name} is very long (> 5 minutes)`);
  }
  
  return result;
}

/**
 * Sanitize and normalize device name
 */
export function sanitizeDeviceName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'Unnamed Device';
  }
  
  // Remove special characters but keep spaces, hyphens, and underscores
  const sanitized = name
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 50); // Limit length
    
  return sanitized || 'Unnamed Device';
}

/**
 * Validate IP address format
 */
export function validateIPAddress(ip: string): boolean {
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipRegex);
  
  if (!match) {
    return false;
  }
  
  return match.slice(1).every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validate MAC address format
 */
export function validateMACAddress(mac: string): boolean {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
}

/**
 * Create a comprehensive validation report
 */
export function createValidationReport(results: ValidationResult[]): {
  isValid: boolean;
  totalErrors: number;
  totalWarnings: number;
  summary: string;
  details: ValidationResult[];
} {
  const totalErrors = results.reduce((sum, result) => sum + result.errors.length, 0);
  const totalWarnings = results.reduce((sum, result) => sum + result.warnings.length, 0);
  const isValid = results.every(result => result.isValid);
  
  let summary = `Validation ${isValid ? 'passed' : 'failed'}`;
  if (totalErrors > 0) {
    summary += ` with ${totalErrors} error${totalErrors === 1 ? '' : 's'}`;
  }
  if (totalWarnings > 0) {
    summary += ` and ${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}`;
  }
  
  return {
    isValid,
    totalErrors,
    totalWarnings,
    summary,
    details: results
  };
}