const https = require('https');

/**
 * Shared HTTP service for making API requests.
 * @param {string} url - The full URL to request.
 * @param {object} options - Request options.
 * @param {string} [options.method='GET'] - HTTP method.
 * @param {object} [options.headers={}] - HTTP headers.
 * @param {object} [options.body=null] - Request body (will be JSON stringified).
 * @param {number} [options.timeout=30000] - Request timeout in ms.
 * @param {string} [options.errorMessagePrefix='API error'] - Prefix for error messages.
 * @returns {Promise<any>} - Parsed JSON response or raw data.
 */
async function request(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeout = 30000,
    errorMessagePrefix = 'API error'
  } = options;

  const urlObj = new URL(url);

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          // Try to parse error message from body (common API pattern)
          try {
            const errorBody = JSON.parse(data);
            if (errorBody.error && errorBody.error.message) {
              reject(new Error(`${errorMessagePrefix}: ${errorBody.error.message}`));
              return;
            }
            // Sometimes error is just { message: ... }
            if (errorBody.message) {
              reject(new Error(`${errorMessagePrefix}: ${errorBody.message}`));
              return;
            }
          } catch (e) {
            // Ignore parse error
          }
          reject(new Error(`${errorMessagePrefix}: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`${errorMessagePrefix}: request timeout`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

module.exports = { request };
