const fs = {
  existsSync: jest.fn(),
  statSync: jest.fn(() => ({ isFile: jest.fn(), isDirectory: jest.fn() })),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  ensureDirSync: jest.fn(),
  mkdirSync: jest.fn(),
  removeSync: jest.fn(),
  readdirSync: jest.fn(),
  readJsonSync: jest.fn(),
  writeJsonSync: jest.fn(),
  copySync: jest.fn(),
  moveSync: jest.fn()
};

module.exports = fs;