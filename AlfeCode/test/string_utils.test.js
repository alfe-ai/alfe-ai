const {
    capitalize,
    removeWhitespace,
    isValidEmail,
    truncate,
    countOccurrences,
    toCamelCase,
    toKebabCase,
    generateRandomString,
    isPalindrome,
} = require("../executable/string_utils");

describe("string_utils", () => {
    describe("capitalize", () => {
        test("capitalizes first letter of a string", () => {
            expect(capitalize("hello")).toBe("Hello");
            expect(capitalize("world")).toBe("World");
        });

        test("converts rest of string to lowercase", () => {
            expect(capitalize("HELLO")).toBe("Hello");
            expect(capitalize("hELLo")).toBe("Hello");
        });

        test("handles single character strings", () => {
            expect(capitalize("a")).toBe("A");
            expect(capitalize("Z")).toBe("Z");
        });

        test("handles empty strings", () => {
            expect(capitalize("")).toBe("");
        });

        test("handles non-string inputs", () => {
            expect(capitalize(null)).toBe("");
            expect(capitalize(undefined)).toBe("");
            expect(capitalize(123)).toBe("");
            expect(capitalize({})).toBe("");
        });
    });

    describe("removeWhitespace", () => {
        test("removes all whitespace from string", () => {
            expect(removeWhitespace("hello world")).toBe("helloworld");
            expect(removeWhitespace("a b c")).toBe("abc");
        });

        test("removes multiple spaces", () => {
            expect(removeWhitespace("hello    world")).toBe("helloworld");
            expect(removeWhitespace("a   b   c")).toBe("abc");
        });

        test("removes tabs and newlines", () => {
            expect(removeWhitespace("hello\tworld\n")).toBe("helloworld");
            expect(removeWhitespace("a\nb\tc")).toBe("abc");
        });

        test("handles empty strings", () => {
            expect(removeWhitespace("")).toBe("");
        });

        test("handles non-string inputs", () => {
            expect(removeWhitespace(null)).toBe("");
            expect(removeWhitespace(undefined)).toBe("");
            expect(removeWhitespace(123)).toBe("");
        });
    });

    describe("isValidEmail", () => {
        test("validates correct email addresses", () => {
            expect(isValidEmail("user@example.com")).toBe(true);
            expect(isValidEmail("test.email@domain.org")).toBe(true);
            expect(isValidEmail("user123@test-domain.co.uk")).toBe(true);
        });

        test("rejects invalid email addresses", () => {
            expect(isValidEmail("invalid-email")).toBe(false);
            expect(isValidEmail("@example.com")).toBe(false);
            expect(isValidEmail("user@")).toBe(false);
            expect(isValidEmail("user example.com")).toBe(false);
            expect(isValidEmail("user@ex ample.com")).toBe(false);
        });

        test("handles empty strings", () => {
            expect(isValidEmail("")).toBe(false);
        });

        test("handles non-string inputs", () => {
            expect(isValidEmail(null)).toBe(false);
            expect(isValidEmail(undefined)).toBe(false);
            expect(isValidEmail(123)).toBe(false);
        });
    });

    describe("truncate", () => {
        test("truncates string to specified length with ellipsis", () => {
            expect(truncate("Hello World", 5)).toBe("He...");
            expect(truncate("Test string", 4)).toBe("T...");
        });

        test("adds ellipsis when string is longer than max length", () => {
            const result = truncate("Hello World", 8);
            expect(result).toBe("Hello...");
            expect(result.length).toBe(8);
        });

        test("uses custom ellipsis", () => {
            const result = truncate("Hello World", 10, " [..]");
            expect(result).toBe("Hello [..]");
            expect(result.length).toBe(10);
        });

        test("returns original string if shorter than max length", () => {
            expect(truncate("Hello", 10)).toBe("Hello");
            expect(truncate("Test", 5)).toBe("Test");
        });

        test("handles empty strings", () => {
            expect(truncate("", 5)).toBe("");
        });

        test("handles non-string inputs", () => {
            expect(truncate(null, 5)).toBe("");
            expect(truncate(undefined, 5)).toBe("");
            expect(truncate(123, 5)).toBe("");
        });

        test("handles max length shorter than ellipsis", () => {
            expect(truncate("Hello World", 2, "...")).toBe("..");
            expect(truncate("Hello World", 1, "...")).toBe(".");
        });
    });

    describe("countOccurrences", () => {
        test("counts single occurrence", () => {
            expect(countOccurrences("hello world", "world")).toBe(1);
            expect(countOccurrences("test", "t")).toBe(2);
        });

        test("counts multiple occurrences", () => {
            expect(countOccurrences("hello hello hello", "hello")).toBe(3);
            expect(countOccurrences("aaaa", "aa")).toBe(3);
        });

        test("handles overlapping matches", () => {
            expect(countOccurrences("aaaa", "aa")).toBe(3);
            expect(countOccurrences("ababa", "aba")).toBe(2); // Overlapping matches
        });

        test("returns 0 for empty search string", () => {
            expect(countOccurrences("hello", "")).toBe(0);
            expect(countOccurrences("", "")).toBe(0);
        });

        test("handles non-string inputs", () => {
            expect(countOccurrences(null, "test")).toBe(0);
            expect(countOccurrences("test", null)).toBe(0);
            expect(countOccurrences(null, null)).toBe(0);
        });
    });

    describe("toCamelCase", () => {
        test("converts string to camelCase", () => {
            expect(toCamelCase("hello world")).toBe("helloWorld");
            expect(toCamelCase("test-string")).toBe("testString");
            expect(toCamelCase("some_variable_name")).toBe("someVariableName");
        });

        test("handles multiple separators", () => {
            expect(toCamelCase("hello--world")).toBe("helloWorld");
            expect(toCamelCase("hello  world")).toBe("helloWorld");
            expect(toCamelCase("hello___world")).toBe("helloWorld");
        });

        test("handles special characters", () => {
            expect(toCamelCase("hello@world#test")).toBe("helloWorldTest");
            expect(toCamelCase("test$%^&*()value")).toBe("testValue");
        });

        test("handles empty strings", () => {
            expect(toCamelCase("")).toBe("");
        });

        test("handles single words", () => {
            expect(toCamelCase("hello")).toBe("hello");
            expect(toCamelCase("TEST")).toBe("test");
        });

        test("handles non-string inputs", () => {
            expect(toCamelCase(null)).toBe("");
            expect(toCamelCase(undefined)).toBe("");
            expect(toCamelCase(123)).toBe("");
        });
    });

    describe("toKebabCase", () => {
        test("converts string to kebab-case", () => {
            expect(toKebabCase("hello world")).toBe("hello-world");
            expect(toKebabCase("testString")).toBe("teststring");
            expect(toKebabCase("Some Variable Name")).toBe("some-variable-name");
        });

        test("handles multiple spaces and separators", () => {
            expect(toKebabCase("hello  world")).toBe("hello-world");
            expect(toKebabCase("hello--world")).toBe("hello-world");
            expect(toKebabCase("hello___world")).toBe("hello-world");
        });

        test("removes special characters", () => {
            expect(toKebabCase("hello@world#test")).toBe("helloworldtest");
            expect(toKebabCase("test$%^&*()value")).toBe("testvalue");
        });

        test("handles empty strings", () => {
            expect(toKebabCase("")).toBe("");
        });

        test("handles single words", () => {
            expect(toKebabCase("hello")).toBe("hello");
            expect(toKebabCase("TEST")).toBe("test");
        });

        test("handles non-string inputs", () => {
            expect(toKebabCase(null)).toBe("");
            expect(toKebabCase(undefined)).toBe("");
            expect(toKebabCase(123)).toBe("");
        });
    });

    describe("generateRandomString", () => {
        test("generates string of specified length", () => {
            const result = generateRandomString(10);
            expect(result).toHaveLength(10);
            expect(typeof result).toBe("string");
        });

        test("generates different strings on multiple calls", () => {
            const result1 = generateRandomString(10);
            const result2 = generateRandomString(10);
            expect(result1).not.toBe(result2);
        });

        test("contains only alphanumeric characters", () => {
            const result = generateRandomString(100);
            expect(result).toMatch(/^[A-Za-z0-9]+$/);
        });

        test("handles invalid length parameters", () => {
            expect(generateRandomString(0)).toBe("");
            expect(generateRandomString(-5)).toBe("");
            expect(generateRandomString(null)).toBe("");
            expect(generateRandomString(undefined)).toBe("");
            expect(generateRandomString("5")).toBe("");
        });
    });

    describe("isPalindrome", () => {
        test("identifies simple palindromes", () => {
            expect(isPalindrome("racecar")).toBe(true);
            expect(isPalindrome("level")).toBe(true);
            expect(isPalindrome("madam")).toBe(true);
        });

        test("identifies non-palindromes", () => {
            expect(isPalindrome("hello")).toBe(false);
            expect(isPalindrome("world")).toBe(false);
            expect(isPalindrome("test")).toBe(false);
        });

        test("ignores case", () => {
            expect(isPalindrome("RaceCar")).toBe(true);
            expect(isPalindrome("LEVEL")).toBe(true);
        });

        test("ignores non-alphanumeric characters", () => {
            expect(isPalindrome("A man a plan a canal Panama")).toBe(true);
            expect(isPalindrome("race a car")).toBe(false);
            expect(isPalindrome("Was it a car or a cat I saw?")).toBe(true);
        });

        test("handles single characters", () => {
            expect(isPalindrome("a")).toBe(true);
            expect(isPalindrome("A")).toBe(true);
            expect(isPalindrome("1")).toBe(true);
        });

        test("handles empty strings", () => {
            expect(isPalindrome("")).toBe(true);
        });

        test("handles non-string inputs", () => {
            expect(isPalindrome(null)).toBe(false);
            expect(isPalindrome(undefined)).toBe(false);
            expect(isPalindrome(123)).toBe(false);
        });
    });
});