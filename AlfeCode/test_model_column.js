// Test script to verify the model column addition
console.log('Testing the addition of model column to alfecode_runs table...\n');

// Check if the RdsStore file contains expected changes
const fs = require('fs');
const filePath = './rds_store.js';
const content = fs.readFileSync(filePath, 'utf8');

// Tests
let allTestsPassed = true;

// Test 1: Check if the CREATE TABLE statement includes the model column
const hasModelInCreateTable = content.includes('model TEXT DEFAULT \'\'') && 
                              content.includes('CREATE TABLE IF NOT EXISTS alfecode_runs');
if (hasModelInCreateTable) {
    console.log('✅ Test 1 PASSED: CREATE TABLE statement includes model column');
} else {
    console.log('❌ Test 1 FAILED: CREATE TABLE statement does not include model column');
    allTestsPassed = false;
}

// Test 2: Check if the ALTER TABLE statement exists to add model column
const hasAlterTable = content.includes('ALTER TABLE alfecode_runs') && 
                     content.includes('ADD COLUMN IF NOT EXISTS model TEXT DEFAULT');
if (hasAlterTable) {
    console.log('✅ Test 2 PASSED: ALTER TABLE statement exists to add model column to existing databases');
} else {
    console.log('❌ Test 2 FAILED: ALTER TABLE statement does not exist');
    allTestsPassed = false;
}

// Test 3: Check if INSERT query includes model in the VALUES clause
const hasModelInInsert = content.includes('session_id, run_id, numeric_id, status, final_output_message, created_at, updated_at, payload_json, model)') &&
                        content.includes('JSON.stringify(run),\n            model,');
if (hasModelInInsert) {
    console.log('✅ Test 3 PASSED: INSERT query includes model column');
} else {
    console.log('❌ Test 3 FAILED: INSERT query does not include model column');
    allTestsPassed = false;
}

// Test 4: Check if the model value extraction is present
const hasModelValueExtraction = content.includes('const model = typeof run.model === "string" ? run.model : "";');
if (hasModelValueExtraction) {
    console.log('✅ Test 4 PASSED: Model value extraction logic is present');
} else {
    console.log('❌ Test 4 FAILED: Model value extraction logic is missing');
    allTestsPassed = false;
}

console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
    console.log('🎉 All tests PASSED! The model column has been successfully added.');
    console.log('\nSUMMARY OF CHANGES:');
    console.log('- Added model column to alfecode_runs table structure');
    console.log('- Included ALTER TABLE statement for existing deployments');
    console.log('- Updated INSERT query to include model column');
    console.log('- Added model value extraction logic'); 
} else {
    console.log('💥 Some tests FAILED! Please review the changes.');
}
console.log('='.repeat(50));