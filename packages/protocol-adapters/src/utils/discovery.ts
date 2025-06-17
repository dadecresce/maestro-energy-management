import { DeviceDiscovery, ProtocolType, DeviceType } from '@maestro/shared/types';

/**
 * Device Discovery Utilities
 * 
 * Helper functions for device discovery across different protocols
 */

export interface DiscoveryFilter {
  protocols?: ProtocolType[];
  deviceTypes?: DeviceType[];
  online?: boolean;
  manufacturer?: string;
  model?: string;
  capabilities?: string[];
  minConfidence?: number;
}

/**
 * Filter discovered devices based on criteria
 */
export function filterDiscoveries(
  discoveries: DeviceDiscovery[],
  filter: DiscoveryFilter
): DeviceDiscovery[] {
  return discoveries.filter(discovery => {
    // Protocol filter
    if (filter.protocols && !filter.protocols.includes(discovery.protocol)) {
      return false;
    }
    
    // Device type filter
    if (filter.deviceTypes && !filter.deviceTypes.includes(discovery.deviceType)) {
      return false;
    }
    
    // Manufacturer filter
    if (filter.manufacturer && 
        discovery.specifications.manufacturer?.toLowerCase() !== filter.manufacturer.toLowerCase()) {
      return false;
    }
    
    // Model filter
    if (filter.model && 
        discovery.specifications.model?.toLowerCase() !== filter.model.toLowerCase()) {
      return false;
    }
    
    // Capabilities filter
    if (filter.capabilities) {
      const deviceCapabilities = discovery.capabilities.map(cap => cap.type);
      const hasAllCapabilities = filter.capabilities.every(cap => 
        deviceCapabilities.includes(cap)
      );
      if (!hasAllCapabilities) {
        return false;
      }
    }
    
    // Confidence filter
    if (filter.minConfidence && discovery.confidence < filter.minConfidence) {
      return false;
    }
    
    return true;
  });
}

/**
 * Sort discoveries by various criteria
 */
export function sortDiscoveries(
  discoveries: DeviceDiscovery[],
  sortBy: 'confidence' | 'name' | 'protocol' | 'deviceType' | 'discoveredAt',
  direction: 'asc' | 'desc' = 'desc'
): DeviceDiscovery[] {
  const sorted = [...discoveries].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'confidence':
        comparison = a.confidence - b.confidence;
        break;
        
      case 'name':
        const nameA = a.name || a.deviceId;
        const nameB = b.name || b.deviceId;
        comparison = nameA.localeCompare(nameB);
        break;
        
      case 'protocol':
        comparison = a.protocol.localeCompare(b.protocol);
        break;
        
      case 'deviceType':
        comparison = a.deviceType.localeCompare(b.deviceType);
        break;
        
      case 'discoveredAt':
        comparison = a.discoveredAt.getTime() - b.discoveredAt.getTime();
        break;
    }
    
    return direction === 'desc' ? -comparison : comparison;
  });
  
  return sorted;
}

/**
 * Group discoveries by protocol
 */
export function groupByProtocol(
  discoveries: DeviceDiscovery[]
): Record<ProtocolType, DeviceDiscovery[]> {
  const groups: Partial<Record<ProtocolType, DeviceDiscovery[]>> = {};
  
  for (const discovery of discoveries) {
    if (!groups[discovery.protocol]) {
      groups[discovery.protocol] = [];
    }
    groups[discovery.protocol]!.push(discovery);
  }
  
  return groups as Record<ProtocolType, DeviceDiscovery[]>;
}

/**
 * Group discoveries by device type
 */
export function groupByDeviceType(
  discoveries: DeviceDiscovery[]
): Record<DeviceType, DeviceDiscovery[]> {
  const groups: Partial<Record<DeviceType, DeviceDiscovery[]>> = {};
  
  for (const discovery of discoveries) {
    if (!groups[discovery.deviceType]) {
      groups[discovery.deviceType] = [];
    }
    groups[discovery.deviceType]!.push(discovery);
  }
  
  return groups as Record<DeviceType, DeviceDiscovery[]>;
}

/**
 * Remove duplicate discoveries (same deviceId)
 */
