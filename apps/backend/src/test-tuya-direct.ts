#!/usr/bin/env node

/**
 * Direct Tuya API test to find user devices
 */

import * as https from 'https';
import * as crypto from 'crypto';

// Your NEW Smart Home Project Credentials
const TUYA_CLIENT_ID = 'eg3gy8ccn5k5nvuvegch';
const TUYA_CLIENT_SECRET = '9eb5e8c0f81a40c6a2e4b396e5906089';
const TUYA_BASE_URL = 'https://openapi.tuyaeu.com';

// Utility function to make HTTP requests
function makeRequest(method: string, path: string, data: any = null, headers: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TUYA_BASE_URL);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Generate Tuya API signature
function generateSignature(clientId: string, secret: string, timestamp: string, nonce: string, method: string, path: string, body = ''): string {
  const stringToSign = [
    method.toUpperCase(),
    crypto.createHash('sha256').update(body, 'utf8').digest('hex'),
    '',
    path
  ].join('\n');

  const signStr = clientId + timestamp + nonce + stringToSign;
  return crypto.createHmac('sha256', secret).update(signStr, 'utf8').digest('hex').toUpperCase();
}

// Get access token
async function getAccessToken() {
  console.log('🔑 Getting Tuya access token...');
  
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(7);
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  
  const signature = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method, path);
  
  const headers = {
    'client_id': TUYA_CLIENT_ID,
    't': timestamp,
    'sign_method': 'HMAC-SHA256',
    'nonce': nonce,
    'sign': signature
  };

  try {
    const response = await makeRequest(method, path, null, headers);
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Successfully got access token');
      console.log(`   UID: ${response.data.result.uid}`);
      return response.data.result;
    } else {
      console.error('❌ Failed to get access token:', response.data);
      return null;
    }
  } catch (error: any) {
    console.error('❌ Error getting access token:', error.message);
    return null;
  }
}

// Try different device discovery methods using CURRENT APIs
async function discoverDevices(accessToken: string, uid?: string) {
  console.log('\n🔍 Trying current Tuya API endpoints...');
  
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(7);
  
  // Try method 1: Smart Home Basic Service - User devices
  if (uid) {
    console.log(`\n1️⃣ Trying /v1.0/users/${uid}/devices (Smart Home Basic)`);
    const method = 'GET';
    const path = `/v1.0/users/${uid}/devices`;
    
    const signature = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method, path);
    
    const headers = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature
    };

    try {
      const response = await makeRequest(method, path, null, headers);
      console.log('Response:', response.status, response.data);
      if (response.data.success && response.data.result) {
        return response.data.result;
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  // Try method 2: Smart Home Device Management API
  console.log('\n2️⃣ Trying /v1.0/devices');
  try {
    const method2 = 'GET';
    const path2 = '/v1.0/devices';
    const signature2 = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method2, path2);
    
    const headers2 = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature2
    };

    const response2 = await makeRequest(method2, path2, null, headers2);
    console.log('Response:', response2.status, response2.data);
    if (response2.data.success && response2.data.result) {
      return response2.data.result;
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Try method 3: Try with correct user device endpoint
  if (uid) {
    console.log(`\n3️⃣ Trying /v1.3/iot-03/users/${uid}/devices`);
    const method3 = 'GET';
    const path3 = `/v1.3/iot-03/users/${uid}/devices`;
    
    const signature3 = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method3, path3);
    
    const headers3 = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature3
    };

    try {
      const response3 = await makeRequest(method3, path3, null, headers3);
      console.log('Response:', response3.status, response3.data);
      if (response3.data.success && response3.data.result) {
        return response3.data.result;
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  // Try method 3: Get homes
  console.log('\n3️⃣ Trying /v1.0/users/homes');
  try {
    const method3 = 'GET';
    const path3 = '/v1.0/users/homes';
    const signature3 = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method3, path3);
    
    const headers3 = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature3
    };

    const response3 = await makeRequest(method3, path3, null, headers3);
    console.log('Response:', response3.status, response3.data);
  } catch (error) {
    console.error('Error:', error);
  }

  // Try method 4: Different endpoint format
  console.log('\n4️⃣ Trying /v1.0/devices (direct)');
  try {
    const method4 = 'GET';
    const path4 = '/v1.0/devices';
    const signature4 = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method4, path4);
    
    const headers4 = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature4
    };

    const response4 = await makeRequest(method4, path4, null, headers4);
    console.log('Response:', response4.status, response4.data);
    if (response4.data.success && response4.data.result) {
      return response4.data.result;
    }
  } catch (error) {
    console.error('Error:', error);
  }

  return [];
}

// Main function
async function main() {
  console.log('🔌 Tuya Direct API Test');
  console.log('======================\n');
  
  // Get token
  const tokenInfo = await getAccessToken();
  if (!tokenInfo) {
    console.log('Failed to get token');
    return;
  }

  const { access_token, uid } = tokenInfo;
  console.log(`\n📝 Got UID from token: ${uid}`);
  
  // Use your confirmed EU UID from linked Smart Life account
  const confirmedUID = 'eu16535380887856wHEr';
  console.log(`\n📝 Using your confirmed UID: ${confirmedUID}`);
  
  // Try to discover devices with your confirmed UID
  const devices = await discoverDevices(access_token, confirmedUID);
  
  if (devices && devices.length > 0) {
    console.log(`\n✅ Found ${devices.length} devices!`);
    devices.forEach((device: any, index: number) => {
      console.log(`\nDevice ${index + 1}:`);
      console.log(`  Name: ${device.name}`);
      console.log(`  ID: ${device.id}`);
      console.log(`  Online: ${device.online}`);
      console.log(`  Category: ${device.category}`);
    });
  } else {
    console.log('\n❌ No devices found');
    console.log('\nPossible reasons:');
    console.log('1. No devices linked to this Cloud Project');
    console.log('2. Need to link devices via Tuya IoT Platform');
    console.log('3. Region mismatch (using US region)');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}