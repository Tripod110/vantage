// Loads browser-global scripts into one shared vm context, the way <script> tags share globals.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

module.exports = function load(...files) {
  const context = vm.createContext({ URL, console });
  for (const f of files) vm.runInContext(readFileSync(join(__dirname, '..', f), 'utf8'), context, { filename: f });
  return context;
};
