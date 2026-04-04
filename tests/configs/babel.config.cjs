// Babel-конфиг для Jest: транслирует ESM (export/import) → CJS (require/module.exports),
// чтобы Jest мог запускать ESM-файлы (calc.js) без --experimental-vm-modules.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};