const https = require('https');
const http = require('http');
const { URL } = require('url');

class HttpService {
  /**
   * Make an HTTP request
   * @param {string} url - Full URL
   * @param {object} options - Request options
   * @param {string} options.method - HTTP method (default: GET)
   * @param {object} options.headers - HTTP headers
   * @param {object} options.body - Request body (will be JSON stringified if it's an object)
   * @param {number} options.timeout - Timeout in ms (default: 30000)
   */
  async request(url, options = {}) {
    const { method = 'GET', headers = {}, body = null, timeout = 30000 } = options;

    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const requestModule = urlObj.protocol === 'http:' ? http : https;

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: headers
      };

      const req = requestModule.request(reqOptions, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          // Attempt to parse JSON response if applicable or possible
          let parsedData = data;
          const contentType = res.headers['content-type'] || '';

          if (contentType.includes('application/json')) {
            try {
              parsedData = JSON.parse(data);
            } catch (e) {
              // Keep as string if parsing fails
            }
          } else {
            // Try parsing anyway as some APIs return JSON without correct content-type
            try {
               // Only try if it looks like JSON to avoid parsing numbers/booleans inadvertently
               if (data && (data.startsWith('{') || data.startsWith('['))) {
                 parsedData = JSON.parse(data);
               }
            } catch (e) {
               // Ignore
            }
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            // Attach status code and data to error for easier handling
            const error = new Error(`Request failed with status code ${res.statusCode}`);
            error.statusCode = res.statusCode;
            error.data = parsedData;
            reject(error);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (timeout) {
        req.setTimeout(timeout, () => {
          req.destroy();
          reject(new Error(`Request timeout after ${timeout}ms`));
        });
      }

      if (body) {
        if (typeof body === 'object' && !Buffer.isBuffer(body)) {
          req.write(JSON.stringify(body));
        } else {
          req.write(body);
        }
      }

      req.end();
    });
  }

  /**
   * Convenience method for JSON requests
   * sets Content-Type to application/json and handles body stringification
   */
  async requestJson(url, method = 'GET', body = null, headers = {}, timeout = 30000) {
    const jsonHeaders = {
        'Content-Type': 'application/json',
        ...headers
    };

    return this.request(url, {
        method,
        body,
        headers: jsonHeaders,
        timeout
    });
  }
}

module.exports = new HttpService();
