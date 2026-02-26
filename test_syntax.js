#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const serverFile = '/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772068408617/Aurora/src/server.js';

console.log('Testing syntax of server.js...');

try {
  // Read the file
  const content = fs.readFileSync(serverFile, 'utf8');
  console.log('✓ File read successfully');
  
  // Check for basic syntax issues
  const lines = content.split('\n');
  
  // Check for unmatched braces
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Count braces, parentheses, and brackets
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '(') parenCount++;
      else if (char === ')') parenCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }
  }
  
  console.log(`✓ Syntax check completed:`);
  console.log(`  - Total lines: ${lines.length}`);
  console.log(`  - Open braces: ${braceCount}`);
  console.log(`  - Open parentheses: ${parenCount}`);
  console.log(`  - Open brackets: ${bracketCount}`);
  
  if (braceCount === 0 && parenCount === 0 && bracketCount === 0) {
    console.log('✓ No unmatched braces, parentheses, or brackets found');
  } else {
    console.log('⚠ Potential unclosed brackets/braces found');
  }
  
  // Try to compile the module
  console.log('Testing Node.js compilation...');
  
  // Create a temporary file to test compilation
  const tempFile = '/tmp/test_compile.js';
  fs.writeFileSync(tempFile, `
    import * as fs from 'fs';
    import * as path from 'path';
    
    // Test if the server.js can be parsed by Node.js
    const serverContent = fs.readFileSync('${serverFile}', 'utf8');
    console.log('File content loaded successfully');
  `);
  
  // Use child_process to run syntax check
  const { execSync } = require('child_process');
  
  try {
    execSync(`node --check ${serverFile}`, { stdio: 'pipe' });
    console.log('✓ Node.js syntax check passed');
  } catch (error) {
    console.log('✗ Node.js syntax check failed:');
    console.log(error.stdout?.toString() || error.stderr?.toString() || error.message);
  }
  
  // Clean up
  try {
    fs.unlinkSync(tempFile);
  } catch (e) {
    // ignore
  }
  
} catch (error) {
  console.log('✗ Error reading or processing file:');
  console.log(error.message);
}