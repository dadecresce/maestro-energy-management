import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

interface TuyaConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

interface TuyaToken {
  access_token: string;
  expire_time: number;
  refresh_token: string;
  uid: string;
}

export class TuyaApiService {
  private config: TuyaConfig;
  private client: AxiosInstance;
  private token: TuyaToken | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.config = {
      clientId: process.env.TUYA_CLIENT_ID || '',
      clientSecret: process.env.TUYA_CLIENT_SECRET || '',
      baseUrl: process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com'
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request interceptor to add auth headers
    this.client.interceptors.request.use(async (config) => {
      const token = await this.ensureValidToken();
      if (token && config.headers) {
        const timestamp = Date.now().toString();
        const nonce = Math.random().toString(36).substring(7);
        const method = config.method?.toUpperCase() || 'GET';
        const path = config.url || '';
        const body = config.data ? JSON.stringify(config.data) : '';

        const signature = this.generateSignature(timestamp, nonce, method, path, body);

        config.headers['client_id'] = this.config.clientId;
        config.headers['access_token'] = token.access_token;
        config.headers['t'] = timestamp;
        config.headers['sign_method'] = 'HMAC-SHA256';
        config.headers['nonce'] = nonce;
        config.headers['sign'] = signature;
      }
      return config;
    });
  }

  private generateSignature(timestamp: string, nonce: string, method: string, path: string, body = ''): string {
    const stringToSign = [
      method.toUpperCase(),
      crypto.createHash('sha256').update(body, 'utf8').digest('hex'),
      '',
      path
    ].join('\n');

    const signStr = this.config.clientId + timestamp + nonce + stringToSign;
    return crypto.createHmac('sha256', this.config.clientSecret)
      .update(signStr, 'utf8')
      .digest('hex')
      .toUpperCase();
  }

