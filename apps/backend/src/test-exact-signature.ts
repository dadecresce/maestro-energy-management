#!/usr/bin/env node

/**
 * Test exact signature matching the working Node.js script
 */

import * as https from 'https';
import * as crypto from 'crypto';

const TUYA_CLIENT_ID = 'eg3gy8ccn5k5nvuvegch';
const TUYA_CLIENT_SECRET = '9eb5e8c0f81a40c6a2e4b396e5906089';
const TUYA_BASE_URL = 'https://openapi.tuyaeu.com';

// Exact signature generation from working script
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

// Make request function
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

async function testDeviceAccess() {
  console.log('🔌 Testing Device Access with Exact Signature');
  console.log('=============================================\n');

  // Step 1: Get token (this works)
  console.log('1️⃣ Getting access token...');
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
      const { access_token, uid } = response.data.result;
      console.log('✅ Token obtained successfully');
      console.log(`   Token UID: ${uid}`);
      
      // Step 2: Try device access with FRESH signature
      console.log('\n2️⃣ Testing device access...');
      
      // Try general devices endpoint first
      const deviceTimestamp = Date.now().toString();
      const deviceNonce = Math.random().toString(36).substring(7);
      const deviceMethod = 'GET';
      const devicePath = '/v1.0/devices';
      
      console.log('Request details:');
      console.log(`  Method: ${deviceMethod}`);
      console.log(`  Path: ${devicePath}`);
      console.log(`  Timestamp: ${deviceTimestamp}`);
      console.log(`  Nonce: ${deviceNonce}`);
      
      const deviceSignature = generateSignature(
        TUYA_CLIENT_ID, 
        TUYA_CLIENT_SECRET, 
        deviceTimestamp, 
        deviceNonce, 
        deviceMethod, 
        devicePath
      );
      
      console.log(`  Signature: ${deviceSignature}`);
      
      const deviceHeaders = {
        'client_id': TUYA_CLIENT_ID,
        'access_token': access_token,
        't': deviceTimestamp,
        'sign_method': 'HMAC-SHA256',
        'nonce': deviceNonce,
        'sign': deviceSignature
      };

      const deviceResponse = await makeRequest(deviceMethod, devicePath, null, deviceHeaders);
      console.log('\n📱 Device API Response:');
      console.log(`   Status: ${deviceResponse.status}`);
      console.log(`   Data:`, JSON.stringify(deviceResponse.data, null, 2));
      
      if (deviceResponse.data.success && deviceResponse.data.result) {
        console.log(`\n🎉 SUCCESS! Found ${deviceResponse.data.result.length} devices!`);
        deviceResponse.data.result.forEach((device: any, index: number) => {
          console.log(`\n   Device ${index + 1}:`);
          console.log(`   📱 Name: ${device.name}`);
          console.log(`   🆔 ID: ${device.id}`);
          console.log(`   📡 Online: ${device.online ? '✅' : '❌'}`);
          console.log(`   🔌 Category: ${device.category}`);
        });
      } else {
        console.log('❌ Still getting error - may need different API or additional setup');
      }
      
    } else {
      console.error('❌ Failed to get token:', response.data);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run test
testDeviceAccess().catch(console.error);