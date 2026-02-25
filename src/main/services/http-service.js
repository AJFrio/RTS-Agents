const https = require('https');

class HttpService {
  constructor(baseUrl, defaultHeaders = {}, serviceName = 'API') {
    this.baseUrl = baseUrl;
    this.defaultHeaders = defaultHeaders;
    this.serviceName = serviceName;
  }

  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      headers = {},
      query = {},
      timeout = 30000
    } = options;

    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add query params
    Object.keys(query).forEach(key => url.searchParams.append(key, query[key]));

    return new Promise((resolve, reject) => {
      const reqOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: method,
        headers: {
          ...this.defaultHeaders,
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
            // Try to parse error message from body
            try {
                const errorBody = JSON.parse(data);
                if (errorBody.error && errorBody.error.message) {
                    reject(new Error(`${this.serviceName} error: ${errorBody.error.message}`));
                } else if (errorBody.message) {
                    reject(new Error(`${this.serviceName} error: ${errorBody.message}`));
                } else {
                    reject(new Error(`${this.serviceName} error: ${res.statusCode} - ${data}`));
                }
            } catch (e) {
                reject(new Error(`${this.serviceName} error: ${res.statusCode} - ${data}`));
            }
          }
        });
      });

      req.on('error', reject);

      if (timeout) {
          req.setTimeout(timeout, () => {
            req.destroy();
            reject(new Error(`${this.serviceName} request timeout`));
          });
      }

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}

module.exports = HttpService;