  private async ensureValidToken(): Promise<TuyaToken | null> {
    if (this.token && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    await this.getAccessToken();
    return this.token;
  }

  async getAccessToken(): Promise<boolean> {
    try {
      const timestamp = Date.now().toString();
      const nonce = Math.random().toString(36).substring(7);
      const method = 'GET';
      const path = '/v1.0/token?grant_type=1';
      
      const signature = this.generateSignature(timestamp, nonce, method, path);
      
      const response = await axios.get(`${this.config.baseUrl}${path}`, {
        headers: {
          'client_id': this.config.clientId,
          't': timestamp,
          'sign_method': 'HMAC-SHA256',
          'nonce': nonce,
          'sign': signature
        }
      });

      if (response.data.success) {
        this.token = response.data.result;
        // Set expiry 5 minutes before actual expiry for safety
        this.tokenExpiry = Date.now() + ((this.token!.expire_time - 300) * 1000);
        console.log('✅ Tuya token obtained successfully');
        return true;
      }

      console.error('❌ Failed to get Tuya token:', response.data);
      return false;
    } catch (error) {
      console.error('❌ Error getting Tuya token:', error);
      return false;
    }
  }

  async discoverDevices(): Promise<any[]> {
    try {
      // For linked accounts, we need to get the user ID first
      // Try to get user info from the token
      const tokenInfo = await this.getTokenInfo();
      if (tokenInfo && tokenInfo.uid) {
        console.log(`Found user ID: ${tokenInfo.uid}, getting devices...`);
        const devices = await this.getUserDevices(tokenInfo.uid);
        if (devices.length > 0) {
          return devices;
        }
      }

      // Try device list endpoint (works for some accounts)
      console.log('Trying direct device list...');
      const response = await this.client.get('/v1.0/iot-03/devices');
      
      if (response.data.success && response.data.result) {
        console.log(`Found ${response.data.result.length} devices!`);
        return response.data.result;
      }

      // Try home-based discovery
      console.log('Trying home-based discovery...');
      const homeResponse = await this.client.get('/v1.0/iot-03/users/homes');
      if (homeResponse.data.success && homeResponse.data.result?.length > 0) {
        console.log(`Found ${homeResponse.data.result.length} homes`);
        
        // Get devices from all homes
        const allDevices = [];
        for (const home of homeResponse.data.result) {
          try {
            const devicesResponse = await this.client.get(`/v1.0/homes/${home.home_id}/devices`);
            if (devicesResponse.data.success && devicesResponse.data.result) {
              allDevices.push(...devicesResponse.data.result);
            }
          } catch (e) {
            console.log(`Failed to get devices for home ${home.home_id}`);
          }
        }
        
        if (allDevices.length > 0) {
          console.log(`Found ${allDevices.length} devices across all homes!`);
          return allDevices;
        }
      }

      console.log('No devices found through any method');
      return [];
    } catch (error: any) {
      console.error('Error discovering devices:', error.response?.data || error.message);
      return [];
    }
  }

  async getTokenInfo(): Promise<any> {
    try {
      if (this.token) {
        return this.token;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getUserDevices(userId: string): Promise<any[]> {
    try {
      const response = await this.client.get(`/v1.0/users/${userId}/devices`);
      
      if (response.data.success) {
        return response.data.result || [];
      }

      console.error('Failed to get user devices:', response.data);
      return [];
    } catch (error: any) {
      console.error('Error getting user devices:', error.response?.data || error.message);
      return [];
    }
  }

  async getDeviceStatus(deviceId: string): Promise<any[]> {
    try {
      const response = await this.client.get(`/v1.0/devices/${deviceId}/status`);
      
      if (response.data.success) {
        return response.data.result || [];
      }

      console.error('Failed to get device status:', response.data);
      return [];
    } catch (error: any) {
      console.error('Error getting device status:', error.response?.data || error.message);
      return [];
    }
  }

  async getDeviceDetails(deviceId: string): Promise<any> {
    try {
      const response = await this.client.get(`/v1.0/devices/${deviceId}`);
      
      if (response.data.success) {
        return response.data.result;
      }

      console.error('Failed to get device details:', response.data);
      return null;
    } catch (error: any) {
      console.error('Error getting device details:', error.response?.data || error.message);
      return null;
    }
  }

  async controlDevice(deviceId: string, commands: Array<{code: string, value: any}>): Promise<boolean> {
    try {
      const response = await this.client.post(`/v1.0/devices/${deviceId}/commands`, {
        commands
      });
      
      if (response.data.success) {
        console.log('✅ Device command sent successfully');
        return true;
      }

      console.error('Failed to control device:', response.data);
      return false;
    } catch (error: any) {
      console.error('Error controlling device:', error.response?.data || error.message);
      return false;
    }
  }

  // Convert Tuya device to our format
  convertTuyaDevice(tuyaDevice: any): any {
    const capabilities = [];
    
    // Parse functions/capabilities from device schema
    if (tuyaDevice.schema) {
      try {
        const schema = typeof tuyaDevice.schema === 'string' 
          ? JSON.parse(tuyaDevice.schema) 
          : tuyaDevice.schema;
          
        schema.forEach((item: any) => {
          if (item.code === 'switch_1' || item.code === 'switch' || item.code === 'switch_led') {
            capabilities.push({
              type: 'switch',
              properties: { value: false },
              commands: ['on', 'off']
            });
          } else if (item.code === 'cur_power' || item.code === 'add_ele') {
            capabilities.push({
              type: 'power_monitoring',
              properties: {},
              commands: []
            });
          } else if (item.code === 'bright_value' || item.code === 'brightness') {
            capabilities.push({
              type: 'brightness',
              properties: { value: item.value || 100 },
              commands: ['setBrightness']
            });
          }
        });
      } catch (e) {
        console.log('Failed to parse schema:', e);
      }
    }

    // If no schema, infer from category
    if (capabilities.length === 0) {
      const category = tuyaDevice.category || '';
      if (category === 'cz' || category === 'pc' || category === 'kg') {
        capabilities.push({
          type: 'switch',
          properties: { value: false },
          commands: ['on', 'off']
        });
      }
    }

    // Parse current status
    if (tuyaDevice.status) {
      tuyaDevice.status.forEach((status: any) => {
        // Update capability properties with current values
        if ((status.code === 'switch_1' || status.code === 'switch') && capabilities.length > 0) {
          const switchCap = capabilities.find(c => c.type === 'switch');
          if (switchCap) {
            switchCap.properties.value = status.value;
          }
        }
      });
    }

    // Build status object
    const status: any = {
      online: tuyaDevice.online || false
    };

    if (tuyaDevice.status) {
      tuyaDevice.status.forEach((s: any) => {
        if (s.code === 'switch_1' || s.code === 'switch') {
          status.switch = s.value;
        } else if (s.code === 'cur_power') {
          status.energy = status.energy || {};
          status.energy.activePower = s.value / 10; // Convert from 0.1W to W
        } else if (s.code === 'cur_voltage') {
          status.energy = status.energy || {};
          status.energy.voltage = s.value / 10; // Convert from 0.1V to V
        } else if (s.code === 'cur_current') {
          status.energy = status.energy || {};
          status.energy.current = s.value / 1000; // Convert from mA to A
        }
      });
    }

    return {
      deviceId: tuyaDevice.id,
      name: tuyaDevice.name || tuyaDevice.product_name || 'Unknown Device',
      deviceType: this.mapTuyaCategory(tuyaDevice.category),
      isOnline: tuyaDevice.online || false,
      capabilities,
      specifications: {
        manufacturer: 'Tuya',
        model: tuyaDevice.product_id || 'Unknown',
        maxPower: 3000 // Default, could be parsed from schema
      },
      status,
      tuyaData: {
        uuid: tuyaDevice.uuid,
        category: tuyaDevice.category,
        productId: tuyaDevice.product_id,
        productName: tuyaDevice.product_name,
        icon: tuyaDevice.icon,
        ip: tuyaDevice.ip,
        timeZone: tuyaDevice.time_zone
      }
    };
  }

  private mapTuyaCategory(category: string): string {
    const categoryMap: Record<string, string> = {
      'cz': 'smart_plug',
      'pc': 'smart_plug',
      'kg': 'smart_switch',
      'dj': 'smart_light',
      'dc': 'led_strip',
      'jsq': 'smart_heater',
      'cl': 'smart_curtain',
      'ckmkzq': 'smart_sensor',
      'wk': 'smart_thermostat',
      'default': 'smart_device'
    };

    return categoryMap[category] || categoryMap['default'];
  }

  // Get user info from OAuth token
  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await this.client.get('/v1.0/users/me', {
        headers: {
          'access_token': accessToken
        }
      });
      
      if (response.data.success) {
        return response.data.result;
      }

      return null;
    } catch (error) {
      console.error('Error getting user info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const tuyaApiService = new TuyaApiService();