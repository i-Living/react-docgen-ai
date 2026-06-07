// Mock for fs-extra — auto-mocked by jest
const mockFs = jest.createMockFromModule('fs-extra');

// Override specific functions that need special handling
mockFs.existsSync = jest.fn().mockReturnValue(true);
mockFs.statSync = jest.fn().mockReturnValue({
  isFile: jest.fn().mockReturnValue(true),
  isDirectory: jest.fn().mockReturnValue(false),
});
mockFs.readFileSync = jest.fn().mockReturnValue('');
mockFs.writeFileSync = jest.fn();
mockFs.ensureDirSync = jest.fn();
mockFs.mkdirSync = jest.fn();
mockFs.removeSync = jest.fn();
mockFs.readdirSync = jest.fn().mockReturnValue([]);

module.exports = mockFs;
