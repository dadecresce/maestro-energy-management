#!/usr/bin/env node

/**
 * Maestro Energy Management - Tuya API Test Script
 * This script tests your Tuya credentials and basic device operations
 */

const https = require('https');
const crypto = require('crypto');

// Your Tuya Credentials
const TUYA_CLIENT_ID = 'y43wphs7xtv3afpkedt5';
const TUYA_CLIENT_SECRET = '8b58edbaeb904394be476973e21e878f';
const TUYA_BASE_URL = 'https://openapi.tuyaus.com';

// Utility function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
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
function generateSignature(clientId, secret, timestamp, nonce, method, path, body = '') {
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
      console.log(`   Token expires in: ${response.data.result.expire_time} seconds`);
      return response.data.result.access_token;
    } else {
      console.error('❌ Failed to get access token:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting access token:', error.message);
    return null;
  }
}

// Get user devices
async function getUserDevices(accessToken, uid) {
  console.log('\n📱 Getting user devices...');
  
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(7);
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
    
    if (response.status === 200 && response.data.success) {
      const devices = response.data.result;
      console.log(`✅ Found ${devices.length} devices`);
      
      devices.forEach((device, index) => {
        console.log(`\n   Device ${index + 1}:`);
        console.log(`   📱 Name: ${device.name}`);
        console.log(`   🆔 ID: ${device.id}`);
        console.log(`   📡 Online: ${device.online ? '✅' : '❌'}`);
        console.log(`   🔌 Category: ${device.category}`);
        console.log(`   ⚡ Functions: ${device.functions ? device.functions.map(f => f.code).join(', ') : 'None'}`);
      });
      
      return devices;
    } else {
      console.error('❌ Failed to get devices:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return [];
    }
  } catch (error) {
    console.error('❌ Error getting devices:', error.message);
    return [];
  }
}

// Control device (toggle switch)
async function controlDevice(accessToken, deviceId, switchState) {
  console.log(`\n🎮 Controlling device ${deviceId}...`);
  console.log(`   Setting switch to: ${switchState ? 'ON' : 'OFF'}`);
  
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(7);
  const method = 'POST';
  const path = `/v1.0/devices/${deviceId}/commands`;
  
  const commands = [{
    code: 'switch_1',
    value: switchState
  }];
  
  const body = JSON.stringify({ commands });
  const signature = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method, path, body);
  
  const headers = {
    'client_id': TUYA_CLIENT_ID,
    'access_token': accessToken,
    't': timestamp,
    'sign_method': 'HMAC-SHA256',
    'nonce': nonce,
    'sign': signature
  };

  try {
    const response = await makeRequest(method, path, { commands }, headers);
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Device command sent successfully');
      console.log(`   Result: ${JSON.stringify(response.data.result)}`);
      return true;
    } else {
      console.error('❌ Failed to control device:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error controlling device:', error.message);
    return false;
  }
}

// Get device status
async function getDeviceStatus(accessToken, deviceId) {
  console.log(`\n📊 Getting device status for ${deviceId}...`);
  
  const timestamp = Date.now().toString();
  const nonce = Math.random().toString(36).substring(7);
  const method = 'GET';
  const path = `/v1.0/devices/${deviceId}/status`;
  
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
    
    if (response.status === 200 && response.data.success) {
      const status = response.data.result;
      console.log('✅ Device status retrieved:');
      
      status.forEach(item => {
        console.log(`   ${item.code}: ${item.value} ${item.type ? `(${item.type})` : ''}`);
      });
      
      return status;
    } else {
      console.error('❌ Failed to get device status:');
      console.error('   Status:', response.status);
      console.error('   Response:', JSON.stringify(response.data, null, 2));
      return [];
    }
  } catch (error) {
    console.error('❌ Error getting device status:', error.message);
    return [];
  }
}

// Main test function
async function runTuyaTest() {
  console.log('🔌 Maestro Energy Management - Tuya API Test');
  console.log('===========================================\n');
  
  console.log('📋 Configuration:');
  console.log(`   Client ID: ${TUYA_CLIENT_ID}`);
  console.log(`   Base URL: ${TUYA_BASE_URL}`);
  console.log(`   Secret: ${TUYA_CLIENT_SECRET.substring(0, 8)}...`);
  
  // Step 1: Get access token
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.log('\n❌ Cannot proceed without access token');
    return;
  }
  
  // For this test, we need a user ID. Since we don't have OAuth flow,
  // let's try to get devices with a placeholder UID or use device discovery
  console.log('\n⚠️  Note: To get actual devices, you need to:');
  console.log('   1. Link your Tuya app account in the Tuya IoT Platform');
  console.log('   2. Use the OAuth flow to get a real user ID');
  console.log('   3. Or use device discovery endpoints');
  
  // Let's try device discovery if available
  console.log('\n🔍 Trying device discovery...');
  
  try {
    // Try to get device list without specific UID (some endpoints support this)
    const timestamp = Date.now().toString();
    const nonce = Math.random().toString(36).substring(7);
    const method = 'GET';
    const path = '/v1.0/devices';
    
    const signature = generateSignature(TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, timestamp, nonce, method, path);
    
    const headers = {
      'client_id': TUYA_CLIENT_ID,
      'access_token': accessToken,
      't': timestamp,
      'sign_method': 'HMAC-SHA256',
      'nonce': nonce,
      'sign': signature
    };

    const response = await makeRequest(method, path, null, headers);
    
    if (response.status === 200 && response.data.success) {
      console.log('✅ Device discovery successful');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    } else {
      console.log('⚠️  Device discovery response:');
      console.log('   Status:', response.status);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.log('⚠️  Device discovery error:', error.message);
  }
  
  console.log('\n✅ API Test Complete!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Link your Tuya Smart app account in Tuya IoT Platform');
  console.log('   2. Set up OAuth flow in your app');
  console.log('   3. Use the full Maestro system to control devices');
}

// Run the test
if (require.main === module) {
  runTuyaTest().catch(console.error);
}

module.exports = {
  getAccessToken,
  getUserDevices,
  controlDevice,
  getDeviceStatus
};