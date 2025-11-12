/**
 * Input validation utilities for CLI commands
 */

/**
 * Validates an email address format
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validates an ISO 8601 date string
 * @param dateStr - Date string to validate
 * @returns true if valid ISO date, false otherwise
 */
export function validateISODate(dateStr: string): boolean {
	if (!dateStr) return false;
	const date = new Date(dateStr);
	return !isNaN(date.getTime());
}

/**
 * Validates a positive integer
 * @param value - Value to validate
 * @returns true if positive integer, false otherwise
 */
export function validatePositiveInteger(value: any): boolean {
	const num = parseInt(String(value), 10);
	return !isNaN(num) && num > 0 && num === parseFloat(String(value));
}

/**
 * Validates a non-negative integer
 * @param value - Value to validate
 * @returns true if non-negative integer, false otherwise
 */
export function validateNonNegativeInteger(value: any): boolean {
	const num = parseInt(String(value), 10);
	return !isNaN(num) && num >= 0 && num === parseFloat(String(value));
}

/**
 * Validates that a string is not empty after trimming
 * @param value - String to validate
 * @returns true if non-empty, false otherwise
 */
export function validateNonEmptyString(value: string): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates a URL format
 * @param url - URL to validate
 * @returns true if valid URL, false otherwise
 */
export function validateURL(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validates a GitHub repository URL
 * @param url - GitHub URL to validate
 * @returns true if valid GitHub URL, false otherwise
 */
export function validateGitHubURL(url: string): boolean {
	if (!validateURL(url)) return false;
	try {
		const parsed = new URL(url);
		return parsed.hostname === "github.com" && parsed.pathname.split("/").filter(Boolean).length >= 2;
	} catch {
		return false;
	}
}

/**
 * Validates that a value is one of the allowed options
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @returns true if value is in allowed values, false otherwise
 */
export function validateEnum<T>(value: T, allowedValues: readonly T[]): boolean {
	return allowedValues.includes(value);
}

/**
 * Throws an error if validation fails
 * @param condition - Validation condition
 * @param message - Error message to throw if validation fails
 */
export function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

/**
 * Validates and parses a numeric CLI option
 * @param value - String value from CLI
 * @param min - Minimum allowed value (optional)
 * @param max - Maximum allowed value (optional)
 * @returns Parsed number
 * @throws Error if invalid
 */
export function parseNumericOption(value: string, min?: number, max?: number): number {
	const num = parseInt(value, 10);

	if (isNaN(num)) {
		throw new Error(`Invalid number: ${value}`);
	}

	if (min !== undefined && num < min) {
		throw new Error(`Value must be at least ${min}, got ${num}`);
	}

	if (max !== undefined && num > max) {
		throw new Error(`Value must be at most ${max}, got ${num}`);
	}

	return num;
}

/**
 * Validates a file path exists (for file system operations)
 * @param filePath - Path to validate
 * @returns true if path appears valid (basic check), false otherwise
 */
export function validateFilePath(filePath: string): boolean {
	// Basic validation - just check it's not empty and doesn't have invalid characters
	if (!validateNonEmptyString(filePath)) return false;

	// Check for null bytes which are invalid in file paths
	if (filePath.includes("\0")) return false;

	return true;
}
