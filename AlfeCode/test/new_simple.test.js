const fs = require('fs');

describe('Simple unit tests', () => {
    it('reads package.json and checks name field', () => {
        const pkg = JSON.parse(fs.readFileSync('AlfeCode/package.json', 'utf8'));
        expect(pkg).toBeDefined();
        expect(pkg.name).toMatch(/alfe-ai|alfe/);
    });

    it('basic math works', () => {
        expect(1 + 1).toBe(2);
    });
});
