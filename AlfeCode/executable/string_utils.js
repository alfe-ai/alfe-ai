/**
 * String utility functions for common operations
 */

/**
 * Capitalizes the first letter of a string
 * @param {string} str - The string to capitalize
 * @returns {string} - The capitalized string
 */
function capitalize(str) {
    if (typeof str !== "string") {
        return "";
    }
    if (str.length === 0) {
        return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Removes all whitespace from a string
 * @param {string} str - The string to clean
 * @returns {string} - The string with whitespace removed
 */
function removeWhitespace(str) {
    if (typeof str !== "string") {
        return "";
    }
    return str.replace(/\s+/g, "");
}

/**
 * Checks if a string is a valid email address
 * @param {string} email - The email to validate
 * @returns {boolean} - True if valid email, false otherwise
 */
function isValidEmail(email) {
    if (typeof email !== "string") {
        return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Truncates a string to a specified length with ellipsis
 * @param {string} str - The string to truncate
 * @param {number} maxLength - The maximum length
 * @param {string} ellipsis - The ellipsis to append (default: "...")
 * @returns {string} - The truncated string
 */
function truncate(str, maxLength, ellipsis = "...") {
    if (typeof str !== "string") {
        return "";
    }
    if (str.length <= maxLength) {
        return str;
    }
    const ellipsisLength = ellipsis.length;
    if (maxLength <= ellipsisLength) {
        return ellipsis.substring(0, maxLength);
    }
    return str.substring(0, maxLength - ellipsisLength) + ellipsis;
}

/**
 * Counts the occurrences of a substring in a string
 * @param {string} str - The string to search in
 * @param {string} search - The substring to search for
 * @returns {number} - The number of occurrences
 */
function countOccurrences(str, search) {
    if (typeof str !== "string" || typeof search !== "string") {
        return 0;
    }
    if (search.length === 0) {
        return 0;
    }
    let count = 0;
    let pos = 0;
    while (pos < str.length) {
        const foundPos = str.indexOf(search, pos);
        if (foundPos !== -1) {
            count++;
            // For overlapping matches, move by 1
            // For non-overlapping matches, move by search.length
            // We'll use a simple approach: if the search string is found at a position
            // where it could overlap with the previous match, move by 1
            pos = foundPos + 1;
        } else {
            break;
        }
    }
    return count;
}

/**
 * Converts a string to camelCase
 * @param {string} str - The string to convert
 * @returns {string} - The camelCase string
 */
function toCamelCase(str) {
    if (typeof str !== "string") {
        return "";
    }
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (match, char) => char.toUpperCase());
}

/**
 * Converts a string to kebab-case
 * @param {string} str - The string to convert
 * @returns {string} - The kebab-case string
 */
function toKebabCase(str) {
    if (typeof str !== "string") {
        return "";
    }
    return str
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[-_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
}

/**
 * Generates a random string of specified length
 * @param {number} length - The length of the string
 * @returns {string} - The random string
 */
function generateRandomString(length) {
    if (typeof length !== "number" || length <= 0) {
        return "";
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Checks if a string is a palindrome
 * @param {string} str - The string to check
 * @returns {boolean} - True if palindrome, false otherwise
 */
function isPalindrome(str) {
    if (typeof str !== "string") {
        return false;
    }
    const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleaned === cleaned.split("").reverse().join("");
}

module.exports = {
    capitalize,
    removeWhitespace,
    isValidEmail,
    truncate,
    countOccurrences,
    toCamelCase,
    toKebabCase,
    generateRandomString,
    isPalindrome,
};