export function deduplicateDiscoveries(
  discoveries: DeviceDiscovery[]
): DeviceDiscovery[] {
  const seen = new Set<string>();
  const deduplicated: DeviceDiscovery[] = [];
  
  for (const discovery of discoveries) {
    if (!seen.has(discovery.deviceId)) {
      seen.add(discovery.deviceId);
      deduplicated.push(discovery);
    }
  }
  
  return deduplicated;
}

/**
 * Merge discoveries with higher confidence taking precedence
 */
export function mergeDiscoveries(
  discoveries: DeviceDiscovery[]
): DeviceDiscovery[] {
  const deviceMap = new Map<string, DeviceDiscovery>();
  
  for (const discovery of discoveries) {
    const existing = deviceMap.get(discovery.deviceId);
    
    if (!existing || discovery.confidence > existing.confidence) {
      deviceMap.set(discovery.deviceId, discovery);
    }
  }
  
  return Array.from(deviceMap.values());
}

/**
 * Get discovery statistics
 */
export function getDiscoveryStats(discoveries: DeviceDiscovery[]) {
  const stats = {
    total: discoveries.length,
    byProtocol: {} as Record<string, number>,
    byDeviceType: {} as Record<string, number>,
    averageConfidence: 0,
    highConfidence: 0, // confidence >= 0.8
    mediumConfidence: 0, // confidence >= 0.5 && < 0.8
    lowConfidence: 0, // confidence < 0.5
    withName: 0,
    withNetworkInfo: 0
  };
  
  let totalConfidence = 0;
  
  for (const discovery of discoveries) {
    // Count by protocol
    stats.byProtocol[discovery.protocol] = (stats.byProtocol[discovery.protocol] || 0) + 1;
    
    // Count by device type
    stats.byDeviceType[discovery.deviceType] = (stats.byDeviceType[discovery.deviceType] || 0) + 1;
    
    // Confidence statistics
    totalConfidence += discovery.confidence;
    
    if (discovery.confidence >= 0.8) {
      stats.highConfidence++;
    } else if (discovery.confidence >= 0.5) {
      stats.mediumConfidence++;
    } else {
      stats.lowConfidence++;
    }
    
    // Additional statistics
    if (discovery.name) {
      stats.withName++;
    }
    
    if (discovery.networkInfo) {
      stats.withNetworkInfo++;
    }
  }
  
  stats.averageConfidence = discoveries.length > 0 ? totalConfidence / discoveries.length : 0;
  
  return stats;
}

/**
 * Validate discovery data
 */
export function validateDiscovery(discovery: DeviceDiscovery): string[] {
  const errors: string[] = [];
  
  if (!discovery.deviceId || discovery.deviceId.trim().length === 0) {
    errors.push('Device ID is required');
  }
  
  if (!discovery.protocol) {
    errors.push('Protocol is required');
  }
  
  if (!discovery.deviceType) {
    errors.push('Device type is required');
  }
  
  if (discovery.confidence < 0 || discovery.confidence > 1) {
    errors.push('Confidence must be between 0 and 1');
  }
  
  if (!discovery.discoveredAt || discovery.discoveredAt > new Date()) {
    errors.push('Discovery date must be valid and not in the future');
  }
  
  if (!discovery.capabilities || discovery.capabilities.length === 0) {
    errors.push('At least one capability is required');
  }
  
  return errors;
}

/**
 * Create a discovery summary for logging/reporting
 */
export function createDiscoverySummary(discoveries: DeviceDiscovery[]): string {
  const stats = getDiscoveryStats(discoveries);
  
  const protocolSummary = Object.entries(stats.byProtocol)
    .map(([protocol, count]) => `${protocol}: ${count}`)
    .join(', ');
    
  const deviceTypeSummary = Object.entries(stats.byDeviceType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  
  return [
    `Discovered ${stats.total} devices`,
    `Protocols: ${protocolSummary}`,
    `Device Types: ${deviceTypeSummary}`,
    `Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`,
    `High/Medium/Low Confidence: ${stats.highConfidence}/${stats.mediumConfidence}/${stats.lowConfidence}`
  ].join(' | ');
}