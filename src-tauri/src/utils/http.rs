use reqwest::{Client, header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE}};
use serde::de::DeserializeOwned;
use std::time::Duration;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum HttpError {
    #[error("Request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("Invalid header value: {0}")]
    InvalidHeader(String),
    #[error("API error: {status} - {message}")]
    ApiError { status: u16, message: String },
}

pub struct HttpClient {
    client: Client,
}

impl HttpClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    pub fn with_timeout(timeout_secs: u64) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .build()
            .expect("Failed to create HTTP client");
        Self { client }
    }

    fn create_headers(&self, auth: Option<&AuthType>) -> Result<HeaderMap, HttpError> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if let Some(auth) = auth {
            match auth {
                AuthType::Bearer(token) => {
                    let value = format!("Bearer {}", token);
                    headers.insert(
                        AUTHORIZATION,
                        HeaderValue::from_str(&value)
                            .map_err(|_| HttpError::InvalidHeader("Invalid bearer token".into()))?,
                    );
                }
                AuthType::Basic { username, password } => {
                    let credentials = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        format!("{}:{}", username, password),
                    );
                    let value = format!("Basic {}", credentials);
                    headers.insert(
                        AUTHORIZATION,
                        HeaderValue::from_str(&value)
                            .map_err(|_| HttpError::InvalidHeader("Invalid basic auth".into()))?,
                    );
                }
                AuthType::ApiKey { header, value } => {
                    headers.insert(
                        reqwest::header::HeaderName::from_bytes(header.as_bytes())
                            .map_err(|_| HttpError::InvalidHeader("Invalid header name".into()))?,
                        HeaderValue::from_str(value)
                            .map_err(|_| HttpError::InvalidHeader("Invalid API key".into()))?,
                    );
                }
            }
        }

        Ok(headers)
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        url: &str,
        auth: Option<&AuthType>,
    ) -> Result<T, HttpError> {
        let headers = self.create_headers(auth)?;
        let response = self.client.get(url).headers(headers).send().await?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(HttpError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        Ok(response.json().await?)
    }

    pub async fn post<T: DeserializeOwned, B: serde::Serialize>(
        &self,
        url: &str,
        body: &B,
        auth: Option<&AuthType>,
    ) -> Result<T, HttpError> {
        let headers = self.create_headers(auth)?;
        let response = self.client.post(url).headers(headers).json(body).send().await?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(HttpError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        Ok(response.json().await?)
    }

    pub async fn put<T: DeserializeOwned, B: serde::Serialize>(
        &self,
        url: &str,
        body: &B,
        auth: Option<&AuthType>,
    ) -> Result<T, HttpError> {
        let headers = self.create_headers(auth)?;
        let response = self.client.put(url).headers(headers).json(body).send().await?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(HttpError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        Ok(response.json().await?)
    }

    pub async fn delete(&self, url: &str, auth: Option<&AuthType>) -> Result<(), HttpError> {
        let headers = self.create_headers(auth)?;
        let response = self.client.delete(url).headers(headers).send().await?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(HttpError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        Ok(())
    }

    pub async fn get_text(&self, url: &str, auth: Option<&AuthType>) -> Result<String, HttpError> {
        let headers = self.create_headers(auth)?;
        let response = self.client.get(url).headers(headers).send().await?;

        let status = response.status();
        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(HttpError::ApiError {
                status: status.as_u16(),
                message,
            });
        }

        Ok(response.text().await?)
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new()
    }
}

pub enum AuthType {
    Bearer(String),
    Basic { username: String, password: String },
    ApiKey { header: String, value: String },
}
