var fs = require('fs');
describe('Schematic', function() {
    it('Rewrites a test file', function() {
        var sourceFileLines = fs.readFileSync('test/eventtest.ts').toString().split('\n');
        var targetFileLines = fs.readFileSync('targetEventtest.ts').toString().split('\n');
        for(var i = 0; i < sourceFileLines.length; i++) {
            expect(sourceFileLines[i]).toBe(targetFileLines[i]);
        }
    });
});