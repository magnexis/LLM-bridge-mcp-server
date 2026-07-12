export class BridgeError extends Error { constructor(message: string, readonly code: string) { super(message); this.name = new.target.name; } }
export class ConfigurationError extends BridgeError { constructor(message: string) { super(message, "CONFIGURATION_ERROR"); } }
export class ApiAuthenticationError extends BridgeError { constructor(message = "Provider authentication failed.") { super(message, "API_AUTHENTICATION_ERROR"); } }
export class ApiRateLimitError extends BridgeError { constructor(message = "Provider rate limit reached.") { super(message, "API_RATE_LIMIT_ERROR"); } }
export class ApiTimeoutError extends BridgeError { constructor(message = "Provider request timed out.") { super(message, "API_TIMEOUT_ERROR"); } }
export class ProviderResponseError extends BridgeError { constructor(message: string, readonly status?: number) { super(message, "PROVIDER_RESPONSE_ERROR"); } }
export class LocalFileError extends BridgeError { constructor(message: string) { super(message, "LOCAL_FILE_ERROR"); } }
export class UnsupportedImageError extends BridgeError { constructor(message: string) { super(message, "UNSUPPORTED_IMAGE_ERROR"); } }
export class InputValidationError extends BridgeError { constructor(message: string) { super(message, "VALIDATION_ERROR"); } }
export class ApprovalRequiredError extends BridgeError { constructor(message="Explicit approval is required before this operation can run.") { super(message,"APPROVAL_REQUIRED"); } }
